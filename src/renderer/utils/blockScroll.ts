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

  // 滚动到目标位置
  const dom = editor.view.domAtPos(targetPos);
  if (dom.node) {
    const element = dom.node.nodeType === Node.ELEMENT_NODE
      ? (dom.node as HTMLElement)
      : (dom.node.parentElement as HTMLElement);

    if (element) {
      // 滚动到元素
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      // 添加高亮效果
      element.classList.add("block-highlight");
      setTimeout(() => {
        element.classList.remove("block-highlight");
      }, 2000);

      // 将光标定位到节点末尾
      const endPos = targetPos + targetNode.nodeSize;
      const selection = TextSelection.create(editor.state.doc, endPos);
      editor.view.dispatch(editor.state.tr.setSelection(selection));
      editor.view.focus();

      return true;
    }
  }

  return false;
}
