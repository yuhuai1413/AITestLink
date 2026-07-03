import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "./StatusPill";

describe("StatusPill", () => {
  it("renders children text", () => {
    render(<StatusPill>进行中</StatusPill>);
    expect(screen.getByText("进行中")).toBeInTheDocument();
  });

  it("applies default slate tone", () => {
    render(<StatusPill>Test</StatusPill>);
    const pill = screen.getByText("Test");
    expect(pill.className).toContain("status-pill--slate");
  });

  it("applies blue tone", () => {
    render(<StatusPill tone="blue">Blue</StatusPill>);
    expect(screen.getByText("Blue").className).toContain("status-pill--blue");
  });

  it("applies green tone", () => {
    render(<StatusPill tone="green">Green</StatusPill>);
    expect(screen.getByText("Green").className).toContain("status-pill--green");
  });

  it("applies amber tone", () => {
    render(<StatusPill tone="amber">Amber</StatusPill>);
    expect(screen.getByText("Amber").className).toContain("status-pill--amber");
  });

  it("applies red tone", () => {
    render(<StatusPill tone="red">Red</StatusPill>);
    expect(screen.getByText("Red").className).toContain("status-pill--red");
  });

  it("applies custom className", () => {
    render(<StatusPill className="custom">Test</StatusPill>);
    expect(screen.getByText("Test").className).toContain("custom");
  });
});
