import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "../../app/store";
import {
  startParseRequirements,
  startGenerateTestPoints,
  startGenerateTestCases,
  startReviewTestCases,
} from "./aiTaskManager";

interface UseAIActionReturn {
  loadingParsing: boolean;
  loadingTestPoints: boolean;
  loadingTestCases: boolean;
  loadingReview: boolean;
  error: string | null;
  parseRequirements: () => Promise<void>;
  generateTestPoints: () => Promise<void>;
  generateTestCases: () => Promise<void>;
  reviewTestCases: () => Promise<{ success: boolean; error?: string }>;
}

export function useAIAction(projectId: string): UseAIActionReturn {
  const navigate = useNavigate();
  const { state } = useStore();

  // 从全局 store 读取各任务类型的 loading 状态
  const loadingParsing = state.activeAITasks.includes("需求解析");
  const loadingTestPoints = state.activeAITasks.includes("测试点生成");
  const loadingTestCases = state.activeAITasks.includes("用例生成");
  const loadingReview = state.activeAITasks.includes("用例评审");

  const parseRequirements = useCallback(async () => {
    try {
      const result = await startParseRequirements(projectId);
      if (result.success) {
        toast.success("需求解析完成！");
      } else if (result.error) {
        if (result.error === "模型未配置") {
          toast.error("模型未配置，请先在模型配置中设置", {
            action: { label: "去配置", onClick: () => navigate("/model-config") },
            duration: 5000,
          });
        } else {
          toast.error(result.error);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "解析失败");
    }
  }, [projectId, navigate]);

  const generateTestPoints = useCallback(async () => {
    try {
      const result = await startGenerateTestPoints(projectId);
      if (result.success) {
        toast.success("测试点生成完成！");
      } else if (result.error) {
        if (result.error === "模型未配置") {
          toast.error("模型未配置，请先在模型配置中设置", {
            action: { label: "去配置", onClick: () => navigate("/model-config") },
            duration: 5000,
          });
        } else {
          toast.error(result.error);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  }, [projectId, navigate]);

  const generateTestCases = useCallback(async () => {
    try {
      const result = await startGenerateTestCases(projectId);
      if (result.success) {
        toast.success("用例生成完成！");
      } else if (result.error) {
        if (result.error === "模型未配置") {
          toast.error("模型未配置，请先在模型配置中设置", {
            action: { label: "去配置", onClick: () => navigate("/model-config") },
            duration: 5000,
          });
        } else {
          toast.error(result.error);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "生成失败");
    }
  }, [projectId, navigate]);

  const reviewTestCases = useCallback(async () => {
    try {
      const result = await startReviewTestCases(projectId);
      if (result.success) {
        toast.success("AI 用例评审完成！");
      } else if (result.error) {
        if (result.error === "模型未配置") {
          toast.error("模型未配置，请先在模型配置中设置", {
            action: { label: "去配置", onClick: () => navigate("/model-config") },
            duration: 5000,
          });
        } else {
          toast.error(result.error);
        }
      }
      return result;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "评审失败");
      return { success: false, error: err instanceof Error ? err.message : "评审失败" };
    }
  }, [projectId, navigate]);

  return { loadingParsing, loadingTestPoints, loadingTestCases, loadingReview, error: null, parseRequirements, generateTestPoints, generateTestCases, reviewTestCases };
}
