import { describe, expect, it } from "vitest";
import { formatDateTime } from "./dateTime";

describe("formatDateTime", () => {
  it("formats UTC ISO timestamps as Asia/Shanghai seconds", () => {
    expect(formatDateTime("2026-07-20T02:42:45.569075+00:00")).toBe("2026-07-20 10:42:45");
  });

  it("treats naive API ISO timestamps as UTC", () => {
    expect(formatDateTime("2026-07-20T02:42:45")).toBe("2026-07-20 10:42:45");
  });

  it("keeps local display timestamps stable", () => {
    expect(formatDateTime("2026-07-20 10:42:45")).toBe("2026-07-20 10:42:45");
  });
});
