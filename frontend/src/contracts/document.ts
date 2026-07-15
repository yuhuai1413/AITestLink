// Document Types

export type RiskLevel = "高" | "中" | "低";

export interface FileAsset {
  id: string;
  projectId: string;
  name: string;
  fileType: string;
  size: string;
  storagePath: string;
  parseStatus: string;
  parseError: string;
  uploadedAt: string;
}

export interface Requirement {
  id: string;
  reqId: string;
  projectId: string;
  module: string;
  feature: string;
  source: string;
  risk: RiskLevel;
  rule: string;
  question: string;
  confirmed: boolean;
  reviewStatus: string;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementUpdate {
  rule?: string;
  question?: string;
  confirmed?: boolean;
  reviewStatus?: string;
}

export interface DocumentParseResult {
  requirements: ParsedRequirement[];
  totalCount: number;
  moduleCount: number;
}

export interface ParsedRequirement {
  module: string;
  feature: string;
  source: string;
  risk: string;
  rule: string;
  question: string;
}
