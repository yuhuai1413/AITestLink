import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { storeReducer, type AppState } from "../store";

// Initial state for testing reducer
const emptyState: AppState = {
  projects: [],
  files: [],
  requirements: [],
  testPoints: [],
  testCases: [],
  aiTasks: [],
};

const sampleProject = {
  id: "p-1", name: "Test Project",
  testType: "功能测试" as const, testStatus: "待测试" as const, docStatus: "待解析" as const,
  description: "", caseCount: 0, passRate: 0, priority: "中" as const,
  createdAt: "2025-01-01", updatedAt: "2025-01-01",
};

const sampleRequirement = {
  id: "r-1", projectId: "p-1", module: "M", feature: "F",
  source: "", risk: "中" as const, rule: "", question: "", confirmed: false,
};

const sampleTestPoint = {
  id: "tp-1", projectId: "p-1", module: "M", type: "正常流程" as const,
  title: "T", description: "", priority: "P1" as const,
  automatable: false, reviewStatus: "待评审" as const,
};

const sampleTestCase = {
  id: "tc-1", projectId: "p-1", caseCode: "TC_001", module: "M",
  feature: "", title: "T", priority: "P1" as const,
  precondition: "", steps: "", testData: "", expectedResult: "",
  automation: "待评估" as const, reviewStatus: "待评审" as const, remark: "",
  createdAt: "2025-01-01", updatedAt: "2025-01-01",
};

describe("storeReducer", () => {
  describe("Project actions", () => {
    it("ADD_PROJECT adds project", () => {
      const state = storeReducer(emptyState, { type: "ADD_PROJECT", payload: sampleProject });
      expect(state.projects).toHaveLength(1);
      expect(state.projects[0].id).toBe("p-1");
    });

    it("UPDATE_PROJECT updates project", () => {
      const state = storeReducer(
        { ...emptyState, projects: [sampleProject] },
        { type: "UPDATE_PROJECT", payload: { ...sampleProject, name: "Updated" } },
      );
      expect(state.projects[0].name).toBe("Updated");
    });

    it("UPDATE_PROJECT does not affect other projects", () => {
      const other = { ...sampleProject, id: "p-2", name: "Other" };
      const state = storeReducer(
        { ...emptyState, projects: [sampleProject, other] },
        { type: "UPDATE_PROJECT", payload: { ...sampleProject, name: "Updated" } },
      );
      expect(state.projects[1].name).toBe("Other");
    });

    it("DELETE_PROJECT removes project and related entities", () => {
      const state = storeReducer(
        {
          ...emptyState,
          projects: [sampleProject],
          files: [{ id: "f-1", projectId: "p-1" } as any],
          requirements: [sampleRequirement],
          testPoints: [sampleTestPoint],
          testCases: [sampleTestCase],
          aiTasks: [{ id: "t-1", projectId: "p-1" } as any],
        },
        { type: "DELETE_PROJECT", payload: "p-1" },
      );
      expect(state.projects).toHaveLength(0);
      expect(state.files).toHaveLength(0);
      expect(state.requirements).toHaveLength(0);
      expect(state.testPoints).toHaveLength(0);
      expect(state.testCases).toHaveLength(0);
      expect(state.aiTasks).toHaveLength(0);
    });
  });

  describe("File actions", () => {
    it("ADD_FILE adds file", () => {
      const file = { id: "f-1", projectId: "p-1", name: "test.txt" } as any;
      const state = storeReducer(emptyState, { type: "ADD_FILE", payload: file });
      expect(state.files).toHaveLength(1);
    });

    it("DELETE_FILE removes file", () => {
      const file = { id: "f-1", projectId: "p-1" } as any;
      const state = storeReducer(
        { ...emptyState, files: [file] },
        { type: "DELETE_FILE", payload: "f-1" },
      );
      expect(state.files).toHaveLength(0);
    });
  });

  describe("Requirement actions", () => {
    it("ADD_REQUIREMENT adds requirement", () => {
      const state = storeReducer(emptyState, { type: "ADD_REQUIREMENT", payload: sampleRequirement });
      expect(state.requirements).toHaveLength(1);
    });

    it("ADD_REQUIREMENTS batch adds", () => {
      const reqs = [
        { ...sampleRequirement, id: "r-1" },
        { ...sampleRequirement, id: "r-2" },
      ];
      const state = storeReducer(emptyState, { type: "ADD_REQUIREMENTS", payload: reqs });
      expect(state.requirements).toHaveLength(2);
    });

    it("CONFIRM_REQUIREMENT sets confirmed to true", () => {
      const state = storeReducer(
        { ...emptyState, requirements: [sampleRequirement] },
        { type: "CONFIRM_REQUIREMENT", payload: "r-1" },
      );
      expect(state.requirements[0].confirmed).toBe(true);
    });
  });

  describe("TestPoint actions", () => {
    it("ADD_TEST_POINT adds", () => {
      const state = storeReducer(emptyState, { type: "ADD_TEST_POINT", payload: sampleTestPoint });
      expect(state.testPoints).toHaveLength(1);
    });

    it("ADD_TEST_POINTS batch adds", () => {
      const tps = [
        { ...sampleTestPoint, id: "tp-1" },
        { ...sampleTestPoint, id: "tp-2" },
      ];
      const state = storeReducer(emptyState, { type: "ADD_TEST_POINTS", payload: tps });
      expect(state.testPoints).toHaveLength(2);
    });

    it("UPDATE_TEST_POINT updates", () => {
      const state = storeReducer(
        { ...emptyState, testPoints: [sampleTestPoint] },
        { type: "UPDATE_TEST_POINT", payload: { ...sampleTestPoint, title: "Updated" } },
      );
      expect(state.testPoints[0].title).toBe("Updated");
    });

    it("DELETE_TEST_POINT removes", () => {
      const state = storeReducer(
        { ...emptyState, testPoints: [sampleTestPoint] },
        { type: "DELETE_TEST_POINT", payload: "tp-1" },
      );
      expect(state.testPoints).toHaveLength(0);
    });
  });

  describe("TestCase actions", () => {
    it("ADD_TEST_CASE adds", () => {
      const state = storeReducer(emptyState, { type: "ADD_TEST_CASE", payload: sampleTestCase });
      expect(state.testCases).toHaveLength(1);
    });

    it("ADD_TEST_CASES batch adds", () => {
      const tcs = [
        { ...sampleTestCase, id: "tc-1" },
        { ...sampleTestCase, id: "tc-2" },
      ];
      const state = storeReducer(emptyState, { type: "ADD_TEST_CASES", payload: tcs });
      expect(state.testCases).toHaveLength(2);
    });

    it("DELETE_TEST_CASE removes", () => {
      const state = storeReducer(
        { ...emptyState, testCases: [sampleTestCase] },
        { type: "DELETE_TEST_CASE", payload: "tc-1" },
      );
      expect(state.testCases).toHaveLength(0);
    });
  });

  describe("AITask actions", () => {
    it("ADD_AI_TASK adds", () => {
      const task = { id: "t-1", projectId: "p-1", type: "需求解析", status: "执行中" } as any;
      const state = storeReducer(emptyState, { type: "ADD_AI_TASK", payload: task });
      expect(state.aiTasks).toHaveLength(1);
    });

    it("UPDATE_AI_TASK updates", () => {
      const task = { id: "t-1", projectId: "p-1", status: "执行中" } as any;
      const updatedTask = { ...task, status: "成功" };
      const state = storeReducer(
        { ...emptyState, aiTasks: [task] },
        { type: "UPDATE_AI_TASK", payload: updatedTask },
      );
      expect(state.aiTasks[0].status).toBe("成功");
    });
  });

  describe("Default case", () => {
    it("returns state for unknown action", () => {
      const state = storeReducer(emptyState, { type: "UNKNOWN" as any, payload: null });
      expect(state).toBe(emptyState);
    });
  });
});
