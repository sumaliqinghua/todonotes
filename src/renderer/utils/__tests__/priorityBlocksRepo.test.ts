import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAll = vi.fn();
const mockPrepare = vi.fn(() => ({
  all: mockAll
}));

vi.mock("../../../main/db/index", () => ({
  getDb: () => ({
    prepare: mockPrepare
  })
}));

import { getPriorityBlocks } from "../../../main/db/tasksRepo";

describe("tasksRepo.getPriorityBlocks", () => {
  beforeEach(() => {
    mockAll.mockReset();
    mockPrepare.mockClear();
  });

  it("查询时会排除已完成、已删除和已归档任务", () => {
    mockAll.mockReturnValue([]);

    getPriorityBlocks();

    expect(mockPrepare).toHaveBeenCalledTimes(1);
    expect(mockPrepare).toHaveBeenCalledWith(
      "SELECT id, title, blocks FROM tasks WHERE is_deleted = 0 AND is_archived = 0 AND is_completed = 0"
    );
    expect(mockAll).toHaveBeenCalledTimes(1);
  });

  it("只返回未完成任务中的优先级文本块，并按优先级排序", () => {
    mockAll.mockReturnValue([
      {
        id: "task-active-medium",
        title: "进行中任务",
        blocks: JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { id: "block-medium", priority: "medium" },
              content: [{ type: "text", text: "中优块" }]
            }
          ]
        })
      },
      {
        id: "task-active-high",
        title: "紧急任务",
        blocks: JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { id: "block-high", priority: "high" },
              content: [{ type: "text", text: "高优块" }]
            }
          ]
        })
      },
      {
        id: "task-no-priority",
        title: "普通任务",
        blocks: JSON.stringify({
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { id: "block-none" },
              content: [{ type: "text", text: "普通块" }]
            }
          ]
        })
      }
    ]);

    const result = getPriorityBlocks();

    expect(result).toEqual([
      {
        taskId: "task-active-high",
        taskTitle: "紧急任务",
        blockId: "block-high",
        priority: "high",
        text: "高优块"
      },
      {
        taskId: "task-active-medium",
        taskTitle: "进行中任务",
        blockId: "block-medium",
        priority: "medium",
        text: "中优块"
      }
    ]);
  });
});
