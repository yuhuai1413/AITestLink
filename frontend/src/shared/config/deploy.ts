// 部署配置（独立域名 aitestlink.cn）
// import.meta.env.BASE_URL 由 Vite 根据 base 配置自动生成
const rawBase = import.meta.env.BASE_URL || "/";
export const BASE_PATH = rawBase.replace(/\/$/, "");
export const LOGIN_URL = BASE_PATH + "/login";
// API 地址：BASE_PATH + "/api"，独立域名下为 "/api"
export const API_BASE = BASE_PATH ? BASE_PATH + "/api" : "/api";
