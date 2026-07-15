/**
 * Backward-compatible re-exports from modular API files.
 * New code should import from specific modules (e.g., "./project.api").
 */
export { request, getAuthHeaders, API_BASE } from "./request";

// Re-export all APIs with original names for backward compatibility
export { projectsApi } from "./project.api";
export { filesApi, requirementsApi } from "./document.api";
export { testPointsApi, testCasesApi } from "./test-design.api";
export { scriptsApi } from "./automation.api";
export {
  authApi,
  modelConfigApi,
  docConfigApi,
  statusLogsApi,
  aiApi,
  docGenApi,
} from "./system.api";
export { notificationsApi } from "./notification.api";
export { environmentApi } from "./environment.api";

// Re-export types with original names (Api prefix) for backward compatibility
export type { Project as ApiProject } from "../contracts/project";
export type { FileAsset as ApiFile } from "../contracts/document";
export type { Requirement as ApiRequirement } from "../contracts/document";
export type { TestPoint as ApiTestPoint } from "../contracts/test-design";
export type { TestCase as ApiTestCase } from "../contracts/test-design";
export type { Script as ApiScript } from "../contracts/automation";
export type { ModelConfig as ApiModelConfig } from "../contracts/system";
export type { DocConfig as ApiDocConfig } from "../contracts/system";
export type { StatusLog as ApiStatusLog } from "../contracts/system";
export type { AITask as ApiAITask } from "../contracts/system";
export type { DocGenStatus as ApiDocGenStatus } from "../contracts/system";
export type { EnvironmentConfig as ApiEnvironmentConfig, TestAccount as ApiTestAccount } from "./environment.api";
