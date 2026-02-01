import type React from "react";
import type { Editor } from "@tiptap/react";

function insertImage(editor: Editor, file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const src = typeof reader.result === "string" ? reader.result : "";
    if (!src) {
      return;
    }
    editor.chain().focus().setImage({ src }).run();
  };
  reader.readAsDataURL(file);
}

function handleFiles(editor: Editor | null, files: File[]) {
  if (!editor) {
    return false;
  }
  const images = files.filter((file) => file.type.startsWith("image/"));
  if (images.length === 0) {
    return false;
  }
  images.forEach((file) => insertImage(editor, file));
  return true;
}

export function createImageHandlers(editorRef: React.MutableRefObject<Editor | null>) {
  return {
    handlePaste: (_view: any, event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []);
      return handleFiles(editorRef.current, files);
    },
    handleDrop: (_view: any, event: DragEvent) => {
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (handleFiles(editorRef.current, files)) {
        event.preventDefault();
        return true;
      }
      return false;
    }
  };
}
