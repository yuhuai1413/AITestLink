import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { AdminPromptModal } from "./ModelConfigModals";


describe("AdminPromptModal", () => {
  it("明确提示普通用户不可修改，并提供测试、发布和回滚操作", () => {
    const onTest = vi.fn();
    const onSave = vi.fn();
    const onRollback = vi.fn();

    render(
      <AdminPromptModal
        open
        onClose={() => {}}
        configName="需求解析"
        prompt="管理员系统提示词"
        loading={false}
        onSave={onSave}
        onPromptChange={() => {}}
        currentVersion={2}
        versions={[
          { id: "v2", version: 2, prompt: "当前版本", status: "published" },
          { id: "v1", version: 1, prompt: "历史版本", status: "archived" },
        ]}
        testing={false}
        onTest={onTest}
        onRollback={onRollback}
      />,
    );

    expect(screen.getByText(/普通用户无法查看或修改/)).toBeInTheDocument();
    expect(screen.getByText("当前发布")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "测试提示词" }));
    fireEvent.click(screen.getByRole("button", { name: "发布新版本" }));
    fireEvent.click(screen.getByRole("button", { name: "回滚到此版本" }));

    expect(onTest).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledOnce();
    expect(onRollback).toHaveBeenCalledWith("v1");
  });
});
