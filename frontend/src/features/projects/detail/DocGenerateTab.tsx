import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, WandSparkles } from "lucide-react";
import { renderAsync } from "docx-preview";
import { toast } from "sonner";
import { docGenApi } from "../../../api/client";
import { useProjectData } from "../useProjectData";
import { startGenerateDocs } from "../../../shared/hooks/aiTaskManager";
import { DataTable } from "../../../shared/components/DataTable";
import { SectionHeader } from "../../../shared/components/SectionHeader";
import { StatusPill } from "../../../shared/components/StatusPill";
import { ConfirmDialog } from "../../../shared/components/ConfirmDialog";
import { Modal } from "../../../shared/components/Modal";
import { TOKEN_KEY } from "../../../shared/config/storage";
import { API_BASE } from "../../../shared/config/deploy";
import { formatProjectTime as formatTime } from "./projectDetail.config";

// ═══════════════════════════════════════
// 文档生成（模板 + 生成 + 下载）
// ═══════════════════════════════════════

export function DocGenerateTab({ projectId }: { projectId: string }) {
  const { files, testCases, refresh, loading, initialLoading } = useProjectData(projectId);
  const templates = [
    { id: "tpl-plan", name: "软件测试计划", desc: "测试范围、策略、资源、进度安排", needs: ["files"] },
    { id: "tpl-spec", name: "软件测试说明", desc: "测试环境、用例设计、执行方法", needs: ["files", "testCases"] },
    { id: "tpl-report", name: "软件测试报告", desc: "执行结果、缺陷统计、风险分析", needs: ["testCases"] },
    { id: "tpl-pc", name: "PC端操作手册", desc: "系统操作流程、功能说明", needs: ["files"] },
    { id: "tpl-app", name: "APP端操作手册", desc: "移动端操作流程、功能说明", needs: ["files"] },
  ];
  const [generating, setGenerating] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, { status: string; generatedAt: string | null }>>({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reGenerateId, setReGenerateId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // 从数据库加载状态
  useEffect(() => {
    docGenApi.getStatus(projectId).then((data) => {
      if (data) setStatusMap(data);
    }).catch(() => {}).finally(() => setStatusLoaded(true));
  }, [projectId]);

  const getTemplateStatus = (tpl: typeof templates[0]): string => {
    // 数据库状态未加载完，显示加载中
    if (!statusLoaded || initialLoading) return "加载中";
    const stored = statusMap[tpl.id];
    if (stored) return stored.status;
    // 数据库没有记录时，根据数据计算初始状态
    if (tpl.needs.includes("files") && files.length === 0) return "数据不足";
    if (tpl.needs.includes("testCases") && testCases.length === 0) return "数据不足";
    return "待生成";
  };

  const isReady = (needs: string[]) => {
    if (initialLoading) return false;
    if (needs.includes("files") && files.length === 0) return false;
    if (needs.includes("testCases") && testCases.length === 0) return false;
    return true;
  };

  const handleGenerateClick = (id: string) => {
    if (statusMap[id]?.status === "已生成") {
      setReGenerateId(id);
      return;
    }
    handleGenerate(id);
  };

  const handleGenerate = async (id: string) => {
    setGenerating(id);
    const tpl = templates.find((t) => t.id === id);

    // 立即设置状态为「生成中」
    await docGenApi.updateStatus(projectId, id, "生成中");
    setStatusMap((prev) => ({ ...prev, [id]: { status: "生成中", generatedAt: null } }));

    try {
      const result = await startGenerateDocs(projectId, id);

      if (result.success) {
        await docGenApi.updateStatus(projectId, id, "已生成");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "已生成", generatedAt: new Date().toISOString() } }));
      } else {
        await docGenApi.updateStatus(projectId, id, "待生成");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
      }
    } catch (err) {
      await docGenApi.updateStatus(projectId, id, "待生成").catch(() => {});
      setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
      const msg = err instanceof Error ? err.message : "文档生成失败";
      toast.error(msg);
    } finally {
      setGenerating(null);
    }
  };

  const handlePreview = useCallback(async (id: string) => {
    if (statusMap[id]?.status !== "已生成") { toast.warning("该文档尚未生成，请先点击「生成」"); return; }
    const tpl = templates.find((t) => t.id === id);
    setPreviewId(id);
    setPreviewLoading(true);
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/ai/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (response.ok) {
        const tasks = await response.json();
        const docTask = tasks.find((t: any) => t.type === "文档生成" && t.status === "成功" && t.result);
        if (docTask && docTask.result) {
          const docData = JSON.parse(docTask.result);
          // 优先使用 docxBase64 渲染真正的 Word 预览
          if (docData.docxBase64 && previewRef.current) {
            const binaryStr = atob(docData.docxBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
            const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
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
            setPreviewLoading(false);
            return;
          }
          // 降级：使用 content 渲染
          if (docData.content && previewRef.current) {
            const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>body{font-family:"宋体",serif;padding:20px;line-height:1.8;}h1{font-size:20px;border-bottom:2px solid #333;padding-bottom:8px;}h2{font-size:16px;margin-top:20px;}table{border-collapse:collapse;width:100%;margin:10px 0;}th,td{border:1px solid #ccc;padding:6px 10px;text-align:left;}th{background:#f5f5f5;}</style></head><body>${docData.content.replace(/\n/g, "<br>")}</body></html>`;
            const htmlBlob = new Blob([html], { type: "text/html;charset=utf-8" });
            previewRef.current.innerHTML = "";
            const iframe = document.createElement("iframe");
            iframe.style.width = "100%";
            iframe.style.height = "100%";
            iframe.style.border = "none";
            iframe.src = URL.createObjectURL(htmlBlob);
            previewRef.current.appendChild(iframe);
            setPreviewLoading(false);
            return;
          }
        }
      }
      if (previewRef.current) {
        previewRef.current.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;"><p style="font-size:16px;margin-bottom:8px;">「${tpl?.name || ""}」文档预览</p><p style="font-size:13px;">文档已生成，可点击下方「下载」按钮获取 Word 文件</p></div>`;
      }
    } catch {
      if (previewRef.current) {
        previewRef.current.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94a3b8;"><p style="font-size:16px;margin-bottom:8px;">「${tpl?.name || ""}」文档预览</p><p style="font-size:13px;">文档已生成，可点击下方「下载」按钮获取 Word 文件</p></div>`;
      }
    } finally {
      setPreviewLoading(false);
    }
  }, [statusMap, projectId]);

  const handleDownload = async (id: string) => {
    if (statusMap[id]?.status !== "已生成") { toast.warning("该文档尚未生成，请先点击「生成」"); return; }
    const tpl = templates.find((t) => t.id === id);
    try {
      const response = await fetch(`${API_BASE}/projects/${projectId}/ai/tasks`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) || ""}` },
      });
      if (!response.ok) throw new Error("获取任务失败");
      const tasks = await response.json();
      const docTask = tasks.find((t: any) => t.type === "文档生成" && t.status === "成功" && t.result);
      if (docTask && docTask.result) {
        const docData = JSON.parse(docTask.result);
        if (docData.docxBase64) {
          const binaryStr = atob(docData.docxBase64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = docData.docxFileName || `${tpl?.name || id}.docx`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success(`正在下载「${docData.docxFileName || tpl?.name || id}」`);
          return;
        }
      }
      toast.error("未找到可下载的文档文件");
    } catch {
      toast.error("下载失败");
    }
  };

  const handleBatchDownload = async () => {
    const doneIds = [...selectedIds].filter((id) => statusMap[id]?.status === "已生成");
    if (doneIds.length === 0) { toast.warning("所选模板暂无可下载的文档，请先生成"); return; }
    for (const id of doneIds) {
      await handleDownload(id);
    }
  };

  const [showBatchReGenConfirm, setShowBatchReGenConfirm] = useState(false);

  const handleBatchGenerate = async () => {
    // 检查是否有已生成的模板需要重新生成
    const alreadyDone = [...selectedIds].filter((id) => statusMap[id]?.status === "已生成");
    if (alreadyDone.length > 0) {
      setShowBatchReGenConfirm(true);
      return;
    }
    await doBatchGenerate();
  };

  const doBatchGenerate = async () => {
    const readyIds = [...selectedIds].filter((id) => {
      const tpl = templates.find((t) => t.id === id);
      return tpl && isReady(tpl.needs);
    });
    if (readyIds.length === 0) { toast.warning("所选模板无可用数据"); return; }

    try {
      for (const id of readyIds) {
        await docGenApi.updateStatus(projectId, id, "生成中");
        setStatusMap((prev) => ({ ...prev, [id]: { status: "生成中", generatedAt: null } }));

        const result = await startGenerateDocs(projectId, id);

        if (result.success) {
          await docGenApi.updateStatus(projectId, id, "已生成");
          setStatusMap((prev) => ({ ...prev, [id]: { status: "已生成", generatedAt: new Date().toISOString() } }));
        } else {
          await docGenApi.updateStatus(projectId, id, "待生成");
          setStatusMap((prev) => ({ ...prev, [id]: { status: "待生成", generatedAt: null } }));
        }
      }
      toast.success(`批量生成完成，共 ${readyIds.length} 个文档`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "文档生成失败");
    }
    setSelectedIds(new Set());
  };

  const allSelected = selectedIds.size === templates.length;
  const toggleSelectAll = () => setSelectedIds(allSelected ? new Set() : new Set(templates.map((t) => t.id)));
  const toggleSelect = (id: string) => setSelectedIds((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="page-stack page-stack--spaced page-stack--fill">
      <SectionHeader title="文档生成" description="选择文档模板，系统将根据项目数据自动生成 Word 文档。" actions={<>
        <div style={{ display: "flex", gap: 8 }}>
          {selectedIds.size > 0 && <button className="primary-button" type="button" onClick={handleBatchGenerate} disabled={!!generating}><WandSparkles size={13} /> 批量生成（{selectedIds.size}）</button>}
          {selectedIds.size > 0 && <button className="primary-button" type="button" onClick={handleBatchDownload}><Download size={13} /> 批量下载（{selectedIds.size}）</button>}
        </div>
      </>} />
      <section className="work-panel">
        <DataTable rows={templates} getRowKey={(r) => r.id} columns={[
          { key: "select", label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />, width: "40px", sticky: "left" as const, render: (r) => <input type="checkbox" checked={selectedIds.has(r.id)} onChange={() => toggleSelect(r.id)} /> },
          { key: "name", label: "模板名称", render: (r) => r.name },
          { key: "desc", label: "说明", render: (r) => r.desc },
          { key: "needs", label: "前置数据", render: (r) => r.needs.map((n) => n === "files" ? "文档" : "用例").join("、") },
          { key: "status", label: "状态", align: "center", render: (r) => {
            const st = getTemplateStatus(r);
            if (st === "已生成") return <StatusPill tone="green">已生成</StatusPill>;
            if (st === "生成中") return <StatusPill tone="blue">生成中</StatusPill>;
            if (st === "数据不足") return <StatusPill tone="amber">数据不足</StatusPill>;
            if (st === "加载中") return <StatusPill tone="slate">加载中</StatusPill>;
            return <StatusPill tone="slate">待生成</StatusPill>;
          }},
          { key: "time", label: "生成时间", width: "160px", align: "center", render: (r) => <span style={{ display: "inline-block", width: 160 }}>{statusMap[r.id]?.generatedAt ? formatTime(statusMap[r.id].generatedAt!) : "-"}</span> },
          { key: "actions", label: "操作", width: "160px", sticky: "right" as const, align: "center", render: (r) => {
            const ready = isReady(r.needs);
            const done = statusMap[r.id]?.status === "已生成";
            return (
              <div className="inline-actions">
                <button className="text-button" type="button" onClick={() => handleGenerateClick(r.id)} disabled={!!generating || !ready}>
                  生成
                </button>
                <button className="text-button" type="button" onClick={() => handlePreview(r.id)}>查看</button>
                <button className="text-button" type="button" onClick={() => handleDownload(r.id)}>下载</button>
              </div>
            );
          }},
        ]} />
      </section>

      {/* 文档预览弹窗 */}
      <Modal
        open={!!previewId}
        onClose={() => { setPreviewId(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
        title={previewId ? `预览 - ${templates.find((t) => t.id === previewId)?.name || ""}` : "文档预览"}
        width={1100}
        height="90vh"
        flushTop
        footer={<>
          <button className="ghost-button" type="button" onClick={() => { setPreviewId(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}>关闭</button>
          <button className="primary-button" type="button" onClick={() => { if (previewId) handleDownload(previewId); }}><Download size={13} /> 下载</button>
        </>}
      >
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
          {previewLoading && (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px" }}>
              <Loader2 size={24} className="animate-spin" style={{ marginRight: 8 }} />
              <span>加载文档中...</span>
            </div>
          )}
          <div ref={previewRef} style={{ flex: 1, overflow: "auto", background: "#fff", borderRadius: 8, padding: "0 16px 0 16px" }} />
        </div>
      </Modal>

      {/* 重新生成确认弹窗 */}
      <ConfirmDialog
        open={!!reGenerateId}
        title="重新生成文档"
        message={`「${reGenerateId ? templates.find((t) => t.id === reGenerateId)?.name : ""}」已生成过，再次生成将覆盖之前的数据，是否继续？`}
        confirmLabel="继续生成"
        confirmLoading={!!generating}
        onConfirm={() => { const id = reGenerateId!; setReGenerateId(null); handleGenerate(id); }}
        onCancel={() => setReGenerateId(null)}
      />

      {/* 批量重新生成确认弹窗 */}
      <ConfirmDialog
        open={showBatchReGenConfirm}
        title="批量重新生成"
        message={`所选模板中包含已生成的文档，再次生成将覆盖之前的数据，是否继续？`}
        confirmLabel="继续生成"
        confirmLoading={!!generating}
        onConfirm={() => { setShowBatchReGenConfirm(false); doBatchGenerate(); }}
        onCancel={() => setShowBatchReGenConfirm(false)}
      />
    </div>
  );
}
