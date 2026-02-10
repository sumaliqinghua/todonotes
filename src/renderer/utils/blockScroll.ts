import { TextSelection } from "@tiptap/pm/state";

/**
 * 在编辑器中查找并滚动到指定ID的节点，并将光标定位到节点末尾
 * @param editor TipTap编辑器实例
 * @param blockId 节点ID
 * @returns 是否找到节点
 */
export function scrollToBlock(editor: any, blockId: string): boolean {
  if (!editor || !blockId) {
    return false;
  }

  let targetPos: number | null = null;
  let targetNode: any = null;

  // 遍历文档查找目标节点
  editor.state.doc.descendants((node: any, pos: number) => {
    if (node.attrs?.id === blockId) {
      targetPos = pos;
      targetNode = node;
      return false; // 停止遍历
    }
  });

  if (targetPos === null || !targetNode) {
    return false;
  }

  const resolvedPos = typeof targetPos === "number" ? targetPos : Number.NaN;
  const resolvedNodeSize = Number(targetNode.nodeSize ?? 0);
  if (!Number.isFinite(resolvedPos) || !Number.isFinite(resolvedNodeSize) || resolvedNodeSize <= 0) {
    return false;
  }

  const blockEndPos = Math.min(
    editor.state.doc.content.size,
    Math.max(1, resolvedPos + resolvedNodeSize - 1)
  );
  const selection = TextSelection.create(editor.state.doc, blockEndPos);
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
