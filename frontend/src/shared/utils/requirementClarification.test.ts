import { describe, expect, it } from "vitest";
import {
  CLARIFICATION_CONFIRMED,
  clarificationAnswerQualityIssues,
  getClarificationStatus,
  isClarificationAnswerSufficient,
} from "./requirementClarification";

describe("requirement clarification", () => {
  it("accepts a clear answer even when it does not repeat question keywords", () => {
    const question = "请确认业务对象的范围和判断口径";
    const answer = "本次只测已登录销售主管能看到自己负责的记录，其他人员不纳入本轮。";

    expect(clarificationAnswerQualityIssues(question, answer)).toEqual([]);
    expect(isClarificationAnswerSufficient(question, answer)).toBe(true);
    expect(getClarificationStatus({ question, clarificationAnswer: answer })).toBe(CLARIFICATION_CONFIRMED);
  });

  it("still rejects vague placeholder answers", () => {
    const question = "请确认部门需求是否只覆盖销售部";

    expect(clarificationAnswerQualityIssues(question, "后续确认")[0]).toContain("不明确表述");
  });
});
