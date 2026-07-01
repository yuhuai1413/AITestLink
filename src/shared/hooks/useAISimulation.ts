import { useCallback, useState } from "react";
import { useStore } from "../../app/store";
import type { AITaskType } from "../types/platform";
import { generateId } from "../utils/generateId";

/** 模拟 AI 任务的 hook，返回 simulateAI 函数和 loading 状态 */
export function useAISimulation(projectId: string) {
  const { dispatch } = useStore();
  const [loading, setLoading] = useState(false);

  const simulateAI = useCallback(
    async (type: AITaskType) => {
      const taskId = generateId("AI");
      setLoading(true);

      dispatch({
        type: "ADD_AI_TASK",
        payload: {
          id: taskId,
          projectId,
          type,
          status: "执行中",
          modelName: "claude-sonnet-4-6",
          createdAt: new Date().toISOString(),
        },
      });

      // 模拟 1.5 ~ 3 秒延迟
      await new Promise((resolve) =>
        setTimeout(resolve, 1500 + Math.random() * 1500),
      );

      dispatch({
        type: "UPDATE_AI_TASK",
        payload: {
          id: taskId,
          projectId,
          type,
          status: "成功",
          modelName: "claude-sonnet-4-6",
          createdAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
        },
      });

      setLoading(false);
    },
    [dispatch, projectId],
  );

  return { simulateAI, loading };
}
