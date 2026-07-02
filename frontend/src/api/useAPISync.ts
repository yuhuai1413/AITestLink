import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../app/store";
import {
  projectsApi,
  filesApi,
  requirementsApi,
  testPointsApi,
  testCasesApi,
  aiApi,
} from "../api/client";
import type { ApiProject, ApiFile, ApiRequirement, ApiTestPoint, ApiTestCase, ApiAITask } from "../api/client";
import type { Project, FileAsset, Requirement, TestPoint, TestCase, AITask } from "../shared/types/platform";

/** Sync frontend store with backend API */
export function useAPISync() {
  const { state, dispatch } = useStore();
  const initialized = useRef(false);

  // Load initial data from API
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    async function loadAll() {
      try {
        const [projects, files, requirements, testPoints, testCases] = await Promise.all([
          projectsApi.list(),
          loadAllFiles(),
          loadAllRequirements(),
          loadAllTestPoints(),
          loadAllTestCases(),
        ]);

        // Populate store
        projects.forEach((p) => dispatch({ type: "ADD_PROJECT", payload: apiToProject(p) }));
        files.forEach((f) => dispatch({ type: "ADD_FILE", payload: apiToFile(f) }));
        requirements.forEach((r) => dispatch({ type: "ADD_REQUIREMENT", payload: apiToRequirement(r) }));
        testPoints.forEach((tp) => dispatch({ type: "ADD_TEST_POINT", payload: apiToTestPoint(tp) }));
        testCases.forEach((tc) => dispatch({ type: "ADD_TEST_CASE", payload: apiToTestCase(tc) }));
      } catch (err) {
        console.warn("API not available, using local data:", err);
      }
    }

    loadAll();
  }, [dispatch]);

  return {
    // API wrappers that also update store
    createProject: useCallback(async (data: Record<string, unknown>) => {
      const apiProject = await projectsApi.create(data as any);
      dispatch({ type: "ADD_PROJECT", payload: apiToProject(apiProject) });
      return apiProject;
    }, [dispatch]),

    updateProject: useCallback(async (id: string, data: Record<string, unknown>) => {
      const apiProject = await projectsApi.update(id, data as any);
      dispatch({ type: "UPDATE_PROJECT", payload: apiToProject(apiProject) });
    }, [dispatch]),

    deleteProject: useCallback(async (id: string) => {
      await projectsApi.delete(id);
      dispatch({ type: "DELETE_PROJECT", payload: id });
    }, [dispatch]),

    uploadFile: useCallback(async (projectId: string, file: File) => {
      const apiFile = await filesApi.upload(projectId, file);
      dispatch({ type: "ADD_FILE", payload: apiToFile(apiFile) });
    }, [dispatch]),

    updateRequirement: useCallback(async (id: string, data: Record<string, unknown>) => {
      const apiReq = await requirementsApi.update(id, data as any);
      const localReq = state.requirements.find((r) => r.id === id);
      if (localReq) {
        dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...localReq, ...data } });
      }
    }, [dispatch, state.requirements]),

    updateTestPoint: useCallback(async (id: string, data: Record<string, unknown>) => {
      const apiTp = await testPointsApi.update(id, data as any);
      const localTp = state.testPoints.find((tp) => tp.id === id);
      if (localTp) {
        dispatch({ type: "UPDATE_TEST_POINT", payload: { ...localTp, ...data } as any });
      }
    }, [dispatch, state.testPoints]),

    deleteTestPoint: useCallback(async (id: string) => {
      await testPointsApi.delete(id);
      dispatch({ type: "DELETE_TEST_POINT", payload: id });
    }, [dispatch]),

    updateTestCase: useCallback(async (id: string, data: Record<string, unknown>) => {
      const apiTc = await testCasesApi.update(id, data as any);
      const localTc = state.testCases.find((tc) => tc.id === id);
      if (localTc) {
        dispatch({ type: "UPDATE_TEST_CASE", payload: { ...localTc, ...data } as any });
      }
    }, [dispatch, state.testCases]),

    deleteTestCase: useCallback(async (id: string) => {
      await testCasesApi.delete(id);
      dispatch({ type: "DELETE_TEST_CASE", payload: id });
    }, [dispatch]),

    // AI operations
    parseRequirements: useCallback(async (projectId: string) => {
      const task = await aiApi.parseRequirements(projectId);
      dispatch({ type: "ADD_AI_TASK", payload: apiToAITask(task) });
      // Poll for completion
      return pollAITask(task.id, projectId, dispatch);
    }, [dispatch]),

    generateTestPoints: useCallback(async (projectId: string) => {
      const task = await aiApi.generateTestPoints(projectId);
      dispatch({ type: "ADD_AI_TASK", payload: apiToAITask(task) });
      return pollAITask(task.id, projectId, dispatch);
    }, [dispatch]),

    generateTestCases: useCallback(async (projectId: string) => {
      const task = await aiApi.generateTestCases(projectId);
      dispatch({ type: "ADD_AI_TASK", payload: apiToAITask(task) });
      return pollAITask(task.id, projectId, dispatch);
    }, [dispatch]),
  };
}

// ─── Helpers ───

async function loadAllFiles(): Promise<ApiFile[]> {
  const projects = await projectsApi.list();
  const allFiles: ApiFile[] = [];
  for (const p of projects) {
    try {
      const files = await filesApi.list(p.id);
      allFiles.push(...files);
    } catch {}
  }
  return allFiles;
}

async function loadAllRequirements(): Promise<ApiRequirement[]> {
  const projects = await projectsApi.list();
  const all: ApiRequirement[] = [];
  for (const p of projects) {
    try {
      const items = await requirementsApi.list(p.id);
      all.push(...items);
    } catch {}
  }
  return all;
}

async function loadAllTestPoints(): Promise<ApiTestPoint[]> {
  const projects = await projectsApi.list();
  const all: ApiTestPoint[] = [];
  for (const p of projects) {
    try {
      const items = await testPointsApi.list(p.id);
      all.push(...items);
    } catch {}
  }
  return all;
}

async function loadAllTestCases(): Promise<ApiTestCase[]> {
  const projects = await projectsApi.list();
  const all: ApiTestCase[] = [];
  for (const p of projects) {
    try {
      const items = await testCasesApi.list(p.id);
      all.push(...items);
    } catch {}
  }
  return all;
}

async function pollAITask(taskId: string, projectId: string, dispatch: React.Dispatch<any>) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const tasks = await aiApi.listTasks(projectId);
      const task = tasks.find((t) => t.id === taskId);
      if (task && (task.status === "成功" || task.status === "失败")) {
        dispatch({ type: "UPDATE_AI_TASK", payload: apiToAITask(task) });

        // Reload data after successful AI task
        if (task.status === "成功") {
          if (task.type === "需求解析") {
            const reqs = await requirementsApi.list(projectId);
            reqs.forEach((r) => dispatch({ type: "ADD_REQUIREMENT", payload: apiToRequirement(r) }));
          } else if (task.type === "测试点生成") {
            const tps = await testPointsApi.list(projectId);
            tps.forEach((tp) => dispatch({ type: "ADD_TEST_POINT", payload: apiToTestPoint(tp) }));
          } else if (task.type === "用例生成") {
            const tcs = await testCasesApi.list(projectId);
            tcs.forEach((tc) => dispatch({ type: "ADD_TEST_CASE", payload: apiToTestCase(tc) }));
          }
        }
        return task;
      }
    } catch {}
  }
  return null;
}

// ─── API → Store type converters ───

function apiToProject(p: ApiProject): Project {
  return {
    id: p.id, name: p.name, version: p.version, owner: p.owner,
    testType: p.testType as any, status: p.status as any,
    description: p.description, caseCount: p.caseCount, passRate: p.passRate,
    riskLevel: p.riskLevel as any, createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

function apiToFile(f: ApiFile): FileAsset {
  return {
    id: f.id, projectId: f.projectId, name: f.name,
    fileType: f.fileType as any, size: f.size,
    parseStatus: f.parseStatus as any, uploadedAt: f.uploadedAt,
  };
}

function apiToRequirement(r: ApiRequirement): Requirement {
  return {
    id: r.id, projectId: r.projectId, module: r.module, feature: r.feature,
    source: r.source, risk: r.risk as any, rule: r.rule,
    question: r.question, confirmed: r.confirmed,
  };
}

function apiToTestPoint(tp: ApiTestPoint): TestPoint {
  return {
    id: tp.id, projectId: tp.projectId, requirementId: tp.requirementId,
    module: tp.module, type: tp.type as any, title: tp.title,
    description: tp.description, priority: tp.priority as any,
    automatable: tp.automatable, reviewStatus: tp.reviewStatus as any,
  };
}

function apiToTestCase(tc: ApiTestCase): TestCase {
  return {
    id: tc.id, projectId: tc.projectId, testPointId: tc.testPointId,
    requirementId: tc.requirementId, caseCode: tc.caseCode, module: tc.module,
    feature: tc.feature, title: tc.title, priority: tc.priority as any,
    precondition: tc.precondition, steps: tc.steps, testData: tc.testData,
    expectedResult: tc.expectedResult, automation: tc.automation as any,
    reviewStatus: tc.reviewStatus as any, remark: tc.remark,
    createdAt: tc.createdAt, updatedAt: tc.updatedAt,
  };
}

function apiToAITask(t: ApiAITask): AITask {
  return {
    id: t.id, projectId: t.projectId, type: t.type as any,
    status: t.status as any, modelName: t.modelName,
    errorMessage: t.errorMessage ?? undefined,
    createdAt: t.createdAt, finishedAt: t.finishedAt ?? undefined,
  };
}
