import { notificationsApi } from "../../api/client";
import type { AppNotification, AITaskType } from "../types/platform";

let dispatchRef: React.Dispatch<any> | null = null;
let getProjectsRef: (() => { id: string; name: string }[]) | null = null;

export function initNotificationContext(
  dispatch: React.Dispatch<any>,
  getProjects: () => { id: string; name: string }[],
) {
  dispatchRef = dispatch;
  getProjectsRef = getProjects;
}

function getProjectName(projectId: string): string {
  return getProjectsRef?.().find((project) => project.id === projectId)?.name ?? "未知项目";
}

export function addTaskNotification(
  type: "任务完成" | "任务失败",
  taskType: AITaskType,
  projectId: string,
  message: string,
  targetPath: string,
) {
  if (!dispatchRef) return;
  const projectName = getProjectName(projectId);
  const notification: AppNotification = {
    id: crypto.randomUUID(),
    type,
    taskType,
    projectName,
    projectId,
    message: `项目「${projectName}」${message}`,
    targetPath,
    read: false,
    createdAt: new Date().toISOString(),
  };

  dispatchRef({ type: "ADD_NOTIFICATION", payload: notification });
  notificationsApi.create({
    type,
    taskType,
    projectId,
    projectName,
    message: notification.message,
    targetPath,
  }).catch((error) => {
    console.error("同步 AI 任务通知失败", error);
  });
}
