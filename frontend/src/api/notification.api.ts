import { request } from "./request";
import type { AppNotification } from "../contracts/system";

// ─── Notification API ───

export interface ApiNotification {
  id: string;
  userId: string;
  type: string;
  taskType: string;
  projectId: string;
  projectName: string;
  message: string;
  targetPath: string;
  read: boolean;
  createdAt: string;
}

function toAppNotification(n: ApiNotification): AppNotification {
  return {
    id: n.id,
    type: n.type as AppNotification["type"],
    taskType: n.taskType as AppNotification["taskType"],
    projectName: n.projectName,
    projectId: n.projectId,
    message: n.message,
    targetPath: n.targetPath,
    read: n.read,
    createdAt: n.createdAt,
  };
}

export const notificationsApi = {
  list: async () => {
    const raw = await request<ApiNotification[]>("/notifications");
    return raw.map(toAppNotification);
  },

  create: (data: Omit<ApiNotification, "id" | "userId" | "read" | "createdAt">) =>
    request<ApiNotification>("/notifications", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  markRead: (id: string) =>
    request<{ ok: boolean }>(`/notifications/${id}/read`, { method: "PUT" }),

  markAllRead: () =>
    request<{ ok: boolean }>("/notifications/read-all", { method: "PUT" }),

  clear: () =>
    request<{ ok: boolean }>("/notifications", { method: "DELETE" }),
};
