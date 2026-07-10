import { showAlert } from "../../../shared/utils/dialogEvents";
import { API_BASE } from "../../../shared/config/deploy";
import { TOKEN_KEY } from "../../../shared/config/storage";
const BASE_URL = API_BASE;

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function setToken(token: string | null) {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getToken(): string | null {
  return authToken;
}

function classifyNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  // AbortError: 请求被取消/超时
  if (err instanceof DOMException && err.name === "AbortError") return "请求超时，请检查网络后重试";
  // DNS / 连接类
  if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("ERR_NETWORK"))
    return "网络连接失败，请检查网络是否正常";
  if (msg.includes("ERR_NAME_NOT_RESOLVED")) return "无法访问服务器，请检查网络连接";
  if (msg.includes("ERR_CONNECTION_REFUSED") || msg.includes("ERR_CONNECTION_RESET"))
    return "服务器连接被拒绝，请稍后重试";
  if (msg.includes("ERR_TIMED_OUT") || msg.includes("timeout")) return "请求超时，请检查网络后重试";
  // CORS
  if (msg.includes("CORS") || msg.includes("cross-origin"))
    return "跨域请求被阻止，请刷新页面重试";
  // 其他未知
  return "网络异常，请检查网络后重试";
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch (err) {
    throw new Error(classifyNetworkError(err));
  }

  if (res.status === 401) {
    // 公开接口不需要认证，正常抛错不跳转
    if (path.startsWith("/categories")) {
      throw new Error("未登录");
    }
    if (authToken) {
      const errBody = await res.clone().json().catch(() => ({}));
      const msg = (errBody as any).detail || "登录已过期";
      if (!window.__alertShown) {
        window.__alertShown = true;
        setToken(null);
        sessionStorage.removeItem("aitestlink-store");
        showAlert("账号异常", msg);
      }
      throw new Error(msg);
    }
  }

  // Safe JSON parse — handle empty or non-JSON response bodies
  let data: Record<string, unknown> = {};
  const text = await res.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("服务器返回了异常数据，请稍后重试");
    }
  }

  if (!res.ok) {
    const serverMsg = (data as { error?: string }).error;
    if (res.status >= 500) {
      throw new Error(serverMsg || "服务器内部错误，请稍后重试");
    }
    throw new Error(serverMsg || `请求失败 (${res.status})`);
  }

  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
