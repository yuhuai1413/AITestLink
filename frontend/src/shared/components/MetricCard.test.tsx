import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricCard } from "./MetricCard";
import type { Metric } from "../types/platform";

describe("MetricCard", () => {
  const mockMetric: Metric = {
    label: "需求总数",
    value: "42",
    trend: "+12%",
    tone: "blue",
  };

  it("renders label", () => {
    render(<MetricCard metric={mockMetric} />);
    expect(screen.getByText("需求总数")).toBeInTheDocument();
  });

  it("renders value", () => {
    render(<MetricCard metric={mockMetric} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders trend", () => {
    render(<MetricCard metric={mockMetric} />);
    expect(screen.getByText("+12%")).toBeInTheDocument();
  });

  it("applies tone class", () => {
    render(<MetricCard metric={mockMetric} />);
    const card = screen.getByText("需求总数").closest("article");
    expect(card?.className).toContain("metric-card--blue");
  });

  it("renders with green tone", () => {
    render(<MetricCard metric={{ ...mockMetric, tone: "green" }} />);
    const card = screen.getByText("需求总数").closest("article");
    expect(card?.className).toContain("metric-card--green");
  });

  it("renders with red tone", () => {
    render(<MetricCard metric={{ ...mockMetric, tone: "red" }} />);
    const card = screen.getByText("需求总数").closest("article");
    expect(card?.className).toContain("metric-card--red");
  });
});
