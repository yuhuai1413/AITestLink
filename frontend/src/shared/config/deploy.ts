// 子路径部署配置
// import.meta.env.BASE_URL 由 Vite 根据 base 配置自动生成
const rawBase = import.meta.env.BASE_URL || "/";
export const BASE_PATH = rawBase.replace(/\/$/, "");
export const LOGIN_URL = BASE_PATH + "/login";
// API 地址：生产环境为 BASE_PATH + "/api"，本地开发为 "/api"
export const API_BASE = BASE_PATH ? BASE_PATH + "/api" : "/api";
