import { useCallback, useEffect, useRef } from "react";
import { useStore } from "../app/store";
import {
  projectsApi,
  filesApi,
  requirementsApi,
  testPointsApi,
  testCasesApi,
  aiApi,
  scriptsApi,
} from "../api/client";
import type { ApiProject, ApiFile, ApiRequirement, ApiTestPoint, ApiTestCase, ApiAITask, ApiScript } from "../api/client";
import type { Project, FileAsset, Requirement, TestPoint, TestCase, AITask, AutomationScript } from "../shared/types/platform";

/** Sync frontend store with backend API (non-blocking). Pass enabled=false to skip (e.g. before login). */
export function useAPISync(enabled = true) {
  const { state, dispatch } = useStore();
  const initialized = useRef(false);
  const prevEnabled = useRef(enabled);

  useEffect(() => {
    // 用户状态变化时重置初始化标记
    if (prevEnabled.current !== enabled) {
      prevEnabled.current = enabled;
      initialized.current = false;
    }
    if (!enabled || initialized.current) return;
    initialized.current = true;

    const safe = async <T,>(fn: () => Promise<T>): Promise<T | null> => {
      try {
        return await fn();
      } catch {
        return null;
      }
    };

    async function loadAll() {
      const projects = await safe(() => projectsApi.list());
      if (!projects || !Array.isArray(projects)) return;

      // Batch-load related data by project in parallel
      const [allFiles, allReqs, allTps, allTcs, allScripts] = await Promise.all([
        safe(() => loadByProject(projects, (id) => filesApi.list(id))),
        safe(() => loadByProject(projects, (id) => requirementsApi.list(id))),
        safe(() => loadByProject(projects, (id) => testPointsApi.list(id))),
        safe(() => loadByProject(projects, (id) => testCasesApi.list(id))),
        safe(() => loadByProject(projects, (id) => scriptsApi.list(id))),
      ]);

      projects.forEach((p) => dispatch({ type: "ADD_PROJECT", payload: apiToProject(p) }));
      (allFiles ?? []).forEach((f) => dispatch({ type: "ADD_FILE", payload: apiToFile(f) }));
      (allReqs ?? []).forEach((r) => dispatch({ type: "ADD_REQUIREMENT", payload: apiToRequirement(r) }));
      (allTps ?? []).forEach((tp) => dispatch({ type: "ADD_TEST_POINT", payload: apiToTestPoint(tp) }));
      (allTcs ?? []).forEach((tc) => dispatch({ type: "ADD_TEST_CASE", payload: apiToTestCase(tc) }));
      (allScripts ?? []).forEach((s) => dispatch({ type: "ADD_SCRIPT", payload: apiToScript(s) }));
    }

    loadAll();
  }, [dispatch, enabled]);

  return {
    createProject: useCallback(async (data: Record<string, unknown>) => {
      const apiProject = await projectsApi.create(data as Record<string, unknown>);
      dispatch({ type: "ADD_PROJECT", payload: apiToProject(apiProject) });
      return apiProject;
    }, [dispatch]),

    updateProject: useCallback(async (id: string, data: Record<string, unknown>) => {
      const apiProject = await projectsApi.update(id, data as Record<string, unknown>);
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

    deleteFile: useCallback(async (id: string) => {
      await filesApi.delete(id);
      dispatch({ type: "DELETE_FILE", payload: id });
    }, [dispatch]),

    updateRequirement: useCallback(async (id: string, data: Record<string, unknown>) => {
      await requirementsApi.update(id, data as Record<string, unknown>);
      const localReq = state.requirements.find((r) => r.id === id);
      if (localReq) {
        dispatch({ type: "UPDATE_REQUIREMENT", payload: { ...localReq, ...data } });
      }
    }, [dispatch, state.requirements.length]),

    updateTestPoint: useCallback(async (id: string, data: Record<string, unknown>) => {
      await testPointsApi.update(id, data as Record<string, unknown>);
      const localTp = state.testPoints.find((tp) => tp.id === id);
      if (localTp) {
        dispatch({ type: "UPDATE_TEST_POINT", payload: { ...localTp, ...data } });
      }
    }, [dispatch, state.testPoints.length]),

    deleteTestPoint: useCallback(async (id: string) => {
      await testPointsApi.delete(id);
      dispatch({ type: "DELETE_TEST_POINT", payload: id });
    }, [dispatch]),

    updateTestCase: useCallback(async (id: string, data: Record<string, unknown>) => {
      await testCasesApi.update(id, data as Record<string, unknown>);
      const localTc = state.testCases.find((tc) => tc.id === id);
      if (localTc) {
        dispatch({ type: "UPDATE_TEST_CASE", payload: { ...localTc, ...data } });
      }
    }, [dispatch, state.testCases.length]),

    deleteTestCase: useCallback(async (id: string) => {
      await testCasesApi.delete(id);
      dispatch({ type: "DELETE_TEST_CASE", payload: id });
    }, [dispatch]),

    parseRequirements: useCallback(async (projectId: string) => {
      const task = await aiApi.parseRequirements(projectId);
      dispatch({ type: "ADD_AI_TASK", payload: apiToAITask(task) });
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

async function loadByProject<T>(
  projects: ApiProject[],
  loader: (projectId: string) => Promise<T[]>,
): Promise<T[]> {
  const results = await Promise.allSettled(projects.map((p) => loader(p.id)));
  const items: T[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      items.push(...r.value);
    }
  }
  return items;
}

async function pollAITask(taskId: string, projectId: string, dispatch: React.Dispatch<Action>) {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const tasks = await aiApi.listTasks(projectId);
      const task = tasks.find((t) => t.id === taskId);
      if (task && (task.status === "成功" || task.status === "失败")) {
        dispatch({ type: "UPDATE_AI_TASK", payload: apiToAITask(task) });

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
    } catch { /* retry */ }
  }
  return null;
}

// ─── API → Store type converters ───

const STATUS_MAP: Record<string, Project["status"]> = {
  "待测试": "设计中",
  "测试中": "执行中",
  "已测试": "已完成",
};

function apiToProject(p: ApiProject): Project {
  return {
    id: p.id, name: p.name, version: p.version,
    testType: p.testType as Project["testType"],
    testStatus: p.testStatus,
    docStatus: p.docStatus,
    status: STATUS_MAP[p.testStatus] ?? "设计中",
    description: p.description, caseCount: p.caseCount, passRate: p.passRate,
    priority: p.priority as Project["priority"],
    riskLevel: p.priority as Project["riskLevel"],
    createdAt: p.createdAt, updatedAt: p.updatedAt,
  };
}

function apiToFile(f: ApiFile): FileAsset {
  return {
    id: f.id, projectId: f.projectId, name: f.name,
    fileType: f.fileType as FileAsset["fileType"],
    size: f.size, parseStatus: f.parseStatus as FileAsset["parseStatus"],
    uploadedAt: f.uploadedAt,
  };
}

function apiToRequirement(r: ApiRequirement): Requirement {
  return {
    id: r.id, projectId: r.projectId, module: r.module, feature: r.feature,
    source: r.source, risk: r.risk as Requirement["risk"],
    rule: r.rule, question: r.question, confirmed: r.confirmed,
    reviewStatus: (r as any).reviewStatus ?? "待评审",
  };
}

function apiToTestPoint(tp: ApiTestPoint): TestPoint {
  return {
    id: tp.id, projectId: tp.projectId, requirementId: tp.requirementId,
    module: tp.module, type: tp.type as TestPoint["type"],
    title: tp.title, description: tp.description,
    priority: tp.priority as TestPoint["priority"],
    automatable: tp.automatable, reviewStatus: tp.reviewStatus as TestPoint["reviewStatus"],
    createdAt: tp.createdAt,
  };
}

function apiToTestCase(tc: ApiTestCase): TestCase {
  return {
    id: tc.id, projectId: tc.projectId, testPointId: tc.testPointId,
    requirementId: tc.requirementId, caseCode: tc.caseCode, module: tc.module,
    feature: tc.feature, title: tc.title, priority: tc.priority as TestCase["priority"],
    precondition: tc.precondition, steps: tc.steps, testData: tc.testData,
    expectedResult: tc.expectedResult, automation: tc.automation as TestCase["automation"],
    reviewStatus: tc.reviewStatus as TestCase["reviewStatus"],
    remark: tc.remark, createdAt: tc.createdAt, updatedAt: tc.updatedAt,
  };
}

function apiToAITask(t: ApiAITask): AITask {
  return {
    id: t.id, projectId: t.projectId, type: t.type as AITask["type"],
    status: t.status as AITask["status"], modelName: t.modelName,
    errorMessage: t.errorMessage ?? undefined,
    createdAt: t.createdAt, finishedAt: t.finishedAt ?? undefined,
  };
}

function apiToScript(s: ApiScript): AutomationScript {
  return {
    id: s.id, projectId: s.projectId, testCaseId: s.testCaseId ?? undefined,
    scriptType: s.scriptType as AutomationScript["scriptType"],
    framework: s.framework as AutomationScript["framework"],
    language: s.language, code: s.code,
    status: s.status as AutomationScript["status"],
    generatedByAi: s.generatedByAi,
    createdAt: s.createdAt, updatedAt: s.updatedAt,
  };
}

// Re-export Action type for pollAITask
type Action =
  | { type: "ADD_PROJECT"; payload: Project }
  | { type: "UPDATE_PROJECT"; payload: Project }
  | { type: "DELETE_PROJECT"; payload: string }
  | { type: "ADD_FILE"; payload: FileAsset }
  | { type: "UPDATE_FILE"; payload: FileAsset }
  | { type: "DELETE_FILE"; payload: string }
  | { type: "ADD_REQUIREMENT"; payload: Requirement }
  | { type: "ADD_REQUIREMENTS"; payload: Requirement[] }
  | { type: "UPDATE_REQUIREMENT"; payload: Requirement }
  | { type: "CONFIRM_REQUIREMENT"; payload: string }
  | { type: "ADD_TEST_POINT"; payload: TestPoint }
  | { type: "ADD_TEST_POINTS"; payload: TestPoint[] }
  | { type: "UPDATE_TEST_POINT"; payload: TestPoint }
  | { type: "DELETE_TEST_POINT"; payload: string }
  | { type: "ADD_TEST_CASE"; payload: TestCase }
  | { type: "ADD_TEST_CASES"; payload: TestCase[] }
  | { type: "UPDATE_TEST_CASE"; payload: TestCase }
  | { type: "DELETE_TEST_CASE"; payload: string }
  | { type: "ADD_AI_TASK"; payload: AITask }
  | { type: "UPDATE_AI_TASK"; payload: AITask }
  | { type: "ADD_SCRIPT"; payload: AutomationScript }
  | { type: "ADD_SCRIPTS"; payload: AutomationScript[] }
  | { type: "UPDATE_SCRIPT"; payload: AutomationScript }
  | { type: "DELETE_SCRIPT"; payload: string };
