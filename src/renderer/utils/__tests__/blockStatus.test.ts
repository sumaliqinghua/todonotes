import { describe, expect, it } from "vitest";
import type { JsonValue, StatusBlock } from "../../../shared/types";
import {
  clearCodexStatusAttrsInBlocks,
  collectStatusBlocksFromTask,
  compareStatusBlocks,
  computeRemainingStatusDurationMinutes,
  formatStatusBadge,
  formatStatusOverrun,
  getPlannedEndAt,
  isCodexProcessingBlock,
  updateBlockStatusInBlocks
} from "../../../shared/blockStatus";

describe("blockStatus", () => {
  const now = new Date("2026-04-07T10:00:00+08:00").getTime();

  it("设置待开始时写入状态、预计开始和预计持续，并清理旧截止时间", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "block-1",
            dueAt: now + 60 * 60 * 1000
          },
          content: [{ type: "text", text: "写方案" }]
        }
      ]
    };

    const result = updateBlockStatusInBlocks(blocks, "block-1", {
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 45
    });

    expect(result.changed).toBe(true);
    expect((result.blocks as any).content[0].attrs).toMatchObject({
      id: "block-1",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 45
    });
    expect((result.blocks as any).content[0].attrs.dueAt).toBeUndefined();
  });

  it("进行中、等待中、已完成和清除状态会保留对应字段并清掉无关字段", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "block-1",
            workStatus: "todo",
            plannedStartAt: now,
            plannedDurationMinutes: 25,
            waitReason: "旧原因",
            waitReviewAt: now
          },
          content: [{ type: "text", text: "联系客户" }]
        }
      ]
    };

    const doing = updateBlockStatusInBlocks(blocks, "block-1", {
      workStatus: "doing",
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "",
      waitReviewAt: null
    });
    expect((doing.blocks as any).content[0].attrs).toMatchObject({
      workStatus: "doing",
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: null,
      waitReviewAt: null
    });

    const waiting = updateBlockStatusInBlocks(blocks, "block-1", {
      workStatus: "waiting",
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "客户确认",
      waitReviewAt: now + 30 * 60 * 1000
    });
    expect((waiting.blocks as any).content[0].attrs).toMatchObject({
      workStatus: "waiting",
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "客户确认",
      waitReviewAt: now + 30 * 60 * 1000
    });

    const done = updateBlockStatusInBlocks(blocks, "block-1", {
      workStatus: "done",
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "",
      waitReviewAt: null
    });
    expect((done.blocks as any).content[0].attrs.workStatus).toBe("done");

    const cleared = updateBlockStatusInBlocks(blocks, "block-1", {
      workStatus: null,
      workStatusUpdatedAt: null,
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: "",
      waitReviewAt: null
    });
    expect((cleared.blocks as any).content[0].attrs).toMatchObject({
      workStatus: null,
      workStatusUpdatedAt: null,
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: null,
      waitReviewAt: null
    });
  });

  it("格式化正文状态徽标和超计划文案", () => {
    expect(formatStatusBadge({ workStatus: "doing" }, now)).toBe("进行中");
    expect(formatStatusBadge({ workStatus: "doing", waitReason: "AI已返回结果", workStatusUpdatedAt: now - 12 * 60 * 1000 }, now)).toBe("进行中.AI已返回结果:12m");
    expect(formatStatusBadge({ workStatus: "doing", workStatusUpdatedAt: now, plannedDurationMinutes: 45 }, now + 10 * 60 * 1000)).toBe("进行中.45m.剩余:35m");
    expect(formatStatusBadge({ workStatus: "doing", workStatusUpdatedAt: now, plannedDurationMinutes: 10 }, now + 12 * 60 * 1000)).toBe("进行中.超时:2m");
    expect(formatStatusBadge({ workStatus: "waiting", waitReason: "客户确认" }, now)).toBe("等待: 客户确认");
    expect(
      formatStatusBadge(
        { workStatus: "waiting", waitReason: "客户确认", waitReviewAt: new Date("2026-04-07T15:00:00+08:00").getTime() },
        now
      )
    ).toBe("等待: 客户确认 · 15:00回看");
    expect(formatStatusBadge({ workStatus: "done" }, now)).toBe("已完成");
    expect(formatStatusBadge({ workStatus: "todo", plannedStartAt: now + 10 * 60 * 1000, plannedDurationMinutes: 45 }, now)).toBe("待开始.10:10.45m");
    expect(formatStatusBadge({ workStatus: "todo", plannedStartAt: now - 10 * 60 * 1000, plannedDurationMinutes: 45 }, now)).toBe("待开始.逾期:09:50.45m");
    expect(formatStatusOverrun({ plannedStartAt: now - 60 * 60 * 1000, plannedDurationMinutes: 30 }, now)).toBe("超计划30m");
    expect(getPlannedEndAt({ plannedStartAt: now, plannedDurationMinutes: 45 })).toBe(now + 45 * 60 * 1000);
  });

  it("进行中切到等待中时保存剩余时长，等待中切回进行中时使用暂停时长恢复", () => {
    expect(
      computeRemainingStatusDurationMinutes(
        { workStatus: "doing", workStatusUpdatedAt: now, plannedDurationMinutes: 45 },
        now + 10 * 60 * 1000
      )
    ).toBe(35);
    expect(
      computeRemainingStatusDurationMinutes(
        { workStatus: "doing", workStatusUpdatedAt: now, plannedDurationMinutes: 45 },
        now + 60 * 60 * 1000
      )
    ).toBe(1);
    expect(
      computeRemainingStatusDurationMinutes(
        { workStatus: "waiting", plannedDurationMinutes: 35 },
        now + 60 * 60 * 1000
      )
    ).toBe(35);
  });

  it("按状态工作台规则排序", () => {
    const doing: StatusBlock[] = [
      { taskId: "t1", taskTitle: "任务", blockId: "old", blockType: "paragraph", blockContent: "旧", workStatus: "doing", workStatusUpdatedAt: now - 1000 },
      { taskId: "t1", taskTitle: "任务", blockId: "new", blockType: "paragraph", blockContent: "新", workStatus: "doing", workStatusUpdatedAt: now }
    ];
    expect(doing.slice().sort((a, b) => compareStatusBlocks(a, b, now)).map((item) => item.blockId)).toEqual(["new", "old"]);

    const waiting: StatusBlock[] = [
      { taskId: "t1", taskTitle: "任务", blockId: "none", blockType: "paragraph", blockContent: "无回看", workStatus: "waiting" },
      { taskId: "t1", taskTitle: "任务", blockId: "future", blockType: "paragraph", blockContent: "未到", workStatus: "waiting", waitReviewAt: now + 10 * 60 * 1000 },
      { taskId: "t1", taskTitle: "任务", blockId: "due", blockType: "paragraph", blockContent: "已到", workStatus: "waiting", waitReviewAt: now - 10 * 60 * 1000 }
    ];
    expect(waiting.slice().sort((a, b) => compareStatusBlocks(a, b, now)).map((item) => item.blockId)).toEqual(["due", "future", "none"]);

    const todo: StatusBlock[] = [
      { taskId: "t1", taskTitle: "任务", blockId: "later", blockType: "paragraph", blockContent: "稍后", workStatus: "todo", plannedStartAt: now + 60 * 60 * 1000, plannedDurationMinutes: 25 },
      { taskId: "t1", taskTitle: "任务", blockId: "overdue", blockType: "paragraph", blockContent: "逾期", workStatus: "todo", plannedStartAt: now - 60 * 60 * 1000, plannedDurationMinutes: 25 },
      { taskId: "t1", taskTitle: "任务", blockId: "soon", blockType: "paragraph", blockContent: "马上", workStatus: "todo", plannedStartAt: now + 10 * 60 * 1000, plannedDurationMinutes: 25 }
    ];
    expect(todo.slice().sort((a, b) => compareStatusBlocks(a, b, now)).map((item) => item.blockId)).toEqual(["overdue", "soon", "later"]);
  });

  it("汇总状态块时排除已完成状态", () => {
    const task = {
      id: "task-1",
      title: "根任务",
      blocks: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "todo", workStatus: "todo", plannedStartAt: now, plannedDurationMinutes: 25 },
            content: [{ type: "text", text: "待开始正文" }]
          },
          {
            type: "paragraph",
            attrs: { id: "doing", workStatus: "doing" },
            content: [{ type: "text", text: "进行中正文" }]
          },
          {
            type: "paragraph",
            attrs: { id: "waiting", workStatus: "waiting", waitReason: "客户确认" },
            content: [{ type: "text", text: "等待正文" }]
          },
          {
            type: "paragraph",
            attrs: { id: "done", workStatus: "done" },
            content: [{ type: "text", text: "完成正文" }]
          }
        ]
      } as JsonValue
    };

    expect(collectStatusBlocksFromTask(task).map((block) => block.blockId)).toEqual(["todo", "doing", "waiting"]);
  });

  it("子文本块设置新状态时会清除同一视觉块父节点旧状态", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "taskItem",
          attrs: {
            id: "task-item-1",
            workStatus: "waiting",
            waitReason: "旧等待"
          },
          content: [
            {
              type: "paragraph",
              attrs: { id: "paragraph-1" },
              content: [{ type: "text", text: "面试储备" }]
            }
          ]
        }
      ]
    };

    const result = updateBlockStatusInBlocks(blocks, "paragraph-1", {
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    });
    const taskItemAttrs = (result.blocks as any).content[0].attrs;
    const paragraphAttrs = (result.blocks as any).content[0].content[0].attrs;

    expect(result.changed).toBe(true);
    expect(taskItemAttrs).toMatchObject({
      workStatus: null,
      workStatusUpdatedAt: null,
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: null,
      waitReviewAt: null
    });
    expect(paragraphAttrs).toMatchObject({
      id: "paragraph-1",
      workStatus: "todo",
      plannedStartAt: now,
      plannedDurationMinutes: 25
    });
  });

  it("父文本块设置新状态时会清除同一视觉块子节点旧状态", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "taskItem",
          attrs: { id: "task-item-1" },
          content: [
            {
              type: "paragraph",
              attrs: {
                id: "paragraph-1",
                workStatus: "todo",
                plannedStartAt: now,
                plannedDurationMinutes: 25
              },
              content: [{ type: "text", text: "面试储备" }]
            }
          ]
        }
      ]
    };

    const result = updateBlockStatusInBlocks(blocks, "task-item-1", {
      workStatus: "doing",
      plannedStartAt: null,
      plannedDurationMinutes: 45,
      waitReason: "",
      waitReviewAt: null
    });
    const taskItemAttrs = (result.blocks as any).content[0].attrs;
    const paragraphAttrs = (result.blocks as any).content[0].content[0].attrs;

    expect(result.changed).toBe(true);
    expect(taskItemAttrs).toMatchObject({
      id: "task-item-1",
      workStatus: "doing",
      plannedDurationMinutes: 45
    });
    expect(paragraphAttrs).toMatchObject({
      workStatus: null,
      workStatusUpdatedAt: null,
      plannedStartAt: null,
      plannedDurationMinutes: null,
      waitReason: null,
      waitReviewAt: null
    });
  });

  it("清理旧 AI 状态时只清除 Codex 专用状态并保留当前块和人工等待", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "old-processing", workStatus: "waiting", waitReason: "AI处理中" },
          content: [{ type: "text", text: "旧 AI 处理中" }]
        },
        {
          type: "paragraph",
          attrs: { id: "old-done", workStatus: "doing", waitReason: "AI已返回结果" },
          content: [{ type: "text", text: "旧 AI 返回" }]
        },
        {
          type: "paragraph",
          attrs: { id: "manual-waiting", workStatus: "waiting", waitReason: "客户确认" },
          content: [{ type: "text", text: "人工等待" }]
        },
        {
          type: "paragraph",
          attrs: { id: "current", workStatus: "waiting", waitReason: "AI处理中" },
          content: [{ type: "text", text: "当前 AI" }]
        }
      ]
    };

    const result = clearCodexStatusAttrsInBlocks(blocks, "current");
    const [oldProcessing, oldDone, manualWaiting, current] = (result.blocks as any).content;

    expect(result.changed).toBe(true);
    expect(oldProcessing.attrs.workStatus).toBeNull();
    expect(oldDone.attrs.workStatus).toBeNull();
    expect(manualWaiting.attrs).toMatchObject({ workStatus: "waiting", waitReason: "客户确认" });
    expect(current.attrs).toMatchObject({ workStatus: "waiting", waitReason: "AI处理中" });
  });

  it("只有仍处于 AI 处理中的块才允许回调更新状态", () => {
    const blocks: JsonValue = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "processing", workStatus: "waiting", waitReason: "AI处理中" },
          content: [{ type: "text", text: "正在处理" }]
        },
        {
          type: "paragraph",
          attrs: { id: "cleared", workStatus: null, waitReason: null },
          content: [{ type: "text", text: "已清理旧 AI 状态" }]
        }
      ]
    };

    expect(isCodexProcessingBlock(blocks, "processing")).toBe(true);
    expect(isCodexProcessingBlock(blocks, "cleared")).toBe(false);
    expect(isCodexProcessingBlock(blocks, "missing")).toBe(false);
  });
});
