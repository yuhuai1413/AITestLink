export function formatTestStepsForDisplay(steps: string | undefined | null): string {
  if (!steps) return "";
  return steps
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]*\n+[ \t]*/g, "\n")
    .replace(/\s+(?=(?:步骤\s*\d+|第[一二三四五六七八九十百千万]+步)\s*[:：])/g, "\n")
    .replace(/\s+(?=\d+\s*[.、]\s*)/g, "\n")
    .trim();
}
