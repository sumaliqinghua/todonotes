import http from "http";
import { app, Notification } from "electron";
import { TODO_NOTES_CALLBACK_PORT } from "./codexRunner";
import { updateTask, getTaskById } from "./db/tasksRepo";
import { isCodexProcessingBlock, updateBlockStatusInBlocks } from "../shared/blockStatus";
import { broadcast } from "./ipc/events";

let server: http.Server | null = null;
const activeNotifications = new Set<Notification>();

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req: http.IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
      if (body.length > 1024 * 1024) {
        reject(new Error("请求体过大"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function showAiNotification(title: string, body: string) {
  if (!Notification.isSupported()) {
    return;
  }
  if (process.platform === "darwin") {
    app.focus({ steal: false });
  }
  const notification = new Notification({ title, body, silent: false });
  activeNotifications.add(notification);
  const release = () => {
    activeNotifications.delete(notification);
  };
  notification.once("show", () => {
    setTimeout(release, 5000);
  });
  notification.once("failed", release);
  notification.show();
}

function updateCodexBlock(input: { taskId: string; blockId: string; sessionId?: string | null; status: "doing" | "waiting"; reason: string }) {
  const task = getTaskById(input.taskId);
  if (!task) {
    throw new Error("任务不存在");
  }
  if (!isCodexProcessingBlock(task.blocks, input.blockId)) {
    const nextTask = updateTask({
      id: task.id,
      codexSessionId: input.sessionId?.trim() || task.codexSessionId
    });
    broadcast("task:updated", { taskId: nextTask.id });
    return { task: nextTask, statusChanged: false };
  }
  const updated = updateBlockStatusInBlocks(task.blocks, input.blockId, {
    workStatus: input.status,
    workStatusUpdatedAt: Date.now(),
    plannedStartAt: null,
    plannedDurationMinutes: null,
    waitReason: input.reason,
    waitReviewAt: null
  });
  const nextTask = updateTask({
    id: task.id,
    blocks: updated.changed ? updated.blocks : task.blocks,
    codexSessionId: input.sessionId?.trim() || task.codexSessionId
  });
  broadcast("task:updated", { taskId: nextTask.id });
  return { task: nextTask, statusChanged: true };
}

async function handleCodexCallback(req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== "POST" || req.url !== "/codex/callback") {
    sendJson(res, 404, { ok: false, message: "not found" });
    return;
  }
  try {
    const body = await readBody(req);
    const payload = JSON.parse(body) as {
      event?: string;
      taskId?: string;
      blockId?: string;
      sessionId?: string;
      reason?: string;
    };
    if (payload.event === "session" && payload.taskId && payload.sessionId?.trim()) {
      const task = getTaskById(payload.taskId);
      if (!task) {
        throw new Error("任务不存在");
      }
      const nextTask = updateTask({ id: task.id, codexSessionId: payload.sessionId.trim() });
      broadcast("task:updated", { taskId: nextTask.id });
      showAiNotification("Codex 会话已绑定", nextTask.title);
      sendJson(res, 200, { ok: true });
      return;
    }
    if (!payload.taskId || !payload.blockId) {
      throw new Error("缺少 taskId 或 blockId");
    }
    if (payload.event === "done") {
      const result = updateCodexBlock({
        taskId: payload.taskId,
        blockId: payload.blockId,
        sessionId: payload.sessionId,
        status: "doing",
        reason: "AI已返回结果"
      });
      if (result.statusChanged) {
        showAiNotification("AI 已返回结果", result.task.title);
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    if (payload.event === "failed") {
      const result = updateCodexBlock({
        taskId: payload.taskId,
        blockId: payload.blockId,
        sessionId: payload.sessionId,
        status: "waiting",
        reason: payload.reason?.trim() || "失败"
      });
      if (result.statusChanged) {
        showAiNotification("AI 处理失败", result.task.title);
      }
      sendJson(res, 200, { ok: true });
      return;
    }
    throw new Error("未知事件");
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "回调处理失败";
    sendJson(res, 400, { ok: false, message });
  }
}

export function startCodexCallbackServer() {
  if (server) {
    return;
  }
  server = http.createServer((req, res) => {
    void handleCodexCallback(req, res);
  });
  server.listen(TODO_NOTES_CALLBACK_PORT, "127.0.0.1");
}

export function stopCodexCallbackServer() {
  server?.close();
  server = null;
}
