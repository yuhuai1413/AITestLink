import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { DataTable } from "./DataTable";
import type { Column } from "./DataTable";

interface TestRow {
  id: string;
  name: string;
  value: number;
}

const columns: Column<TestRow>[] = [
  { key: "id", label: "ID", render: (row) => row.id },
  { key: "name", label: "名称", render: (row) => row.name },
  { key: "value", label: "数值", render: (row) => String(row.value), align: "right" },
];

const rows: TestRow[] = [
  { id: "1", name: "项目A", value: 100 },
  { id: "2", name: "项目B", value: 200 },
];

describe("DataTable", () => {
  it("renders column headers", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("ID")).toBeInTheDocument();
    expect(screen.getByText("名称")).toBeInTheDocument();
    expect(screen.getByText("数值")).toBeInTheDocument();
  });

  it("renders row data", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    expect(screen.getByText("项目A")).toBeInTheDocument();
    expect(screen.getByText("项目B")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
    expect(screen.getByText("200")).toBeInTheDocument();
  });

  it("renders correct number of rows", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    const tbody = document.querySelector("tbody");
    expect(tbody?.querySelectorAll("tr")).toHaveLength(2);
  });

  it("renders empty table for empty rows", () => {
    render(<DataTable columns={columns} rows={[]} getRowKey={(r) => r.id} />);
    const tbody = document.querySelector("tbody");
    expect(tbody?.querySelectorAll("tr")).toHaveLength(0);
  });

  it("uses getRowKey for row keys", () => {
    render(<DataTable columns={columns} rows={rows} getRowKey={(r) => r.id} />);
    const tr1 = screen.getByText("项目A").closest("tr");
    const tr2 = screen.getByText("项目B").closest("tr");
    expect(tr1?.getAttribute("key")).toBe("1");
    expect(tr2?.getAttribute("key")).toBe("2");
  });

  it("applies column width when specified", () => {
    const cols: Column<TestRow>[] = [
      { key: "name", label: "Name", render: (r) => r.name, width: "200px" },
    ];
    render(<DataTable columns={cols} rows={rows} getRowKey={(r) => r.id} />);
    const th = screen.getByText("Name");
    expect(th).toHaveStyle({ width: "200px" });
  });
});
