import { listDueReminders, markReminderDone } from "./db/remindersRepo";
import { listAllActiveStatusBlocks } from "./db/tasksRepo";
import { broadcast } from "./ipc/events";
import type { StatusBlock } from "../shared/types";
import { getPlannedEndAt, parseTimestamp } from "../shared/blockStatus";
import { showTaskNotification } from "./notificationActions";

let timer: NodeJS.Timeout | null = null;
const notifiedStatusKeys = new Set<string>();
const STATUS_FOLLOW_UP_DELAYS_MINUTES = [5, 10, 30, 60] as const;
let lastStatusCheckAt: number | null = null;

interface DueStatusNotification {
  key: string;
  title: string;
  body: string;
  taskId: string;
  blockId: string;
}

interface StatusCheckOptions {
  includeStatusFollowUps: boolean;
}

function statusNotificationDueAt(block: StatusBlock): number | null {
  if (block.workStatus === "todo") {
    return parseTimestamp(block.plannedStartAt);
  }
  if (block.workStatus === "doing") {
    return getPlannedEndAt({
      plannedStartAt: block.workStatusUpdatedAt,
      plannedDurationMinutes: block.plannedDurationMinutes
    });
  }
  if (block.workStatus === "waiting") {
    return parseTimestamp(block.waitReviewAt);
  }
  return null;
}

function formatTodoFollowUpTitle(delayMinutes: number): string {
  if (delayMinutes >= 60 && delayMinutes % 60 === 0) {
    return `待开始已逾期 ${delayMinutes / 60} 小时`;
  }
  return `待开始已逾期 ${delayMinutes} 分钟`;
}

function formatWaitingFollowUpTitle(delayMinutes: number): string {
  if (delayMinutes >= 60 && delayMinutes % 60 === 0) {
    return `等待回看已逾期 ${delayMinutes / 60} 小时`;
  }
  return `等待回看已逾期 ${delayMinutes} 分钟`;
}

function buildStatusFollowUpNotifications(
  block: StatusBlock,
  previousCheckAt: number | null,
  now: number
): DueStatusNotification[] {
  if (previousCheckAt === null) {
    return [];
  }
  const baseAt = block.workStatus === "todo" ? parseTimestamp(block.plannedStartAt) : parseTimestamp(block.waitReviewAt);
  if (baseAt === null || (block.workStatus !== "todo" && block.workStatus !== "waiting")) {
    return [];
  }
  const preview = block.blockContent || "未命名内容";
  const reason = block.workStatus === "waiting" && block.waitReason ? `（${block.waitReason}）` : "";
  return STATUS_FOLLOW_UP_DELAYS_MINUTES.flatMap((delayMinutes) => {
    const dueAt = baseAt + delayMinutes * 60 * 1000;
    if (previousCheckAt >= dueAt || dueAt > now) {
      return [];
    }
    const key = `${block.workStatus}-follow-up:${block.taskId}:${block.blockId}:${baseAt}:${delayMinutes}`;
    if (notifiedStatusKeys.has(key)) {
      return [];
    }
    return [{
      key,
      title: block.workStatus === "todo" ? formatTodoFollowUpTitle(delayMinutes) : formatWaitingFollowUpTitle(delayMinutes),
      body: `${block.taskTitle}: ${preview}${reason}`,
      taskId: block.taskId,
      blockId: block.blockId
    }];
  });
}

function buildStatusNotification(block: StatusBlock, now: number): DueStatusNotification | null {
  const dueAt = statusNotificationDueAt(block);
  if (dueAt === null || dueAt > now) {
    return null;
  }
  const key = `${block.workStatus}:${block.taskId}:${block.blockId}:${dueAt}`;
  if (notifiedStatusKeys.has(key)) {
    return null;
  }
  const preview = block.blockContent || "未命名内容";
  if (block.workStatus === "todo") {
    return {
      key,
      title: "待开始时间到了",
      body: `${block.taskTitle}: ${preview}`,
      taskId: block.taskId,
      blockId: block.blockId
    };
  }
  if (block.workStatus === "doing") {
    return {
      key,
      title: "进行中已超时",
      body: `${block.taskTitle}: ${preview}`,
      taskId: block.taskId,
      blockId: block.blockId
    };
  }
  if (block.workStatus === "waiting") {
    const reason = block.waitReason ? `（${block.waitReason}）` : "";
    return {
      key,
      title: "等待回看时间到了",
      body: `${block.taskTitle}: ${preview}${reason}`,
      taskId: block.taskId,
      blockId: block.blockId
    };
  }
  return null;
}

function checkDueStatusBlocks(now: number, options: StatusCheckOptions = { includeStatusFollowUps: true }) {
  const previousCheckAt = lastStatusCheckAt;
  const dueNotifications = listAllActiveStatusBlocks().flatMap((block) => {
    const notifications: DueStatusNotification[] = [];
    const statusNotification = buildStatusNotification(block, now);
    if (statusNotification) {
      notifications.push(statusNotification);
    }
    if (options.includeStatusFollowUps) {
      notifications.push(...buildStatusFollowUpNotifications(block, previousCheckAt, now));
    }
    return notifications;
  });
  dueNotifications.forEach((item) => {
    showTaskNotification({ title: item.title, body: item.body, taskId: item.taskId, blockId: item.blockId });
    notifiedStatusKeys.add(item.key);
  });
  lastStatusCheckAt = now;
}

export function __test_checkDueStatusBlocks(now: number) {
  checkDueStatusBlocks(now);
}

export function __test_checkDueStatusBlocksOnStartup(now: number) {
  checkDueStatusBlocks(now, { includeStatusFollowUps: false });
}

function checkDueReminders(now: number) {
  const due = listDueReminders(now);
  if (due.length > 0) {
    broadcast("reminder:trigger", { reminders: due });
    due.forEach((reminder) => {
      showTaskNotification({ title: "到期提醒", body: `任务 ${reminder.taskId.slice(0, 6)} 有提醒到期`, taskId: reminder.taskId });
      markReminderDone(reminder.id);
    });
  }
}

export function startReminderScheduler() {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    const now = Date.now();
    checkDueReminders(now);
    checkDueStatusBlocks(now);
  }, 60 * 1000);
}

export function stopReminderScheduler() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function checkOverdueOnStartup() {
  const now = Date.now();
  checkDueReminders(now);
  checkDueStatusBlocks(now, { includeStatusFollowUps: false });
}
