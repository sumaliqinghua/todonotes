import { Node } from "@tiptap/core";

export const TaskLinkNode = Node.create({
  name: "taskLink",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,

  addAttributes() {
    return {
      taskId: {
        default: ""
      },
      title: {
        default: ""
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-task-link]",
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) {
            return false;
          }
          return {
            taskId: dom.getAttribute("data-task-id") ?? "",
            title: dom.textContent ?? ""
          };
        }
      }
    ];
  },

  renderHTML({ node }) {
    const { taskId, title } = node.attrs;
    return [
      "div",
      {
        "data-task-link": "true",
        "data-task-id": taskId,
        class: "task-link-block"
      },
      title || "未命名任务"
    ];
  }
});
