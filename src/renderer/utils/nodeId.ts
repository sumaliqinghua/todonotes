import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * 生成唯一的节点ID
 */
export function generateNodeId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * TipTap扩展：为所有节点添加唯一ID属性
 * 这个扩展会在节点创建时自动添加id属性
 */
export const UniqueId = Extension.create({
  name: "uniqueId",

  addGlobalAttributes() {
    return [
      {
        types: [
          "paragraph",
          "heading",
          "listItem",
          "taskItem",
          "taskLink",
          "bulletList",
          "orderedList",
          "taskList",
          "blockquote",
          "codeBlock",
          "horizontalRule",
          "image"
        ],
        attributes: {
          id: {
            default: null,
            parseHTML: (element) => element.getAttribute("data-node-id"),
            renderHTML: (attributes) => {
              if (!attributes.id) {
                return {};
              }
              return {
                "data-node-id": attributes.id
              };
            }
          }
        }
      }
    ];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("uniqueId"),
        appendTransaction: (_transactions, _oldState, newState) => {
          const tr = newState.tr;
          let modified = false;

          newState.doc.descendants((node, pos) => {
            // 只为支持id属性的节点类型添加id
            if (
              node.isBlock &&
              !node.attrs.id &&
              [
                "paragraph",
                "heading",
                "listItem",
                "taskItem",
                "taskLink",
                "bulletList",
                "orderedList",
                "taskList",
                "blockquote",
                "codeBlock",
                "horizontalRule",
                "image"
              ].includes(node.type.name)
            ) {
              tr.setNodeMarkup(pos, undefined, {
                ...node.attrs,
                id: generateNodeId()
              });
              modified = true;
            }
          });

          return modified ? tr : null;
        }
      })
    ];
  }
});
