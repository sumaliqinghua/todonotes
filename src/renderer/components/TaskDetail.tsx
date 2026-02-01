import React, { useEffect, useMemo, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { Task } from "../../shared/types";
import { TaskLinkNode } from "./TaskLinkNode";
import type { ContextMenuState } from "./ContextMenu";
import Breadcrumb from "./Breadcrumb";

const DEFAULT_BLOCKS = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

interface Props {
  task: Task | null;
  ancestors: Task[];
  children: Task[];
  onNavigate: (taskId: string, reset: boolean) => void;
  onBack: () => void;
  onOpenInNewWindow: (taskId: string) => void;
  onUpdateTitle: (title: string) => void;
  onUpdateBlocks: (blocks: any) => void;
  onCreateChildFromBlock: (title: string) => Promise<{ taskId: string; title: string }>;
  onShowMenu: (menu: ContextMenuState | null) => void;
}

export default function TaskDetail({
  task,
  ancestors,
  children,
  onNavigate,
  onBack,
  onOpenInNewWindow,
  onUpdateTitle,
  onUpdateBlocks,
  onCreateChildFromBlock,
  onShowMenu
}: Props) {
  const [title, setTitle] = useState(task?.title ?? "");
  const titleTimer = useRef<number | null>(null);
  const blocksTimer = useRef<number | null>(null);

  const editor = useEditor({
    extensions: [StarterKit, TaskLinkNode],
    content: task?.blocks ?? DEFAULT_BLOCKS,
    onUpdate: ({ editor }) => {
      if (blocksTimer.current) {
        window.clearTimeout(blocksTimer.current);
      }
      blocksTimer.current = window.setTimeout(() => {
        onUpdateBlocks(editor.getJSON());
      }, 500);
    }
  });

  useEffect(() => {
    setTitle(task?.title ?? "");
    if (editor && task) {
      editor.commands.setContent(task.blocks ?? DEFAULT_BLOCKS, false);
    }
  }, [task?.id, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }
    const handleKeydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "t") {
        event.preventDefault();
        convertSelectionToChild();
      }
    };
    document.addEventListener("keydown", handleKeydown);
    return () => document.removeEventListener("keydown", handleKeydown);
  }, [editor, task?.id]);

  useEffect(() => {
    return () => {
      if (titleTimer.current) {
        window.clearTimeout(titleTimer.current);
      }
      if (blocksTimer.current) {
        window.clearTimeout(blocksTimer.current);
      }
    };
  }, []);

  const convertSelectionToChild = async () => {
    if (!editor || !task) {
      return;
    }
    const { state } = editor;
    const { $from } = state.selection;
    let depth = $from.depth;
    let node = $from.node(depth);
    while (depth > 0 && !["paragraph", "heading"].includes(node.type.name)) {
      depth -= 1;
      node = $from.node(depth);
    }
    if (!node || !["paragraph", "heading"].includes(node.type.name)) {
      alert("当前块类型暂不支持转换");
      return;
    }
    const text = node.textContent.trim() || "未命名任务";
    const pos = $from.before(depth);
    const created = await onCreateChildFromBlock(text);
    if (!created.taskId) {
      return;
    }
    editor
      .chain()
      .focus()
      .deleteRange({ from: pos, to: pos + node.nodeSize })
      .insertContentAt(pos, {
        type: "taskLink",
        attrs: { taskId: created.taskId, title: created.title }
      })
      .run();
  };

  const handleContextMenu = (event: React.MouseEvent) => {
    event.preventDefault();
    if (!editor || !task) {
      return;
    }
    const target = event.target as HTMLElement;
    const linkEl = target.closest(".task-link-block") as HTMLElement | null;
    if (linkEl) {
      const taskId = linkEl.dataset.taskId;
      if (!taskId) {
        return;
      }
      const pos = editor.view.posAtDOM(linkEl, 0);
      const node = editor.state.doc.nodeAt(pos);
      const items = [
        {
          label: "打开子任务",
          action: () => onNavigate(taskId, false)
        },
        {
          label: "在新便签中打开",
          action: () => onOpenInNewWindow(taskId)
        }
      ];
      if (node) {
        items.push({
          label: "删除链接块",
          action: () => {
            editor
              .chain()
              .focus()
              .deleteRange({ from: pos, to: pos + node.nodeSize })
              .run();
          }
        });
      }
      onShowMenu({ x: event.clientX, y: event.clientY, items });
      return;
    }

    onShowMenu({
      x: event.clientX,
      y: event.clientY,
      items: [
        {
          label: "转换为子任务",
          action: convertSelectionToChild
        }
      ]
    });
  };

  const handleTitleChange = (value: string) => {
    setTitle(value);
    if (titleTimer.current) {
      window.clearTimeout(titleTimer.current);
    }
    titleTimer.current = window.setTimeout(() => onUpdateTitle(value), 400);
  };

  const childList = useMemo(() => {
    if (children.length === 0) {
      return <div className="empty">暂无子任务</div>;
    }
    return children.map((child) => (
      <button key={child.id} type="button" onClick={() => onNavigate(child.id, false)}>
        {child.title}
      </button>
    ));
  }, [children, onNavigate]);

  if (!task) {
    return <div className="task-detail">加载中...</div>;
  }

  return (
    <div className="task-detail" onContextMenu={handleContextMenu}>
      <div className="task-nav">
        <button type="button" onClick={onBack}>
          返回父级
        </button>
        <Breadcrumb ancestors={ancestors} current={task} onNavigate={onNavigate} />
      </div>
      <input className="task-title" value={title} onChange={(event) => handleTitleChange(event.target.value)} />
      <div className="editor" onClick={() => onShowMenu(null)}>
        <EditorContent editor={editor} />
      </div>
      <div className="children">
        <div className="children-title">子任务</div>
        <div className="children-list">{childList}</div>
      </div>
    </div>
  );
}
