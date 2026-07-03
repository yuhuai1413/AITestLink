import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SectionHeader } from "./SectionHeader";

describe("SectionHeader", () => {
  it("renders title", () => {
    render(<SectionHeader title="测试标题" />);
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("测试标题");
  });

  it("renders eyebrow when provided", () => {
    render(<SectionHeader eyebrow="概览" title="标题" />);
    expect(screen.getByText("概览")).toBeInTheDocument();
  });

  it("does not render eyebrow when omitted", () => {
    render(<SectionHeader title="标题" />);
    expect(screen.queryByText("概览")).not.toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<SectionHeader title="标题" description="描述文本" />);
    expect(screen.getByText("描述文本")).toBeInTheDocument();
  });

  it("does not render description when omitted", () => {
    render(<SectionHeader title="标题" />);
    expect(screen.queryByText("描述文本")).not.toBeInTheDocument();
  });

  it("renders actions when provided", () => {
    render(
      <SectionHeader
        title="标题"
        actions={<button>操作按钮</button>}
      />,
    );
    expect(screen.getByText("操作按钮")).toBeInTheDocument();
  });

  it("does not render actions when omitted", () => {
    const { container } = render(<SectionHeader title="标题" />);
    expect(container.querySelector(".section-header__actions")).not.toBeInTheDocument();
  });
});
