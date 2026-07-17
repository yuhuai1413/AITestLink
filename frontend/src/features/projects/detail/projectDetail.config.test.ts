import { describe, expect, it } from "vitest";
import {
  getProjectTabFromTask,
  isProjectDetailTabKey,
  projectDetailTabs,
} from "./projectDetail.config";
import type { AITaskType } from "../../../shared/types/platform";

describe("project detail notification tab mapping", () => {
  it("maps every AI task type to the tab users should see after clicking a notification", () => {
    const cases: Array<[AITaskType, string]> = [
      ["需求解析", "requirements"],
      ["测试点生成", "testPoints"],
      ["用例生成", "testCases"],
      ["脚本生成", "scripts"],
      ["执行脚本", "executeScripts"],
      ["文档生成", "docGenerate"],
    ];

    cases.forEach(([taskType, tab]) => {
      expect(getProjectTabFromTask(taskType)).toBe(tab);
    });
  });

  it("only accepts configured project detail tabs", () => {
    projectDetailTabs.forEach((tab) => {
      expect(isProjectDetailTabKey(tab.key)).toBe(true);
    });
    expect(isProjectDetailTabKey("missing-tab")).toBe(false);
    expect(isProjectDetailTabKey(null)).toBe(false);
  });
});
