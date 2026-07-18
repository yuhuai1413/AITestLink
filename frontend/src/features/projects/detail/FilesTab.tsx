import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { renderAsync } from "docx-preview";
import { toast } from "sonner";
import { useProjectData } from "../useProjectData";
import { useAPISync } from "../../../api/useAPISync";
import type { ApiFile } from "../../../api/client";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { TOKEN_KEY } from "../../../shared/config/storage";
import { formatProjectTime as formatTime } from "./projectDetail.config";

// ═══════════════════════════════════════
// 输入资料（仅上传 + 管理）
// ═══════════════════════════════════════

export function FilesTab({ projectId }: { projectId: string }) {
  const { files, refreshFiles, loading, initialLoading } = useProjectData(projectId);
  const { uploadFile, deleteFile } = useAPISync();
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deletingFile, setDeletingFile] = useState<{ id: string; name: string; parseStatus?: string } | null>(null);
  const [previewFile, setPreviewFile] = useState<ApiFile | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // 监听 AI 任务完成后刷新文件列表
  useEffect(() => {
    const handler = (e: Event) => {
      const { projectId: pid } = (e as CustomEvent).detail || {};
      if (pid === projectId) refreshFiles();
    };
    window.addEventListener("aitestlink:files-refresh", handler);
    return () => window.removeEventListener("aitestlink:files-refresh", handler);
  }, [projectId, refreshFiles]);

  const allSelected = files.length > 0 && files.every((f) => selectedIds.has(f.id));
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(files.map((f) => f.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleUpload = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const existingNames = new Set(files.map((f) => f.name));
    const newFiles = Array.from(fileList).filter((f) => !existingNames.has(f.name));
    const skipped = fileList.length - newFiles.length;
    if (newFiles.length === 0) { toast.warning("所选文件已全部存在"); return; }
    setUploading(true);
    try {
      for (const file of newFiles) { await uploadFile(projectId, file); }
      toast.success(skipped > 0 ? `上传 ${newFiles.length} 个，跳过 ${skipped} 个重复` : `上传成功，共 ${newFiles.length} 个文件`); await refreshFiles();
      window.dispatchEvent(new CustomEvent('aitestlink:data-refresh', { detail: { projectId } }));
    } catch (err) { toast.error(err instanceof Error ? err.message : "上传失败"); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ""; }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false); handleUpload(e.dataTransfer.files);
  }, [projectId, files]);

  const handlePreview = useCallback(async (file: ApiFile) => {
    if (!file.storagePath) { toast.warning("该文件无存储路径"); return; }
    const filePath = file.storagePath.replace(/^\.\//, "/");
    const ext = file.storagePath.split(".").pop()?.toLowerCase() || "";
    setPreviewFile(file);
    setPreviewLoading(true);
    try {
      const response = await fetch(filePath, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
      if (ext === "docx" || ext === "doc") {
        if (previewRef.current) {
          previewRef.current.innerHTML = "";
          await renderAsync(blob, previewRef.current, undefined, {
            className: "docx-preview",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            ignoreFonts: false,
            breakPages: true,
            ignoreLastRenderedPageBreak: true,
            experimental: true,
          });
        }
      } else if (ext === "pdf") {
        const url = URL.createObjectURL(blob);
        if (previewRef.current) {
          previewRef.current.innerHTML = `<embed src="${url}" type="application/pdf" style="width:100%;height:calc(90vh - 130px);display:block;" />`;
        }
      } else if (["md", "txt", "json", "yaml", "yml", "csv"].includes(ext || "")) {
        const text = await blob.text();
        if (previewRef.current) {
          previewRef.current.innerHTML = `<pre style="margin:0;padding:16px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-all;">${text.replace(/</g, "&lt;")}</pre>`;
        }
      } else {
        toast.warning("该文件类型暂不支持预览");
        setPreviewFile(null);
        return;
      }
    } catch (error) {
      console.error("Preview error:", error);
      toast.error("预览加载失败");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleDownloadFile = useCallback(async (file: ApiFile) => {
    if (!file.storagePath) return;
    const filePath = file.storagePath.replace(/^\.\//, "/");
    try {
      const response = await fetch(filePath, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("下载失败");
    }
  }, []);



  const handleDelete = async () => {
    if (!deletingFile) return;
    const isParsed = deletingFile.parseStatus === "已完成";
    try {
      const result = await deleteFile(deletingFile.id);
      toast.success(isParsed ? "删除成功，关联的需求、测试点、用例和脚本已一并清除" : "删除成功");
      await refreshFiles();
      // 通知其他 tab 刷新数据
      window.dispatchEvent(new CustomEvent("aitestlink:data-refresh", { detail: { projectId } })); 
    } catch { toast.error("删除失败"); }
    setDeletingFile(null);
  };

  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);


  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档管理" description="上传需求文档、接口文档、原型和变更说明，支持拖拽上传。" meta={<>共 <strong>{files.length}</strong> 个文件</>}
        actions={<>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input ref={inputRef} type="file" multiple accept=".docx,.doc,.pdf,.md,.json,.yaml,.yml,.xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => handleUpload(e.target.files)} />
              <button className="ghost-button" type="button" onClick={() => inputRef.current?.click()} disabled={uploading}>手动上传</button>
            </div>
          </div>
        </>} />
      <div onDrop={handleDrop} onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)}
        style={{ border: `2px dashed ${dragOver ? "#6366f1" : "var(--line)"}`, borderRadius: "var(--radius-l2)", padding: "32px 20px", textAlign: "center", background: dragOver ? "rgba(99,102,241,0.05)" : "transparent", transition: "all 0.2s", cursor: "pointer" }}
        onClick={() => inputRef.current?.click()}>
        <Upload size={32} style={{ color: dragOver ? "#6366f1" : "var(--muted)", margin: "0 auto 8px" }} />
        <p style={{ margin: 0, color: dragOver ? "#6366f1" : "var(--muted)", fontSize: 14 }}>{uploading ? "上传中..." : "拖拽文件到此处，或点击上传"}</p>
        <p style={{ margin: "4px 0 0", color: "var(--subtle)", fontSize: 12 }}>支持 .docx .doc .pdf .md .json .yaml .xlsx .csv 等格式</p>
      </div>
      <section className="work-panel">
        {initialLoading && files.length === 0 ? <div className="empty-state"><Loader2 size={20} className="animate-spin" style={{ color: "var(--muted)" }} /><p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p></div> : files.length === 0 ? <div className="empty-state"><p>暂无文档，请上传文件。</p></div> : (
          <DataTable rows={files} getRowKey={(r) => r.id} columns={[
            { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
            { key: "name", label: "文件名称", align: "left", lineClamp: 2, render: (r) => <strong>{r.name}</strong> },
            { key: "type", label: "文件类型", render: (r) => r.fileType },
            { key: "size", label: "文件大小", render: (r) => r.size },
            { key: "parseStatus", label: "解析状态", align: "center", render: (r) => <span title={r.parseError || undefined}><StatusPill tone={r.parseStatus === "已完成" ? "green" : r.parseStatus === "解析中" ? "blue" : r.parseStatus === "失败" ? "red" : "slate"}>{r.parseStatus}</StatusPill></span> },
            { key: "date", label: "上传时间", render: (r) => formatTime(r.uploadedAt) },
            { key: "actions", label: "操作", width: "120px", sticky: "right" as const, align: "center", render: (r) => (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handlePreview(r)}>查看</button>
                <button className="text-button text-button--danger" type="button" onClick={() => {
                  if (r.parseStatus === "解析中") { toast.warning("文件正在解析中，请稍后再试"); return; }
                  setDeletingFile({ id: r.id, name: r.name, parseStatus: r.parseStatus });
                }}>删除</button>
              </div>
            ) },

          ]} />
        )}
      </section>

      {/* 预览弹窗 */}
      <Modal
        open={!!previewFile}
        onClose={() => { setPreviewFile(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
        title={`预览文档 - ${previewFile?.name}`}
        width={1100}
        height="90vh"
        flushTop
        footer={<>
          <button
            className="ghost-button"
            type="button"
            onClick={() => { setPreviewFile(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
          >
            关闭
          </button>
        </>}
      >
        {previewLoading && (
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px" }}>
            <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />
            <span>加载文档中...</span>
          </div>
        )}
        <div
          ref={previewRef}
          style={{
            flex: 1,
            overflow: "auto",
            background: "#fff",
            borderRadius: 8,
            padding: "0 16px 0 16px",
          }}
        />
      </Modal>

      <ConfirmDialog
        open={!!deletingFile}
        title="删除文件"
        message={deletingFile?.parseStatus === "已完成"
          ? `确定删除文件「${deletingFile.name}」？\n\n⚠️ 删除文件将同时清除该项目已生成的需求、测试点、测试用例和自动化脚本。`
          : `确定删除文件「${deletingFile?.name}」？`}
        confirmLabel="删除"
        onConfirm={handleDelete}
        onCancel={() => setDeletingFile(null)}
      />
    </div>
  );
}
