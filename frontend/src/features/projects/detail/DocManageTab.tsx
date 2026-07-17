import { useProjectData } from "../useProjectData";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { formatProjectTime as formatTime } from "./projectDetail.config";

// ═══════════════════════════════════════
// 文档管理（只读）
// ═══════════════════════════════════════

export function DocManageTab({ projectId }: { projectId: string }) {
  const { files, refresh, loading } = useProjectData(projectId);
  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="项目文档" description="项目已上传的文档列表。" actions={<span style={{ color: "var(--muted)", fontSize: 12 }}>共 <strong style={{ color: "var(--text)" }}>{files.length}</strong> 个文件</span>} />
      <section className="work-panel">
        {files.length === 0 ? <div className="empty-state"><p>暂无文档</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "name", label: "文件名", align: "left", lineClamp: 2, render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "类型", render: (r) => r.fileType },
            { key: "size", label: "大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : "slate"}>{r.parseStatus}</StatusPill> },
            { key: "date", label: "上传时间", render: (r) => { const d = new Date(r.uploadedAt); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`; } },
          ]} />
        )}
      </section>
    </div>
  );
}
