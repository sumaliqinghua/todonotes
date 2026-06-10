import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StatusBlock } from "../../../shared/types";

const notificationShow = vi.fn();
const listAllActiveStatusBlocks = vi.fn<[], StatusBlock[]>();

vi.mock("electron", () => ({
  app: {
    focus: vi.fn()
  },
  Notification: class {
    static isSupported() {
      return true;
    }

    title: string;
    body: string;

    constructor(options: { title: string; body: string }) {
      this.title = options.title;
      this.body = options.body;
    }

    once() {
      return this;
    }

    show() {
      notificationShow({ title: this.title, body: this.body });
    }
  }
}));

vi.mock("../../../main/db/tasksRepo", () => ({
  listAllActiveStatusBlocks
}));

vi.mock("../../../main/db/remindersRepo", () => ({
  listDueReminders: () => [],
  markReminderDone: vi.fn()
}));

vi.mock("../../../main/ipc/events", () => ({
  broadcast: vi.fn()
}));

describe("status notification scheduler", () => {
  const now = new Date("2026-04-27T10:00:00+08:00").getTime();

  beforeEach(() => {
    vi.resetModules();
    notificationShow.mockReset();
    listAllActiveStatusBlocks.mockReset();
  });

  it("待开始、进行中超时、等待回看到点时发送系统通知", async () => {
    listAllActiveStatusBlocks.mockReturnValue([
      {
        taskId: "task-1",
        taskTitle: "项目A",
        blockId: "todo",
        blockType: "paragraph",
        blockContent: "开始写方案",
        workStatus: "todo",
        plannedStartAt: now,
        plannedDurationMinutes: 25
      },
      {
        taskId: "task-2",
        taskTitle: "项目B",
        blockId: "doing",
        blockType: "paragraph",
        blockContent: "实现接口",
        workStatus: "doing",
        workStatusUpdatedAt: now - 30 * 60 * 1000,
        plannedDurationMinutes: 25
      },
      {
        taskId: "task-3",
        taskTitle: "项目C",
        blockId: "waiting",
        blockType: "paragraph",
        blockContent: "等客户确认",
        workStatus: "waiting",
        waitReason: "客户确认",
        waitReviewAt: now
      }
    ]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "待开始时间到了", body: "项目A: 开始写方案" },
      { title: "进行中已超时", body: "项目B: 实现接口" },
      { title: "等待回看时间到了", body: "项目C: 等客户确认（客户确认）" }
    ]);
  });

  it("同一个状态到点只通知一次，未来时间不通知", async () => {
    const dueBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "todo",
      blockType: "paragraph",
      blockContent: "开始写方案",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    };
    const futureBlock: StatusBlock = {
      taskId: "task-2",
      taskTitle: "项目B",
      blockId: "waiting",
      blockType: "paragraph",
      blockContent: "等客户确认",
      workStatus: "waiting",
      waitReviewAt: now + 10 * 60 * 1000
    };
    listAllActiveStatusBlocks.mockReturnValue([dueBlock, futureBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now);
    __test_checkDueStatusBlocks(now + 60 * 1000);

    expect(notificationShow).toHaveBeenCalledTimes(1);
    expect(notificationShow).toHaveBeenCalledWith({ title: "待开始时间到了", body: "项目A: 开始写方案" });
  });

  it("应用运行中待开始超过 5 分钟仍未开始时发送一次分段提醒", async () => {
    const todoBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "todo",
      blockType: "paragraph",
      blockContent: "开始写方案",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    };
    listAllActiveStatusBlocks.mockReturnValue([todoBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    __test_checkDueStatusBlocks(now + 5 * 60 * 1000);
    __test_checkDueStatusBlocks(now + 6 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "待开始已逾期 5 分钟", body: "项目A: 开始写方案" }
    ]);
  });

  it("应用运行中一次扫描跨过多个待开始分段阈值时按阈值顺序提醒", async () => {
    const todoBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "todo",
      blockType: "paragraph",
      blockContent: "开始写方案",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    };
    listAllActiveStatusBlocks.mockReturnValue([todoBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    __test_checkDueStatusBlocks(now + 31 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "待开始已逾期 5 分钟", body: "项目A: 开始写方案" },
      { title: "待开始已逾期 10 分钟", body: "项目A: 开始写方案" },
      { title: "待开始已逾期 30 分钟", body: "项目A: 开始写方案" }
    ]);
  });

  it("应用启动补查不会补发待开始 5/10/30/1h 分段提醒", async () => {
    const todoBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "todo",
      blockType: "paragraph",
      blockContent: "开始写方案",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    };
    listAllActiveStatusBlocks.mockReturnValue([todoBlock]);

    const { __test_checkDueStatusBlocks, __test_checkDueStatusBlocksOnStartup } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocksOnStartup(now + 61 * 60 * 1000);
    __test_checkDueStatusBlocks(now + 62 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "待开始时间到了", body: "项目A: 开始写方案" }
    ]);
  });

  it("待开始块已转为其他状态时不会发送待开始分段提醒", async () => {
    const todoBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "todo",
      blockType: "paragraph",
      blockContent: "开始写方案",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    };
    const doingBlock: StatusBlock = {
      ...todoBlock,
      workStatus: "doing",
      workStatusUpdatedAt: now + 4 * 60 * 1000,
      plannedStartAt: undefined,
      plannedDurationMinutes: undefined
    };
    listAllActiveStatusBlocks.mockReturnValue([todoBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    listAllActiveStatusBlocks.mockReturnValue([doingBlock]);
    __test_checkDueStatusBlocks(now + 5 * 60 * 1000);

    expect(notificationShow).not.toHaveBeenCalled();
  });

  it("应用运行中等待回看超过 5 分钟仍在等待中时发送一次分段提醒", async () => {
    const waitingBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "waiting",
      blockType: "paragraph",
      blockContent: "等客户确认",
      workStatus: "waiting",
      waitReason: "客户确认",
      waitReviewAt: now
    };
    listAllActiveStatusBlocks.mockReturnValue([waitingBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    __test_checkDueStatusBlocks(now + 5 * 60 * 1000);
    __test_checkDueStatusBlocks(now + 6 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "等待回看已逾期 5 分钟", body: "项目A: 等客户确认（客户确认）" }
    ]);
  });

  it("应用运行中一次扫描跨过多个等待回看分段阈值时按阈值顺序提醒", async () => {
    const waitingBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "waiting",
      blockType: "paragraph",
      blockContent: "等客户确认",
      workStatus: "waiting",
      waitReason: "客户确认",
      waitReviewAt: now
    };
    listAllActiveStatusBlocks.mockReturnValue([waitingBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    __test_checkDueStatusBlocks(now + 61 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "等待回看已逾期 5 分钟", body: "项目A: 等客户确认（客户确认）" },
      { title: "等待回看已逾期 10 分钟", body: "项目A: 等客户确认（客户确认）" },
      { title: "等待回看已逾期 30 分钟", body: "项目A: 等客户确认（客户确认）" },
      { title: "等待回看已逾期 1 小时", body: "项目A: 等客户确认（客户确认）" }
    ]);
  });

  it("应用启动补查不会补发等待回看 5/10/30/1h 分段提醒", async () => {
    const waitingBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "waiting",
      blockType: "paragraph",
      blockContent: "等客户确认",
      workStatus: "waiting",
      waitReason: "客户确认",
      waitReviewAt: now
    };
    listAllActiveStatusBlocks.mockReturnValue([waitingBlock]);

    const { __test_checkDueStatusBlocks, __test_checkDueStatusBlocksOnStartup } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocksOnStartup(now + 61 * 60 * 1000);
    __test_checkDueStatusBlocks(now + 62 * 60 * 1000);

    expect(notificationShow.mock.calls.map(([payload]) => payload)).toEqual([
      { title: "等待回看时间到了", body: "项目A: 等客户确认（客户确认）" }
    ]);
  });

  it("等待中已转为其他状态时不会发送等待回看分段提醒", async () => {
    const waitingBlock: StatusBlock = {
      taskId: "task-1",
      taskTitle: "项目A",
      blockId: "waiting",
      blockType: "paragraph",
      blockContent: "等客户确认",
      workStatus: "waiting",
      waitReason: "客户确认",
      waitReviewAt: now
    };
    const doingBlock: StatusBlock = {
      ...waitingBlock,
      workStatus: "doing",
      workStatusUpdatedAt: now + 4 * 60 * 1000,
      plannedDurationMinutes: 25,
      waitReason: undefined,
      waitReviewAt: undefined
    };
    listAllActiveStatusBlocks.mockReturnValue([waitingBlock]);

    const { __test_checkDueStatusBlocks } = await import("../../../main/reminderScheduler");
    __test_checkDueStatusBlocks(now + 4 * 60 * 1000);
    notificationShow.mockClear();
    listAllActiveStatusBlocks.mockReturnValue([doingBlock]);
    __test_checkDueStatusBlocks(now + 5 * 60 * 1000);

    expect(notificationShow).not.toHaveBeenCalled();
  });
});
