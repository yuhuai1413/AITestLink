import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../../app/store";
import { aiApi, requirementsApi, testPointsApi, testCasesApi } from "../../api/client";
import type { AITaskType } from "../types/platform";
import type { ApiRequirement, ApiTestPoint, ApiTestCase } from "../../api/client";
import { toast } from "sonner";

interface UseAIActionReturn {
  loading: boolean;
  error: string | null;
  parseRequirements: () => Promise<void>;
  generateTestPoints: () => Promise<void>;
  generateTestCases: () => Promise<void>;
}

/** 真实的 AI 操作 hook，调用后端 API */
export function useAIAction(projectId: string): UseAIActionReturn {
  const { dispatch } = useStore();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 检查模型配置
  const checkConfig = useCallback(async (taskType: string): Promise<boolean> => {
    try {
      const result = await aiApi.checkConfig(projectId, taskType);
      if (!result.configured) {
        toast.error(result.message, {
          action: {
            label: "去配置",
            onClick: () => navigate("/model-config"),
          },
          duration: 5000,
        });
        return false;
      }
      return true;
    } catch (err) {
      console.error("Check config error:", err);
      return true; // 检查失败时不阻止执行
    }
  }, [projectId, navigate]);

  // 轮询任务状态
  const pollTask = useCallback(async (taskId: string, type: AITaskType): Promise<boolean> => {
    for (let i = 0; i < 120; i++) {
      await new Promise((r) => setTimeout(r, 1000));
      try {
        const tasks = await aiApi.listTasks(projectId);
        const task = tasks.find((t) => t.id === taskId);
        if (task && (task.status === "成功" || task.status === "失败")) {
          dispatch({
            type: "UPDATE_AI_TASK",
            payload: {
              id: task.id,
              projectId: task.projectId,
              type: task.type as any,
              status: task.status as any,
              modelName: task.modelName,
              createdAt: task.createdAt,
              finishedAt: task.finishedAt ?? undefined,
              errorMessage: task.errorMessage ?? undefined,
            },
          });
          return task.status === "成功";
        }
      } catch (err) {
        console.error("Poll task error:", err);
      }
    }
    return false;
  }, [projectId, dispatch]);

  // 解析需求
  const parseRequirements = useCallback(async () => {
    // 检查配置
    const configured = await checkConfig("需求解析");
    if (!configured) return;

    setLoading(true);
    setError(null);

    try {
      const task = await aiApi.parseRequirements(projectId);

      dispatch({
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

      const success = await pollTask(task.id, "需求解析");

      if (success) {
        const requirements = await requirementsApi.list(projectId);
        requirements.forEach((req: ApiRequirement) => {
          dispatch({
            type: "ADD_REQUIREMENT",
            payload: {
              id: req.id,
              projectId: req.projectId,
              module: req.module,
              feature: req.feature,
              source: req.source,
              risk: req.risk as any,
              rule: req.rule,
              question: req.question,
              confirmed: req.confirmed,
            },
          });
        });
      } else {
        setError("需求解析失败，请检查模型配置和文件内容");
      }
    } catch (err) {
      console.error("Parse requirements error:", err);
      setError(`解析失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, dispatch, pollTask, checkConfig]);

  // 生成测试点
  const generateTestPoints = useCallback(async () => {
    // 检查配置
    const configured = await checkConfig("测试点生成");
    if (!configured) return;

    setLoading(true);
    setError(null);

    try {
      const task = await aiApi.generateTestPoints(projectId);

      dispatch({
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

      const success = await pollTask(task.id, "测试点生成");

      if (success) {
        const testPoints = await testPointsApi.list(projectId);
        testPoints.forEach((tp: ApiTestPoint) => {
          dispatch({
            type: "ADD_TEST_POINT",
            payload: {
              id: tp.id,
              projectId: tp.projectId,
              requirementId: tp.requirementId ?? undefined,
              module: tp.module,
              type: tp.type as any,
              title: tp.title,
              description: tp.description,
              priority: tp.priority as any,
              automatable: tp.automatable,
              reviewStatus: tp.reviewStatus as any,
            },
          });
        });
      } else {
        setError("测试点生成失败，请检查需求解析结果和模型配置");
      }
    } catch (err) {
      console.error("Generate test points error:", err);
      setError(`生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, dispatch, pollTask, checkConfig]);

  // 生成测试用例
  const generateTestCases = useCallback(async () => {
    // 检查配置
    const configured = await checkConfig("用例生成");
    if (!configured) return;

    setLoading(true);
    setError(null);

    try {
      const task = await aiApi.generateTestCases(projectId);

      dispatch({
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

      const success = await pollTask(task.id, "用例生成");

      if (success) {
        const testCases = await testCasesApi.list(projectId);
        testCases.forEach((tc: ApiTestCase) => {
          dispatch({
            type: "ADD_TEST_CASE",
            payload: {
              id: tc.id,
              projectId: tc.projectId,
              testPointId: tc.testPointId ?? undefined,
              requirementId: tc.requirementId ?? undefined,
              caseCode: tc.caseCode,
              module: tc.module,
              feature: tc.feature,
              title: tc.title,
              priority: tc.priority as any,
              precondition: tc.precondition,
              steps: tc.steps,
              testData: tc.testData,
              expectedResult: tc.expectedResult,
              automation: tc.automation as any,
              reviewStatus: tc.reviewStatus as any,
              remark: tc.remark,
              createdAt: tc.createdAt,
              updatedAt: tc.updatedAt,
            },
          });
        });
      } else {
        setError("用例生成失败，请检查测试点和模型配置");
      }
    } catch (err) {
      console.error("Generate test cases error:", err);
      setError(`生成失败: ${err instanceof Error ? err.message : "未知错误"}`);
    } finally {
      setLoading(false);
    }
  }, [projectId, dispatch, pollTask, checkConfig]);

  return {
    loading,
    error,
    parseRequirements,
    generateTestPoints,
    generateTestCases,
  };
}
