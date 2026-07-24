import { describe, expect, it } from "vitest";
import { formatClarificationForDisplay } from "./formatClarification";

describe("formatClarificationForDisplay", () => {
  it("splits semicolon separated questions into separate display lines", () => {
    expect(formatClarificationForDisplay("确认角色范围；确认数据口径；确认异常提示")).toBe(
      "1、确认角色范围\n2、确认数据口径\n3、确认异常提示",
    );
  });

  it("splits Chinese period separated questions into separate display lines", () => {
    expect(formatClarificationForDisplay("确认是否覆盖销售部。确认是否包含财务部。")).toBe(
      "1、确认是否覆盖销售部\n2、确认是否包含财务部",
    );
  });

  it("normalizes existing numbered questions without duplicating numbers", () => {
    expect(formatClarificationForDisplay("1、确认角色范围 2、确认数据口径")).toBe(
      "1、确认角色范围\n2、确认数据口径",
    );
  });

  it("keeps a single question readable without adding a bullet", () => {
    expect(formatClarificationForDisplay("确认是否覆盖销售部")).toBe("确认是否覆盖销售部");
  });
});
