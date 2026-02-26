import { TextSelection } from "@tiptap/pm/state";

/**
 * 在编辑器中查找并滚动到指定ID的节点，并将光标定位到节点末尾
 * @param editor TipTap编辑器实例
 * @param blockId 节点ID
 * @param preferredOffset 可选：块内光标偏移（相对块起始位置，默认块末尾）
 * @returns 是否找到节点
 */
export function scrollToBlock(editor: any, blockId: string, preferredOffset?: number): boolean {
  if (!editor || !blockId) {
    return false;
  }

  let targetPos: number | null = null;
  let targetNode: any = null;

  // 遍历文档查找目标节点
  editor.state.doc.descendants((node: any, pos: number) => {
    // 已命中后不再覆盖，避免重复ID时跳到后面的同ID节点
    if (targetPos !== null) {
      return false;
    }
    if (node.attrs?.id === blockId && targetPos === null) {
      targetPos = pos;
      targetNode = node;
      return false;
    }
    return true;
  });

  if (targetPos === null || !targetNode) {
    return false;
  }

  const resolvedPos = typeof targetPos === "number" ? targetPos : Number.NaN;
  const resolvedNodeSize = Number(targetNode.nodeSize ?? 0);
  if (!Number.isFinite(resolvedPos) || !Number.isFinite(resolvedNodeSize) || resolvedNodeSize <= 0) {
    return false;
  }

  const fallbackOffset = resolvedNodeSize - 1;
  const resolvedOffset =
    typeof preferredOffset === "number" && Number.isFinite(preferredOffset)
      ? Math.max(1, Math.min(fallbackOffset, Math.floor(preferredOffset)))
      : fallbackOffset;
  const cursorPos = Math.min(
    editor.state.doc.content.size,
    Math.max(1, resolvedPos + resolvedOffset)
  );
  const selection = TextSelection.create(editor.state.doc, cursorPos);
  editor.view.dispatch(editor.state.tr.setSelection(selection));
  editor.view.focus();

  const nodeDom = editor.view.nodeDOM(resolvedPos);
  const dom = editor.view.domAtPos(resolvedPos);
  const element =
    nodeDom && nodeDom.nodeType === Node.ELEMENT_NODE
      ? (nodeDom as HTMLElement)
      : dom?.node.nodeType === Node.ELEMENT_NODE
        ? (dom.node as HTMLElement)
        : (dom?.node.parentElement as HTMLElement | null);

  if (!element) {
    return true;
  }

  element.scrollIntoView({ behavior: "smooth", block: "center" });
  element.classList.add("block-highlight");
  setTimeout(() => {
    element.classList.remove("block-highlight");
  }, 2000);

  return true;
}
