import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "../../app/store";
import {
  startParseRequirements,
  startGenerateTestPoints,
  startGenerateTestCases,
} from "./aiTaskManager";

interface UseAIActionReturn {
  loading: boolean;
  error: string | null;
  parseRequirements: () => Promise<void>;
  generateTestPoints: () => Promise<void>;
  generateTestCases: () => Promise<void>;
}

export function useAIAction(projectId: string): UseAIActionReturn {
  const navigate = useNavigate();
  const { state } = useStore();

  // 从全局 store 读取 loading 状态，切换 tab 不会丢失
  const loading = useMemo(() => {
    return state.activeAITasks.some((t) =>
      t === "需求解析" || t === "测试点生成" || t === "用例生成",
    );
  }, [state.activeAITasks]);

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

  return { loading, error: null, parseRequirements, generateTestPoints, generateTestCases };
}
