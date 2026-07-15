/**
 * 全局 AI 任务管理器
 * 独立于 React 组件运行，切换 tab 或退出页面时轮询不中断。
 * 任务完成/失败时自动往 store 里写通知。
 */
import { aiApi, modelConfigApi, requirementsApi, testPointsApi, testCasesApi, scriptsApi } from "../../api/client";
import type { ApiRequirement, ApiTestPoint, ApiTestCase } from "../../api/client";
import { toast } from "sonner";
import { addTaskNotification, initNotificationContext } from "../ai-tasks/aiTaskNotifications";
import type { AITaskType } from "../types/platform";

// ── 持有 store dispatch 的引用（由 initManager 注入） ──
let _dispatch: React.Dispatch<any> | null = null;

export function initManager(
  dispatch: React.Dispatch<any>,
  getProjects: () => { id: string; name: string }[],
) {
  _dispatch = dispatch;
  initNotificationContext(dispatch, getProjects);
}

export const addNotification = addTaskNotification;

// ── 活跃轮询任务 ──
const activeTasks = new Map<string, AbortController>();

// ── 轮询 AI 任务状态 ──
async function pollAITask(
  projectId: string,
  taskId: string,
  signal: AbortSignal,
): Promise<{ success: boolean; error?: string }> {
  for (let i = 0; i < 600; i++) {
    if (signal.aborted) return { success: false };
    await new Promise((r) => setTimeout(r, 1000));
    if (signal.aborted) return { success: false };
    try {
      const tasks = await aiApi.listTasks(projectId);
      const task = tasks.find((t) => t.id === taskId);
      if (task && (task.status === "成功" || task.status === "失败")) {
        if (_dispatch) {
          _dispatch({
            type: "UPDATE_AI_TASK",
            payload: {
              id: task.id,
              projectId: task.projectId,
              type: task.type,
              status: task.status,
              modelName: task.modelName,
              createdAt: task.createdAt,
              finishedAt: task.finishedAt ?? undefined,
              errorMessage: task.errorMessage ?? undefined,
            },
          });
        }
        if (task.status === "成功") return { success: true };
        return { success: false, error: task.errorMessage || undefined };
      }
    } catch (e) { console.warn('Polling error:', e); }
  }
  return { success: false, error: "任务超时未响应" };
}

// ── 任务类型 → 目标页面映射 ──
const TASK_TAB_MAP: Record<string, string> = {
  "需求解析": "requirements",
  "测试点生成": "testPoints",
  "用例生成": "testCases",
  "文档生成": "docGenerate",
};

function getTargetTab(projectId: string, _taskType: string): string {
  return `/projects/${projectId}`;
}

// ── 公共 API ──

function makeTaskKey(projectId: string, type: string) {
  return `${projectId}:${type}`;
}

/** 检查模型配置 */
async function checkConfig(projectId: string, taskType: string): Promise<boolean> {
  try {
    const result = await aiApi.checkConfig(projectId, taskType);
    return result.configured;
  } catch {
    return false;
  }
}

/**
 * 验证 AI 节点：检查是否启用 + 测试连通性
 * 返回 { ok, error? } — 失败时 error 包含中文提示
 */
async function verifyAIConfig(projectId: string, taskType: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const result = await aiApi.checkConfig(projectId, taskType);
    if (!result.configured) {
      return { ok: false, error: result.message || "模型未配置" };
    }
    // 用 configId 测试连通性
    if (result.configId) {
      const test = await modelConfigApi.test(result.configId);
      if (!test.ok) {
        return { ok: false, error: test.message || "模型连通测试失败" };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "AI 节点验证失败" };
  }
}

/** 启动一个轮询任务，返回 { success, error? } */
async function runTask(
  projectId: string,
  taskType: AITaskType,
  apiCall: () => Promise<{ id: string; projectId: string; type: string; status: string; modelName: string; createdAt: string }>,
  onSuccess?: () => Promise<void>,
  opts?: { skipStartDispatch?: boolean },
): Promise<{ success: boolean; error?: string }> {
  const key = makeTaskKey(projectId, taskType);

  // 如果同类任务正在进行，先取消
  if (activeTasks.has(key)) {
    activeTasks.get(key)!.abort();
    activeTasks.delete(key);
  }

  const controller = new AbortController();
  activeTasks.set(key, controller);

  try {
    const task = await apiCall();
    if (_dispatch) {
      if (!opts?.skipStartDispatch) {
        _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:${taskType}` });
      }
      _dispatch({
        type: "ADD_AI_TASK",
        payload: {
          id: task.id,
          projectId: task.projectId,
          type: task.type as any,
          status: task.status as any,
          modelName: task.modelName,
          createdAt: task.createdAt,
        },
      });
    }

    const pollResult = await pollAITask(projectId, task.id, controller.signal);

    if (pollResult.success) {
      if (onSuccess) await onSuccess();
      addNotification("任务完成", taskType, projectId, `${taskType}已完成`, getTargetTab(projectId, taskType));
      return { success: true };
    } else {
      const errorMsg = pollResult.error || `${taskType}失败`;
      if (!controller.signal.aborted) {
        addNotification("任务失败", taskType, projectId, `${errorMsg}`, getTargetTab(projectId, taskType));
      }
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      const msg = err instanceof Error ? err.message : "未知错误";
      addNotification("任务失败", taskType, projectId, `${taskType}失败: ${msg}`, `/projects/${projectId}`);
    }
    return { success: false, error: err instanceof Error ? err.message : "未知错误" };
  } finally {
    activeTasks.delete(key);
    if (_dispatch) {
      _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:${taskType}` });
    }
  }
}

// ── 便捷方法 ──

export async function startParseRequirements(projectId: string) {
  try {
    // 立即更新 UI 状态，避免用户等待验证
    if (_dispatch) {
      _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:需求解析` });
    }

    const verify = await verifyAIConfig(projectId, "需求解析");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:需求解析` });
      addNotification("任务失败", "需求解析", projectId, `需求解析失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("需求解析已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "需求解析", () => aiApi.parseRequirements(projectId), async () => {
      const reqs = await requirementsApi.list(projectId);
      if (_dispatch) {
        _dispatch({ type: "CLEAR_REQUIREMENTS", payload: projectId });
        reqs.forEach((r: ApiRequirement) => {
          _dispatch!({
            type: "ADD_REQUIREMENT",
            payload: {
              id: r.id, projectId: r.projectId, module: r.module, feature: r.feature,
              source: r.source, risk: r.risk, rule: r.rule, question: r.question, confirmed: r.confirmed,
              createdAt: r.createdAt, updatedAt: r.updatedAt,
            },
          });
        });
      }
    }, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "需求解析失败";
    addNotification("任务失败", "需求解析", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:需求解析` });
    return { success: false, error: msg };
  }
}

export async function startGenerateTestPoints(projectId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:测试点生成` });

    const verify = await verifyAIConfig(projectId, "测试点生成");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:测试点生成` });
      addNotification("任务失败", "测试点生成", projectId, `测试点生成失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("测试点生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "测试点生成", () => aiApi.generateTestPoints(projectId), async () => {
      const tps = await testPointsApi.list(projectId);
      if (_dispatch) {
        _dispatch({ type: "CLEAR_TEST_POINTS", payload: projectId });
        tps.forEach((tp: ApiTestPoint) => {
          _dispatch!({
            type: "ADD_TEST_POINT",
            payload: {
              id: tp.id, projectId: tp.projectId, requirementId: tp.requirementId ?? undefined,
              module: tp.module, type: tp.type, title: tp.title, description: tp.description,
              priority: tp.priority, automatable: tp.automatable, reviewStatus: tp.reviewStatus,
              createdAt: tp.createdAt, updatedAt: tp.updatedAt,
            },
          });
        });
      }
    }, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "测试点生成失败";
    addNotification("任务失败", "测试点生成", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:测试点生成` });
    return { success: false, error: msg };
  }
}

export async function startGenerateTestCases(projectId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:用例生成` });

    const verify = await verifyAIConfig(projectId, "用例生成");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:用例生成` });
      addNotification("任务失败", "用例生成", projectId, `用例生成失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("用例生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "用例生成", () => aiApi.generateTestCases(projectId), async () => {
      const tcs = await testCasesApi.list(projectId);
      if (_dispatch) {
        _dispatch({ type: "CLEAR_TEST_CASES", payload: projectId });
        tcs.forEach((tc: ApiTestCase) => {
          _dispatch!({
            type: "ADD_TEST_CASE",
            payload: {
              id: tc.id, projectId: tc.projectId,
              testPointId: tc.testPointId ?? undefined, requirementId: tc.requirementId ?? undefined,
              caseCode: tc.caseCode, module: tc.module, feature: tc.feature, title: tc.title,
              priority: tc.priority, precondition: tc.precondition, steps: tc.steps,
              testData: tc.testData, expectedResult: tc.expectedResult,
              environmentId: tc.environmentId, targetPlatform: tc.targetPlatform,
              testUrl: tc.testUrl, requiredRole: tc.requiredRole,
              testType: tc.testType ?? "功能测试", actualResult: tc.actualResult ?? "", passed: tc.passed ?? "未执行",
              automation: tc.automation, reviewStatus: tc.reviewStatus, remark: tc.remark,
              tester: tc.tester ?? "", testDate: tc.testDate ?? "",
              createdAt: tc.createdAt, updatedAt: tc.updatedAt,
            },
          });
        });
      }
    }, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "用例生成失败";
    addNotification("任务失败", "用例生成", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:用例生成` });
    return { success: false, error: msg };
  }
}

export async function startGenerateScripts(projectId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:脚本生成` });

    const verify = await verifyAIConfig(projectId, "脚本生成");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:脚本生成` });
      addNotification("任务失败", "脚本生成", projectId, `脚本生成失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("脚本生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "脚本生成", () => aiApi.generateScripts(projectId), async () => {
      const scripts = await scriptsApi.list(projectId);
      if (_dispatch) {
        _dispatch({ type: "CLEAR_SCRIPTS", payload: projectId });
        scripts.forEach((s: any) => {
          _dispatch!({
            type: "ADD_SCRIPT",
            payload: {
              id: s.id, projectId: s.projectId, testCaseId: s.testCaseId,
              caseCode: s.caseCode, module: s.module, title: s.title,
              code: s.code, reviewStatus: s.reviewStatus,
              createdAt: s.createdAt, updatedAt: s.updatedAt,
            },
          });
        });
      }
    }, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "脚本生成失败";
    addNotification("任务失败", "脚本生成", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:脚本生成` });
    return { success: false, error: msg };
  }
}

export async function startGenerateDocs(projectId: string, templateId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:文档生成` });

    const verify = await verifyAIConfig(projectId, "文档生成");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:文档生成` });
      addNotification("任务失败", "文档生成", projectId, `文档生成失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("文档生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "文档生成", () => aiApi.generateDocs(projectId, templateId), undefined, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "文档生成失败";
    addNotification("任务失败", "文档生成", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:文档生成` });
    return { success: false, error: msg };
  }
}

export async function startExecuteScripts(projectId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:执行脚本` });

    const verify = await verifyAIConfig(projectId, "执行脚本");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:执行脚本` });
      addNotification("任务失败", "执行脚本", projectId, `执行脚本失败：${verify.error}`, `/projects/${projectId}`);
      return { success: false, error: verify.error };
    }

    toast.info("脚本执行分析已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "执行脚本", () => aiApi.executeScripts(projectId), undefined, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "执行脚本失败";
    addNotification("任务失败", "执行脚本", projectId, msg, `/projects/${projectId}`);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:执行脚本` });
    return { success: false, error: msg };
  }
}

/** 查询某个项目是否有正在运行的任务 */
export function hasActiveTask(projectId: string, taskType?: string): boolean {
  for (const key of activeTasks.keys()) {
    if (taskType ? key === `${projectId}:${taskType}` : key.startsWith(`${projectId}:`)) {
      return true;
    }
  }
  return false;
}
