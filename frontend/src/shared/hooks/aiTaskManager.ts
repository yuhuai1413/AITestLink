/**
 * 全局 AI 任务管理器
 * 独立于 React 组件运行，切换 tab 或退出页面时轮询不中断。
 * 任务完成/失败时自动往 store 里写通知。
 */
import { aiApi, requirementsApi, testPointsApi, testCasesApi, scriptsApi } from "../../api/client";
import type { ApiRequirement, ApiTestPoint, ApiTestCase, ApiScript } from "../../api/client";
import { toast } from "sonner";
import { addTaskNotification, initNotificationContext } from "../ai-tasks/aiTaskNotifications";
import type { AITaskType } from "../types/platform";

// ── 持有 store dispatch 的引用（由 initManager 注入） ──
let _dispatch: React.Dispatch<any> | null = null;
let _navigateToModelConfig: (() => void) | null = null;

export function initManager(
  dispatch: React.Dispatch<any>,
  getProjects: () => { id: string; name: string }[],
  navigateToModelConfig?: () => void,
) {
  _dispatch = dispatch;
  _navigateToModelConfig = navigateToModelConfig ?? null;
  initNotificationContext(dispatch, getProjects);
}

export const addNotification = addTaskNotification;

// ── 活跃轮询任务 ──
const activeTasks = new Map<string, AbortController>();
const DEFAULT_POLL_SECONDS = 900;
const LONG_RUNNING_POLL_SECONDS: Partial<Record<AITaskType, number>> = {
  "脚本生成": 1800,
  "文档生成": 1800,
};

// ── 轮询 AI 任务状态 ──
async function pollAITask(
  projectId: string,
  taskId: string,
  taskType: AITaskType,
  signal: AbortSignal,
  onProgress?: () => Promise<void>,
): Promise<{ success: boolean; error?: string }> {
  const maxPollSeconds = LONG_RUNNING_POLL_SECONDS[taskType] ?? DEFAULT_POLL_SECONDS;
  let lastStatus = "";
  let lastResult = "";
  for (let i = 0; i < maxPollSeconds; i++) {
    if (signal.aborted) return { success: false };
    await new Promise((r) => setTimeout(r, 1000));
    if (signal.aborted) return { success: false };
    try {
      const tasks = await aiApi.listTasks(projectId);
      const task = tasks.find((t) => t.id === taskId);
      if (task) lastStatus = task.status;
      if (task?.result && task.result !== lastResult) {
        lastResult = task.result;
        await onProgress?.();
      }
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
  if (lastStatus === "执行中") {
    return { success: false, error: `${taskType}仍在后台执行，生成内容较多时会耗时较长，请稍后刷新任务列表查看结果` };
  }
  return { success: false, error: `${taskType}等待超时，未获取到任务结果` };
}

function getTaskTargetPath(projectId: string): string {
  return `/projects/${projectId}`;
}

// ── 公共 API ──

function makeTaskKey(projectId: string, type: string) {
  return `${projectId}:${type}`;
}

function emitProjectDataRefresh(projectId: string) {
  window.dispatchEvent(new CustomEvent("aitestlink:data-refresh", { detail: { projectId } }));
}

async function refreshRequirements(projectId: string) {
  const reqs = await requirementsApi.list(projectId);
  if (!_dispatch) return;
  _dispatch({ type: "CLEAR_REQUIREMENTS", payload: projectId });
  reqs.forEach((r: ApiRequirement) => {
    _dispatch!({
      type: "ADD_REQUIREMENT",
      payload: {
        id: r.id, projectId: r.projectId, module: r.module, feature: r.feature,
        reqId: r.reqId,
        source: r.source, risk: r.risk, rule: r.rule, question: r.question, confirmed: r.confirmed,
        clarificationStatus: r.clarificationStatus,
        clarificationAnswer: r.clarificationAnswer,
        reviewStatus: r.reviewStatus ?? "待评审",
        validityStatus: (r as any).validityStatus ?? "有效",
        invalidReason: (r as any).invalidReason ?? "",
        invalidatedAt: (r as any).invalidatedAt ?? null,
        createdAt: r.createdAt, updatedAt: r.updatedAt,
      },
    });
  });
}

async function refreshTestPoints(projectId: string) {
  const tps = await testPointsApi.list(projectId);
  if (!_dispatch) return;
  _dispatch({ type: "CLEAR_TEST_POINTS", payload: projectId });
  tps.forEach((tp: ApiTestPoint) => {
    _dispatch!({
      type: "ADD_TEST_POINT",
      payload: {
        id: tp.id, projectId: tp.projectId, requirementId: tp.requirementId ?? null,
        pointCode: tp.pointCode,
        module: tp.module, type: tp.type, title: tp.title, description: tp.description,
        priority: tp.priority, automatable: tp.automatable, reviewStatus: tp.reviewStatus,
        validityStatus: (tp as any).validityStatus ?? "有效",
        invalidReason: (tp as any).invalidReason ?? "",
        invalidatedAt: (tp as any).invalidatedAt ?? null,
        createdAt: tp.createdAt, updatedAt: tp.updatedAt,
      },
    });
  });
}

async function refreshTestCases(projectId: string) {
  const tcs = await testCasesApi.list(projectId);
  if (!_dispatch) return;
  _dispatch({ type: "CLEAR_TEST_CASES", payload: projectId });
  tcs.forEach((tc: ApiTestCase) => {
    _dispatch!({
      type: "ADD_TEST_CASE",
      payload: {
        id: tc.id, projectId: tc.projectId,
        testPointId: tc.testPointId ?? null, requirementId: tc.requirementId ?? null,
        caseCode: tc.caseCode, module: tc.module, feature: tc.feature, title: tc.title,
        priority: tc.priority, precondition: tc.precondition, steps: tc.steps,
        testData: tc.testData, expectedResult: tc.expectedResult,
        environmentId: tc.environmentId, targetPlatform: tc.targetPlatform,
        testUrl: tc.testUrl, requiredRole: tc.requiredRole,
        testType: tc.testType ?? "功能测试", actualResult: tc.actualResult ?? "", passed: tc.passed ?? "未执行",
        automation: tc.automation, reviewStatus: tc.reviewStatus, remark: tc.remark,
        validityStatus: (tc as any).validityStatus ?? "有效",
        invalidReason: (tc as any).invalidReason ?? "",
        invalidatedAt: (tc as any).invalidatedAt ?? null,
        tester: tc.tester ?? "", testDate: tc.testDate ?? "",
        createdAt: tc.createdAt, updatedAt: tc.updatedAt,
      },
    });
  });
}

async function refreshScripts(projectId: string) {
  const scripts = await scriptsApi.list(projectId);
  if (!_dispatch) return;
  _dispatch({ type: "CLEAR_SCRIPTS", payload: projectId });
  scripts.forEach((s: ApiScript) => {
    _dispatch!({
      type: "ADD_SCRIPT",
      payload: {
        id: s.id, projectId: s.projectId, testCaseId: s.testCaseId,
        scriptType: s.scriptType as any,
        framework: s.framework as any,
        language: s.language,
        code: s.code,
        status: s.status as any,
        scriptCode: s.scriptCode,
        reviewStatus: s.reviewStatus,
        validityStatus: (s as any).validityStatus ?? "有效",
        invalidReason: (s as any).invalidReason ?? "",
        invalidatedAt: (s as any).invalidatedAt ?? null,
        generatedByAi: s.generatedByAi,
        executedAt: s.executedAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      },
    });
  });
}

function isModelConfigError(message: string) {
  return [
    "模型配置",
    "模型未配置",
    "配置不存在",
    "已禁用",
    "连接状态异常",
    "API Key",
    "API 地址",
    "Endpoint",
  ].some((keyword) => message.includes(keyword));
}

function notifyTaskFailure(taskType: AITaskType, projectId: string, message: string, targetPath = `/projects/${projectId}`) {
  addNotification("任务失败", taskType, projectId, message, targetPath);
  if (isModelConfigError(message) && _navigateToModelConfig) {
    toast.error(message, {
      action: {
        label: "去配置",
        onClick: () => _navigateToModelConfig?.(),
      },
    });
    return;
  }
  toast.error(message);
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
    if (result.connectionStatus === "abnormal") {
      return { ok: false, error: result.lastTestMessage || result.message || "模型连接状态异常" };
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
  opts?: { skipStartDispatch?: boolean; onProgress?: () => Promise<void>; onStarted?: () => void },
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
    opts?.onStarted?.();

    const pollResult = await pollAITask(projectId, task.id, taskType, controller.signal, opts?.onProgress);

    if (pollResult.success) {
      if (onSuccess) await onSuccess();
      emitProjectDataRefresh(projectId);
      addNotification("任务完成", taskType, projectId, `${taskType}已完成`, getTaskTargetPath(projectId));
      return { success: true };
    } else {
      const errorMsg = pollResult.error || `${taskType}失败`;
      if (!controller.signal.aborted) {
        notifyTaskFailure(taskType, projectId, errorMsg, getTaskTargetPath(projectId));
      }
      return { success: false, error: errorMsg };
    }
  } catch (err) {
    if (!controller.signal.aborted) {
      const msg = err instanceof Error ? err.message : "未知错误";
      notifyTaskFailure(taskType, projectId, `${taskType}失败: ${msg}`);
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
      notifyTaskFailure("需求解析", projectId, `需求解析失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("需求解析已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "需求解析", () => aiApi.parseRequirements(projectId), () => refreshRequirements(projectId), {
      skipStartDispatch: true,
      onProgress: () => refreshRequirements(projectId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "需求解析失败";
    notifyTaskFailure("需求解析", projectId, msg);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:需求解析` });
    return { success: false, error: msg };
  }
}

export async function startReverseRequirements(
  projectId: string,
  options: { scope: string; testTarget: string; writeMode: string; maxPages: number; maxRequirements: number; keywords?: string },
) {
  try {
    if (_dispatch) {
      _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:AI反推需求` });
    }

    const verify = await verifyAIConfig(projectId, "AI反推需求");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:AI反推需求` });
      notifyTaskFailure("AI反推需求", projectId, `AI反推需求失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("AI反推需求已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "AI反推需求", () => aiApi.reverseRequirements(projectId, options), () => refreshRequirements(projectId), {
      skipStartDispatch: true,
      onProgress: () => refreshRequirements(projectId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "AI反推需求失败";
    notifyTaskFailure("AI反推需求", projectId, msg);
    if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:AI反推需求` });
    return { success: false, error: msg };
  }
}

export async function startGenerateTestPoints(projectId: string) {
  try {
    if (_dispatch) _dispatch({ type: "START_ACTIVE_AI_TASK", payload: `${projectId}:测试点生成` });

    const verify = await verifyAIConfig(projectId, "测试点生成");
    if (!verify.ok) {
      if (_dispatch) _dispatch({ type: "STOP_ACTIVE_AI_TASK", payload: `${projectId}:测试点生成` });
      notifyTaskFailure("测试点生成", projectId, `测试点生成失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("测试点生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "测试点生成", () => aiApi.generateTestPoints(projectId), () => refreshTestPoints(projectId), {
      skipStartDispatch: true,
      onProgress: () => refreshTestPoints(projectId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "测试点生成失败";
    notifyTaskFailure("测试点生成", projectId, msg);
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
      notifyTaskFailure("用例生成", projectId, `用例生成失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("用例生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "用例生成", () => aiApi.generateTestCases(projectId), () => refreshTestCases(projectId), {
      skipStartDispatch: true,
      onProgress: () => refreshTestCases(projectId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "用例生成失败";
    notifyTaskFailure("用例生成", projectId, msg);
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
      notifyTaskFailure("脚本生成", projectId, `脚本生成失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("脚本生成已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "脚本生成", () => aiApi.generateScripts(projectId), () => refreshScripts(projectId), {
      skipStartDispatch: true,
      onProgress: () => refreshScripts(projectId),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "脚本生成失败";
    notifyTaskFailure("脚本生成", projectId, msg);
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
      notifyTaskFailure("文档生成", projectId, `文档生成失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    return await runTask(projectId, "文档生成", () => aiApi.generateDocs(projectId, templateId), undefined, {
      skipStartDispatch: true,
      onStarted: () => toast.info("文档生成已启动，完成后会在通知列表中提醒"),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "文档生成失败";
    notifyTaskFailure("文档生成", projectId, msg);
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
      notifyTaskFailure("执行脚本", projectId, `执行脚本失败：${verify.error}`);
      return { success: false, error: verify.error };
    }

    toast.info("脚本执行分析已启动，完成后会在通知列表中提醒");
    return await runTask(projectId, "执行脚本", () => aiApi.executeScripts(projectId), undefined, { skipStartDispatch: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "执行脚本失败";
    notifyTaskFailure("执行脚本", projectId, msg);
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
