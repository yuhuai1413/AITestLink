import { describe, it, expect } from "vitest";
import { generateId } from "./generateId";

describe("generateId", () => {
  it("generates ID with prefix", () => {
    const id = generateId("project");
    expect(id).toMatch(/^project-\d+-\d+$/);
  });

  it("generates unique IDs", () => {
    const id1 = generateId("test");
    const id2 = generateId("test");
    expect(id1).not.toBe(id2);
  });

  it("includes timestamp in ID", () => {
    const before = Date.now();
    const id = generateId("p");
    const after = Date.now();
    const timestamp = parseInt(id.split("-")[1]);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);
  });

  it("increments counter", () => {
    const id1 = generateId("x");
    const id2 = generateId("x");
    const counter1 = parseInt(id1.split("-")[2]);
    const counter2 = parseInt(id2.split("-")[2]);
    expect(counter2).toBe(counter1 + 1);
  });

  it("works with different prefixes", () => {
    const id1 = generateId("file");
    const id2 = generateId("req");
    expect(id1.startsWith("file-")).toBe(true);
    expect(id2.startsWith("req-")).toBe(true);
  });
});
