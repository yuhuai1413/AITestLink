function splitClarificationItems(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\s+(?=(?:\d+|[一二三四五六七八九十]+)[、.．)]\s*)/g, "\n")
    .split(/[\n；;。]+/)
    .map((part) => part.trim())
    .map((part) => part.replace(/^(?:[•\-*]\s*|(?:\d+|[一二三四五六七八九十]+)[、.．)]\s*)/, ""))
    .filter(Boolean);
}

export function formatClarificationForDisplay(text?: string | null): string {
  if (!text) return "";
  const parts = splitClarificationItems(text);
  if (parts.length <= 1) return text.replace(/\r\n?/g, "\n").trim();
  return parts.map((part, index) => `${index + 1}、${part}`).join("\n");
}
