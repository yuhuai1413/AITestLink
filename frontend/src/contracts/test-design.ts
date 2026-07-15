// Test Design Types

export type TestPointType = "正常流程" | "异常流程" | "边界值" | "权限控制" | "数据一致性" | "状态流转";
export type Priority = "P0" | "P1" | "P2" | "P3";
export type ReviewStatus = "待评审" | "评审中" | "已通过" | "需修改" | "已驳回";
export type AutomationFlag = "是" | "否";

export interface TestPoint {
  id: string;
  projectId: string;
  requirementId: string | null;
  module: string;
  type: TestPointType;
  title: string;
  description: string;
  priority: Priority;
  automatable: boolean;
  reviewStatus: ReviewStatus;
  createdAt: string;
  updatedAt: string;
}

export interface TestPointCreate {
  module: string;
  type: TestPointType;
  title: string;
  description?: string;
  priority?: Priority;
  automatable?: boolean;
}

export type TestPointUpdate = Partial<TestPointCreate> & {
  reviewStatus?: string;
};

export interface TestCase {
  id: string;
  projectId: string;
  testPointId: string | null;
  requirementId: string | null;
  caseCode: string;
  module: string;
  feature: string;
  title: string;
  priority: Priority;
  precondition: string;
  steps: string;
  testData: string;
  expectedResult: string;
  environmentId: string | null;
  targetPlatform: "PC" | "APP";
  testUrl: string;
  requiredRole: string;
  testType: string;
  actualResult: string;
  passed: string;
  automation: AutomationFlag;
  reviewStatus: ReviewStatus;
  remark: string;
  tester: string;
  testDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface TestCaseCreate {
  caseCode: string;
  module: string;
  feature?: string;
  title: string;
  priority?: Priority;
  precondition?: string;
  steps?: string;
  testData?: string;
  expectedResult?: string;
  environmentId?: string;
  targetPlatform?: "PC" | "APP";
  testUrl?: string;
  requiredRole?: string;
  testType?: string;
  automation?: AutomationFlag;
  reviewStatus?: ReviewStatus;
  remark?: string;
  testPointId?: string;
  requirementId?: string;
}

export type TestCaseUpdate = Partial<Omit<TestCaseCreate, "caseCode">>;

export interface TestCoverage {
  totalRequirements: number;
  coveredRequirements: number;
  totalTestPoints: number;
  totalTestCases: number;
  byType: Record<string, number>;
  byPriority: Record<string, number>;
  automationRate: number;
}

export type ScenarioType = TestPointType;
export type TestPriority = Priority;
export type TestStatus = "未执行" | "通过" | "失败" | "阻塞" | "跳过";
