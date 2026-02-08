import { Node } from "@tiptap/core";

export const TaskLinkNode = Node.create({
  name: "taskLink",
  group: "inline",
  inline: true,
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
      },
      isCompleted: {
        default: false
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "[data-task-link]",
        getAttrs: (dom) => {
          if (!(dom instanceof HTMLElement)) {
            return false;
          }
          const titleAttr = dom.getAttribute("data-task-title");
          const title = typeof titleAttr === "string" && titleAttr.length > 0 ? titleAttr : dom.textContent ?? "";
          const completedRaw = dom.getAttribute("data-task-completed");
          return {
            taskId: dom.getAttribute("data-task-id") ?? "",
            title,
            isCompleted: completedRaw === "1"
          };
        }
      }
    ];
  },

  renderHTML({ node }) {
    const { taskId, title, isCompleted } = node.attrs as { taskId: string; title: string; isCompleted: boolean };
    return [
      "span",
      {
        "data-task-link": "true",
        "data-task-id": taskId,
        "data-task-title": title || "",
        "data-task-completed": isCompleted ? "1" : "0",
        class: "task-link-block"
      },
      [
        "input",
        {
          type: "checkbox",
          class: "task-link-checkbox",
          checked: isCompleted ? "checked" : null,
          tabindex: "-1"
        }
      ],
      [
        "span",
        {
          class: "task-link-title"
        },
        title || "未命名任务"
      ]
    ];
  }
});
