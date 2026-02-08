import { describe, expect, it } from "vitest";
import {
  appendTaskLinkToBlocksEnd,
  deriveChildCompletionChangesFromBlocksDiff,
  removeTaskLinksByTaskId,
  syncChildStateInBlocks
} from "../../../shared/taskBlocksSync";

describe("taskBlocksSync", () => {
  it("识别 taskLink checkbox 变更并产出完成态同步结果", () => {
    const beforeBlocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "taskLink",
              attrs: {
                taskId: "child-1",
                title: "子任务A",
                isCompleted: false
              }
            }
          ]
        }
      ]
    };
    const afterBlocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "taskLink",
              attrs: {
                taskId: "child-1",
                title: "子任务A",
                isCompleted: true
              }
            }
          ]
        }
      ]
    };
    const changes = deriveChildCompletionChangesFromBlocksDiff(beforeBlocks, afterBlocks, [
      { id: "child-1", title: "子任务A", isCompleted: false }
    ]);
    expect(changes).toEqual([{ childId: "child-1", isCompleted: true }]);
  });

  it("在缺少 taskId 的场景下可通过 taskLink 标题映射完成态", () => {
    const beforeBlocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "taskLink",
              attrs: {
                title: "子任务B",
                isCompleted: false
              }
            }
          ]
        }
      ]
    };
    const afterBlocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "taskLink",
              attrs: {
                title: "子任务B",
                isCompleted: true
              }
            }
          ]
        }
      ]
    };
    const changes = deriveChildCompletionChangesFromBlocksDiff(beforeBlocks, afterBlocks, [
      { id: "child-2", title: "子任务B", isCompleted: false }
    ]);
    expect(changes).toEqual([{ childId: "child-2", isCompleted: true }]);
  });

  it("识别 markdown checkbox 变更并产出完成态同步结果", () => {
    const beforeBlocks = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "子任务A" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const afterBlocks = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "子任务A" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const changes = deriveChildCompletionChangesFromBlocksDiff(beforeBlocks, afterBlocks, [
      { id: "child-1", title: "子任务A", isCompleted: false }
    ]);
    expect(changes).toEqual([{ childId: "child-1", isCompleted: true }]);
  });

  it("同名子任务场景下不进行 markdown 文本映射", () => {
    const beforeBlocks = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "重复标题" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const afterBlocks = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "重复标题" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const changes = deriveChildCompletionChangesFromBlocksDiff(beforeBlocks, afterBlocks, [
      { id: "child-1", title: "重复标题", isCompleted: false },
      { id: "child-2", title: "重复标题", isCompleted: false }
    ]);
    expect(changes).toEqual([]);
  });

  it("在重命名时同步 taskLink 标题与 markdown checkbox 文本", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "taskLink",
              attrs: {
                taskId: "child-1",
                title: "旧标题",
                isCompleted: false
              }
            }
          ]
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "旧标题" }]
                }
              ]
            }
          ]
        }
      ]
    };

    const synced = syncChildStateInBlocks(
      blocks,
      {
        id: "child-1",
        title: "新标题",
        isCompleted: true
      },
      "旧标题"
    );

    expect(synced.changed).toBe(true);
    const next = synced.blocks as any;
    expect(next.content[0].content[0].attrs.title).toBe("新标题");
    expect(next.content[0].content[0].attrs.isCompleted).toBe(true);
    expect(next.content[1].content[0].attrs.checked).toBe(true);
    expect(next.content[1].content[0].content[0].content[0].text).toBe("新标题");
  });


  it("重命名时保留 taskItem 内 taskLink 节点样式", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "taskLink",
                      attrs: {
                        taskId: "child-1",
                        title: "旧标题",
                        isCompleted: false
                      }
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const synced = syncChildStateInBlocks(
      blocks,
      {
        id: "child-1",
        title: "新标题",
        isCompleted: true
      },
      "旧标题"
    );

    expect(synced.changed).toBe(true);
    const next = synced.blocks as any;
    const taskItem = next.content[0].content[0];
    const paragraphContent = taskItem.content[0].content;
    expect(taskItem.attrs.checked).toBe(true);
    expect(paragraphContent[0].type).toBe("taskLink");
    expect(paragraphContent[0].attrs.taskId).toBe("child-1");
    expect(paragraphContent[0].attrs.title).toBe("新标题");
    expect(paragraphContent[0].attrs.isCompleted).toBe(true);
  });

  it("可在 blocks 末尾插入不存在的 taskLink", () => {
    const blocks = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "正文" }] }]
    };
    const inserted = appendTaskLinkToBlocksEnd(blocks, {
      taskId: "child-9",
      title: "恢复入口",
      isCompleted: false
    });
    expect(inserted.changed).toBe(true);
    const next = inserted.blocks as any;
    const lastNode = next.content[next.content.length - 1];
    expect(lastNode.type).toBe("taskLink");
    expect(lastNode.attrs.taskId).toBe("child-9");
  });

  it("重复插入同一个 taskLink 时保持幂等", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "taskLink",
          attrs: { taskId: "child-9", title: "恢复入口", isCompleted: false }
        }
      ]
    };
    const inserted = appendTaskLinkToBlocksEnd(blocks, {
      taskId: "child-9",
      title: "恢复入口",
      isCompleted: false
    });
    expect(inserted.changed).toBe(false);
  });

  it("可按 taskId 删除正文中的 taskLink 引用", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "taskLink", attrs: { taskId: "child-9", title: "待移除", isCompleted: false } },
            { type: "text", text: "保留文本" }
          ]
        },
        {
          type: "taskLink",
          attrs: { taskId: "child-9", title: "待移除2", isCompleted: true }
        }
      ]
    };
    const removed = removeTaskLinksByTaskId(blocks as any, "child-9");
    expect(removed.changed).toBe(true);
    expect(removed.removedCount).toBe(2);
    const next = removed.blocks as any;
    expect(next.content[0].content[0].type).toBe("text");
    expect(next.content.length).toBe(1);
  });
});
