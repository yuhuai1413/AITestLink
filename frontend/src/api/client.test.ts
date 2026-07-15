import { describe, it, expect, vi, beforeEach } from "vitest";
import { projectsApi, testPointsApi, testCasesApi, filesApi, requirementsApi, aiApi } from "./client";

describe("API Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Mock localStorage for jsdom environment
    const localStorageMock = {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    };
    vi.stubGlobal("localStorage", localStorageMock);
  });

  describe("projectsApi", () => {
    it("list returns array", async () => {
      const mockData = [{ id: "1", name: "Test" }];
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }));

      const result = await projectsApi.list();
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      }));
    });

    it("create sends POST with body", async () => {
      const mockData = { id: "1", name: "New" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }));

      const payload = { name: "New", testType: "首轮全量测试" as const };
      const result = await projectsApi.create(payload);
      expect(result).toEqual(mockData);
      expect(fetch).toHaveBeenCalledWith("/api/projects", expect.objectContaining({
        method: "POST",
        body: JSON.stringify(payload),
      }));
    });

    it("delete sends DELETE method", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ok: true }),
      }));

      const result = await projectsApi.delete("proj-1");
      expect(result.ok).toBe(true);
      expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1", expect.objectContaining({
        method: "DELETE",
      }));
    });

    it("throws on non-OK response", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      }));

      await expect(projectsApi.get("nonexistent")).rejects.toThrow("Not Found");
    });
  });

  describe("testPointsApi", () => {
    it("list filters by project", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }));

      await testPointsApi.list("proj-1");
      expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/test-points", expect.anything());
    });

    it("create sends POST", async () => {
      const mockData = { id: "tp-1", title: "Test" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }));

      await testPointsApi.create("proj-1", { module: "登录", type: "正常流程", title: "Test" });
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/proj-1/test-points",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });

  describe("testCasesApi", () => {
    it("list filters by project", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve([]),
      }));

      await testCasesApi.list("proj-1");
      expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/test-cases", expect.anything());
    });
  });

  describe("filesApi", () => {
    it("upload uses FormData", async () => {
      const mockData = { id: "f-1", name: "test.txt" };
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      }));

      const file = new File(["content"], "test.txt", { type: "text/plain" });
      const result = await filesApi.upload("proj-1", file);

      expect(result).toEqual(mockData);
      const callArgs = vi.mocked(fetch).mock.calls[0]!;
      expect(callArgs[1]?.method).toBe("POST");
      expect(callArgs[1]?.body).toBeInstanceOf(FormData);
    });
  });

  describe("requirementsApi", () => {
    it("update sends PUT", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ confirmed: true }),
      }));

      await requirementsApi.update("req-1", { confirmed: true });
      expect(fetch).toHaveBeenCalledWith(
        "/api/requirements/req-1",
        expect.objectContaining({ method: "PUT" }),
      );
    });
  });

  describe("aiApi", () => {
    it("parseRequirements sends POST", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "t-1", status: "执行中" }),
      }));

      await aiApi.parseRequirements("proj-1");
      expect(fetch).toHaveBeenCalledWith(
        "/api/projects/proj-1/ai/parse-requirements",
        expect.objectContaining({ method: "POST" }),
      );
    });
  });
});
