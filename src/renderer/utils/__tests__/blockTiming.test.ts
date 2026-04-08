import { describe, expect, it } from "vitest";
import {
  collectTimedBlocksFromTask,
  formatBlockTimingBadge,
  formatBlockTimingDuration,
  isTimestampInToday,
  isTimestampWithinWindow,
  updateBlockTimingInBlocks
} from "../../../shared/blockTiming";

describe("blockTiming", () => {
  it("按 d/h/m 格式输出剩余时间，并隐藏为 0 的位", () => {
    const now = new Date("2026-04-07T10:00:00+08:00").getTime();
    expect(formatBlockTimingDuration(now + ((2 * 24 + 3) * 60 + 5) * 60 * 1000, now)).toBe("2d3h5m");
    expect(formatBlockTimingDuration(now + (4 * 60 + 20) * 60 * 1000, now)).toBe("4h20m");
    expect(formatBlockTimingDuration(now + 8 * 60 * 1000, now)).toBe("8m");
  });

  it("截止时间到点后返回超时状态文案，未到点时只显示倒计时", () => {
    const now = new Date("2026-04-07T10:00:00+08:00").getTime();
    expect(formatBlockTimingBadge({ dueAt: now + 10 * 60 * 1000 }, now)).toEqual({
      text: "10m",
      timestamp: now + 10 * 60 * 1000
    });
    expect(formatBlockTimingBadge({ dueAt: now - 1000 }, now)).toEqual({
      text: "已超时",
      timestamp: now - 1000
    });
  });

  it("能从任务 blocks 中收集带时间的正文块", () => {
    const task = {
      id: "task-1",
      title: "项目 A",
      blocks: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: {
              id: "block-due-1",
              dueAt: 1712455200000
            },
            content: [{ type: "text", text: "准备素材" }]
          },
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: {
                  id: "block-due",
                  dueAt: 1712458800000,
                  checked: false
                },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "发版本公告" }]
                  }
                ]
              }
            ]
          }
        ]
      } as any
    };

    expect(collectTimedBlocksFromTask(task)).toEqual([
      {
        taskId: "task-1",
        taskTitle: "项目 A",
        blockId: "block-due-1",
        blockType: "paragraph",
        blockContent: "准备素材",
        dueAt: 1712455200000
      },
      {
        taskId: "task-1",
        taskTitle: "项目 A",
        blockId: "block-due",
        blockType: "taskItem",
        blockContent: "发版本公告",
        dueAt: 1712458800000
      }
    ]);
  });

  it("按块 ID 清除或改写时间属性", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: {
            id: "block-1",
            dueAt: 1712458800000
          },
          content: [{ type: "text", text: "需要处理" }]
        }
      ]
    } as any;

    const cleared = updateBlockTimingInBlocks(blocks, "block-1", {
      dueAt: null
    });
    expect(cleared.changed).toBe(true);
    expect((cleared.blocks as any).content[0].attrs.dueAt ?? null).toBeNull();

    const rewritten = updateBlockTimingInBlocks(blocks, "block-1", {
      dueAt: 1712455200000
    });
    expect(rewritten.changed).toBe(true);
    expect((rewritten.blocks as any).content[0].attrs.dueAt).toBe(1712455200000);
  });

  it("支持今天和 1 小时内的时间判断", () => {
    const now = new Date("2026-04-07T10:00:00+08:00").getTime();
    expect(isTimestampInToday(new Date("2026-04-07T23:59:00+08:00").getTime(), now)).toBe(true);
    expect(isTimestampInToday(new Date("2026-04-08T00:01:00+08:00").getTime(), now)).toBe(false);
    expect(isTimestampWithinWindow(now + 59 * 60 * 1000, now, 60 * 60 * 1000)).toBe(true);
    expect(isTimestampWithinWindow(now + 61 * 60 * 1000, now, 60 * 60 * 1000)).toBe(false);
    expect(isTimestampWithinWindow(now - 30 * 60 * 1000, now, 60 * 60 * 1000)).toBe(true);
  });
});
