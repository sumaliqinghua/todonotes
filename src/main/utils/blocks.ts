import type { JsonValue } from "../../shared/types";

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function extractPlainText(blocks: JsonValue): string {
  const parts: string[] = [];

  const visit = (node: JsonValue) => {
    if (typeof node === "string") {
      parts.push(node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(visit);
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    if (typeof node.text === "string") {
      parts.push(node.text);
    }
    if (Array.isArray(node.content)) {
      node.content.forEach(visit);
    }
  };

  visit(blocks);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
