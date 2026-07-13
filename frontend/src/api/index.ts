// API Modules - Centralized exports
export { request, getAuthHeaders, API_BASE } from "./request";

// Domain APIs
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

// Re-export types for convenience
export type { Project, ProjectCreate, ProjectUpdate } from "../contracts/project";
export type { FileAsset, Requirement, RequirementUpdate } from "../contracts/document";
export type {
  TestPoint,
  TestPointCreate,
  TestPointUpdate,
  TestCase,
  TestCaseCreate,
  TestCaseUpdate,
  TestCoverage,
} from "../contracts/test-design";
export type { Script, ExecutionResult } from "../contracts/automation";
export type {
  User,
  ModelConfig,
  DocConfig,
  StatusLog,
  AITask,
  DocGenStatus,
  ConfigCheckResult,
} from "../contracts/system";
