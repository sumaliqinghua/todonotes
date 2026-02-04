import type { Node } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";

/**
 * 将 ProseMirror 节点转换为 Markdown 格式的纯文本
 */
function nodeToMarkdown(node: Node, indent = ""): string {
  const lines: string[] = [];

  if (node.type.name === "doc") {
    node.forEach((child) => {
      lines.push(nodeToMarkdown(child, indent));
    });
    return lines.join("");
  }

  if (node.type.name === "paragraph") {
    let text = "";
    node.forEach((child) => {
      text += inlineNodeToText(child);
    });
    return text + "\n";
  }

  if (node.type.name === "bulletList") {
    node.forEach((child) => {
      lines.push(nodeToMarkdown(child, indent));
    });
    return lines.join("");
  }

  if (node.type.name === "orderedList") {
    let index = 1;
    node.forEach((child) => {
      lines.push(listItemToMarkdown(child, indent, `${index}. `));
      index++;
    });
    return lines.join("");
  }

  if (node.type.name === "listItem") {
    return listItemToMarkdown(node, indent, "- ");
  }

  if (node.type.name === "taskList") {
    node.forEach((child) => {
      lines.push(nodeToMarkdown(child, indent));
    });
    return lines.join("");
  }

  if (node.type.name === "taskItem") {
    const checked = node.attrs.checked;
    const marker = checked ? "- [x] " : "- [ ] ";
    let text = "";
    node.forEach((child, _offset, index) => {
      if (child.type.name === "paragraph") {
        child.forEach((inlineChild) => {
          text += inlineNodeToText(inlineChild);
        });
      } else if (child.type.name === "taskList") {
        // 嵌套的 taskList
        if (text) {
          lines.push(indent + marker + text + "\n");
          text = "";
        }
        child.forEach((taskChild) => {
          lines.push(nodeToMarkdown(taskChild, indent + "  "));
        });
      }
    });
    if (text) {
      lines.push(indent + marker + text + "\n");
    }
    return lines.join("");
  }

  if (node.type.name === "heading") {
    const level = node.attrs.level || 1;
    let text = "";
    node.forEach((child) => {
      text += inlineNodeToText(child);
    });
    return "#".repeat(level) + " " + text + "\n";
  }

  if (node.type.name === "codeBlock") {
    let text = "";
    node.forEach((child) => {
      text += child.text || "";
    });
    return "```\n" + text + "\n```\n";
  }

  if (node.type.name === "blockquote") {
    let content = "";
    node.forEach((child) => {
      content += nodeToMarkdown(child, indent);
    });
    return content
      .split("\n")
      .map((line) => (line ? "> " + line : ">"))
      .join("\n") + "\n";
  }

  // 默认：尝试提取文本
  let text = "";
  node.forEach((child) => {
    if (child.isText) {
      text += child.text || "";
    } else {
      text += nodeToMarkdown(child, indent);
    }
  });
  return text;
}

function listItemToMarkdown(node: Node, indent: string, marker: string): string {
  const lines: string[] = [];
  let firstLine = true;

  node.forEach((child) => {
    if (child.type.name === "paragraph") {
      let text = "";
      child.forEach((inlineChild) => {
        text += inlineNodeToText(inlineChild);
      });
      if (firstLine) {
        lines.push(indent + marker + text + "\n");
        firstLine = false;
      } else {
        lines.push(indent + "  " + text + "\n");
      }
    } else if (child.type.name === "bulletList" || child.type.name === "orderedList") {
      child.forEach((listChild, _offset, index) => {
        const subMarker = child.type.name === "orderedList" ? `${index + 1}. ` : "- ";
        lines.push(listItemToMarkdown(listChild, indent + "  ", subMarker));
      });
    }
  });

  return lines.join("");
}

function inlineNodeToText(node: Node): string {
  if (node.isText) {
    return node.text || "";
  }
  if (node.type.name === "taskLink") {
    return node.attrs.title || "";
  }
  return "";
}

/**
 * 创建自定义复制处理器
 */
export function handleCopy(view: EditorView, event: ClipboardEvent): boolean {
  const { state } = view;
  const { selection } = state;

  if (selection.empty) {
    return false;
  }

  const slice = selection.content();
  const fragment = slice.content;

  // 构建 markdown 文本
  let markdown = "";
  fragment.forEach((node) => {
    markdown += nodeToMarkdown(node);
  });

  // 移除末尾多余的空行
  markdown = markdown.replace(/\n+$/, "\n");

  if (event.clipboardData) {
    event.clipboardData.setData("text/plain", markdown);
    event.preventDefault();
    return true;
  }

  return false;
}
