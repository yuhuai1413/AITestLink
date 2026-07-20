const DISPLAY_TIME_ZONE = "Asia/Shanghai";

function normalizeDateTimeInput(value?: string | null): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
    return `${text}Z`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(text)) {
    return text.replace(" ", "T") + "+08:00";
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text)) {
    return text.replace(" ", "T") + ":00+08:00";
  }
  return text;
}

export function formatDateTime(value?: string | null, fallback = "-"): string {
  const normalized = normalizeDateTimeInput(value);
  if (!normalized) return fallback;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return String(value);

  const parts = new Intl.DateTimeFormat("zh-CN", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

export function formatTimestampForFileName(date = new Date()): string {
  const formatted = formatDateTime(date.toISOString(), "");
  return formatted.replace(/[-: ]/g, "").slice(0, 12);
}
