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
import { getClarificationStatus } from "../../../shared/utils/requirementClarification";
import { formatProjectTime as formatTime } from "./projectDetail.config";

type PrerequisiteKey = "files" | "requirements" | "testPoints" | "testCases" | "scripts" | "traceability";

type PrerequisiteItem = {
  label: string;
  ready: boolean;
  optional?: boolean;
  summary: string;
  detail: string;
  blockers: string[];
};

// ═══════════════════════════════════════
// 文档生成（模板 + 生成 + 下载）
// ═══════════════════════════════════════

export function DocGenerateTab({ projectId }: { projectId: string }) {
  const { files, requirements, testPoints, testCases, scripts, refresh, loading, initialLoading } = useProjectData(projectId);
  const templates = [
    { id: "tpl-plan", name: "软件测试计划", desc: "测试范围、策略、资源、进度安排", needs: ["files", "requirements", "testPoints", "traceability"] },
    { id: "tpl-spec", name: "软件测试说明", desc: "测试环境、用例设计、执行方法", needs: ["files", "requirements", "testPoints", "testCases", "traceability"] },
    { id: "tpl-report", name: "软件测试报告", desc: "执行结果、缺陷统计、风险分析", needs: ["requirements", "testPoints", "testCases", "scripts", "traceability"] },
    { id: "tpl-pc", name: "PC端操作手册", desc: "系统操作流程、功能说明", needs: ["files", "requirements"] },
    { id: "tpl-app", name: "APP端操作手册", desc: "移动端操作流程、功能说明", needs: ["files", "requirements"] },
  ];
  const [generating, setGenerating] = useState<string | null>(null);
  const [statusMap, setStatusMap] = useState<Record<string, { status: string; generatedAt: string | null }>>({});
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [reGenerateId, setReGenerateId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [prereqDetailId, setPrereqDetailId] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);

  // 从数据库加载状态
  useEffect(() => {
    docGenApi.getStatus(projectId).then((data) => {
      if (data) setStatusMap(data);
    }).catch(() => {}).finally(() => setStatusLoaded(true));
  }, [projectId]);

  const getTemplateStatus = (tpl: typeof templates[0]): string => {
    if (!statusLoaded || initialLoading) return "加载中";
    const stored = statusMap[tpl.id];
    if (stored?.status === "生成中" || stored?.status === "已生成") return stored.status;
    if (!isReady(tpl.needs)) return "数据不足";
    return stored?.status || "待生成";
  };

  const countInvalid = (items: Array<{ validityStatus?: string }>) => items.filter((item) => item.validityStatus === "已失效").length;
  const countUnreviewed = (items: Array<{ reviewStatus?: string }>) => items.filter((item) => item.reviewStatus !== "已通过").length;
  const countValid = (items: Array<{ validityStatus?: string }>) => items.length - countInvalid(items);
  const countReviewed = (items: Array<{ reviewStatus?: string }>) => items.length - countUnreviewed(items);
  const parsedFileCount = files.filter((item) => item.parseStatus === "已完成").length;
  const parseFailedFileCount = files.filter((item) => item.parseStatus === "失败").length;
  const clarificationPendingCount = requirements.filter((item) => getClarificationStatus(item) === "待确认").length;
  const pointsWithRequirementCount = testPoints.filter((item) => Boolean(item.requirementId)).length;
  const casesWithPointCount = testCases.filter((item) => Boolean(item.testPointId)).length;
  const casesWithRequirementCount = testCases.filter((item) => Boolean(item.requirementId)).length;
  const automatableCaseCount = testCases.filter((item) => item.automation === "是").length;
  const scriptLinkedCaseIds = new Set(scripts.map((item) => item.testCaseId).filter(Boolean));
  const scriptCoveredCaseCount = testCases.filter((item) => scriptLinkedCaseIds.has(item.id)).length;
  const scriptReviewedCount = scripts.filter((item) => item.reviewStatus === "已通过").length;
  const scriptInvalidCount = countInvalid(scripts);
  const scriptPassCount = scripts.filter((item) => item.status === "通过" || item.status === "成功").length;
  const scriptExecutedCount = scripts.filter((item) => Boolean(item.executedAt) || item.status === "通过" || item.status === "失败" || item.status === "成功").length;
  const traceabilityReady = requirements.length > 0 && testPoints.length > 0 && testCases.length > 0 && pointsWithRequirementCount === testPoints.length && casesWithPointCount === testCases.length && casesWithRequirementCount === testCases.length;

  const prerequisiteState: Record<PrerequisiteKey, PrerequisiteItem> = {
    files: {
      label: "输入资料",
      ready: files.length > 0,
      summary: files.length > 0 ? `${files.length} 个文件` : "未上传",
      detail: files.length > 0 ? `已解析 ${parsedFileCount} 个，解析失败 ${parseFailedFileCount} 个` : "缺少需求、说明或模板依据",
      blockers: [
        ...(files.length === 0 ? ["未上传输入资料"] : []),
        ...(parseFailedFileCount > 0 ? [`${parseFailedFileCount} 个文件解析失败`] : []),
      ],
    },
    requirements: {
      label: "需求列表",
      ready: requirements.length > 0 && countInvalid(requirements) === 0 && countUnreviewed(requirements) === 0 && clarificationPendingCount === 0,
      summary: requirements.length > 0 ? `${requirements.length} 条需求` : "未生成",
      detail: requirements.length > 0 ? `有效 ${countValid(requirements)} 条，已通过 ${countReviewed(requirements)} 条，待确认 ${clarificationPendingCount} 条` : "需先完成需求解析或 AI 反推",
      blockers: [
        ...(requirements.length === 0 ? ["没有需求数据"] : []),
        ...(countInvalid(requirements) > 0 ? [`${countInvalid(requirements)} 条需求已失效`] : []),
        ...(countUnreviewed(requirements) > 0 ? [`${countUnreviewed(requirements)} 条需求未评审通过`] : []),
        ...(clarificationPendingCount > 0 ? [`${clarificationPendingCount} 条需求存在待确认问题`] : []),
      ],
    },
    testPoints: {
      label: "测试点",
      ready: testPoints.length > 0 && countInvalid(testPoints) === 0 && countUnreviewed(testPoints) === 0,
      summary: testPoints.length > 0 ? `${testPoints.length} 个测试点` : "未生成",
      detail: testPoints.length > 0 ? `有效 ${countValid(testPoints)} 个，已通过 ${countReviewed(testPoints)} 个，关联需求 ${pointsWithRequirementCount} 个` : "需先根据需求生成测试点",
      blockers: [
        ...(testPoints.length === 0 ? ["没有测试点数据"] : []),
        ...(countInvalid(testPoints) > 0 ? [`${countInvalid(testPoints)} 个测试点已失效`] : []),
        ...(countUnreviewed(testPoints) > 0 ? [`${countUnreviewed(testPoints)} 个测试点未评审通过`] : []),
        ...(testPoints.length > 0 && pointsWithRequirementCount < testPoints.length ? [`${testPoints.length - pointsWithRequirementCount} 个测试点缺少需求追溯`] : []),
      ],
    },
    testCases: {
      label: "测试用例",
      ready: testCases.length > 0 && countInvalid(testCases) === 0 && countUnreviewed(testCases) === 0,
      summary: testCases.length > 0 ? `${testCases.length} 条用例` : "未生成",
      detail: testCases.length > 0 ? `有效 ${countValid(testCases)} 条，已通过 ${countReviewed(testCases)} 条，可自动化 ${automatableCaseCount} 条` : "需先根据测试点生成用例",
      blockers: [
        ...(testCases.length === 0 ? ["没有测试用例数据"] : []),
        ...(countInvalid(testCases) > 0 ? [`${countInvalid(testCases)} 条用例已失效`] : []),
        ...(countUnreviewed(testCases) > 0 ? [`${countUnreviewed(testCases)} 条用例未评审通过`] : []),
        ...(testCases.length > 0 && casesWithPointCount < testCases.length ? [`${testCases.length - casesWithPointCount} 条用例缺少测试点追溯`] : []),
        ...(testCases.length > 0 && casesWithRequirementCount < testCases.length ? [`${testCases.length - casesWithRequirementCount} 条用例缺少需求追溯`] : []),
      ],
    },
    scripts: {
      label: "脚本/执行",
      ready: scripts.length > 0 && scriptInvalidCount === 0 && scriptExecutedCount > 0,
      optional: true,
      summary: scripts.length > 0 ? `${scripts.length} 个脚本` : "未生成",
      detail: scripts.length > 0 ? `覆盖用例 ${scriptCoveredCaseCount} 条，已评审 ${scriptReviewedCount} 个，已执行 ${scriptExecutedCount} 个，通过 ${scriptPassCount} 个` : "报告可先生成，但执行结论会不完整",
      blockers: [
        ...(scripts.length === 0 ? ["没有脚本和执行结果，报告结论会缺少执行证据"] : []),
        ...(scriptInvalidCount > 0 ? [`${scriptInvalidCount} 个脚本已失效`] : []),
        ...(scripts.length > 0 && scriptExecutedCount === 0 ? ["脚本尚未执行"] : []),
      ],
    },
    traceability: {
      label: "数据追溯",
      ready: traceabilityReady,
      summary: traceabilityReady ? "链路完整" : "链路待补",
      detail: `需求 ${requirements.length} 条，测试点关联 ${pointsWithRequirementCount}/${testPoints.length}，用例关联测试点 ${casesWithPointCount}/${testCases.length}、关联需求 ${casesWithRequirementCount}/${testCases.length}`,
      blockers: [
        ...(testPoints.length > 0 && pointsWithRequirementCount < testPoints.length ? [`${testPoints.length - pointsWithRequirementCount} 个测试点无法追溯需求`] : []),
        ...(testCases.length > 0 && casesWithPointCount < testCases.length ? [`${testCases.length - casesWithPointCount} 条用例无法追溯测试点`] : []),
        ...(testCases.length > 0 && casesWithRequirementCount < testCases.length ? [`${testCases.length - casesWithRequirementCount} 条用例无法追溯需求`] : []),
      ],
    },
  };

  const isReady = (needs: string[]) => {
    if (initialLoading) return false;
    return needs.every((need) => {
      const item = prerequisiteState[need as PrerequisiteKey];
      return item ? item.ready || item.optional : true;
    });
  };

  const getTemplatePrerequisites = (tpl: typeof templates[0]) => tpl.needs.map((need) => prerequisiteState[need as PrerequisiteKey]).filter(Boolean);

  const getPrimaryBlocker = (items: PrerequisiteItem[]) => {
    const requiredBlocker = items.find((item) => !item.ready && !item.optional && item.blockers.length > 0);
    if (requiredBlocker) return requiredBlocker.blockers[0];
    const optionalBlocker = items.find((item) => item.optional && item.blockers.length > 0);
    return optionalBlocker?.blockers[0] || "";
  };

  const renderPrerequisites = (tpl: typeof templates[0]) => (
    <div className="doc-prereq-summary">
      {(() => {
        const items = getTemplatePrerequisites(tpl);
        const blocker = getPrimaryBlocker(items);
        const requiredReady = items.filter((item) => !item.optional && item.ready).length;
        const requiredTotal = items.filter((item) => !item.optional).length;
        return (
          <>
            <div className="doc-prereq-summary__top">
              <StatusPill tone={requiredReady === requiredTotal ? "green" : "amber"}>{requiredReady}/{requiredTotal} 满足</StatusPill>
              <button className="text-button doc-prereq-summary__detail" type="button" onClick={() => setPrereqDetailId(tpl.id)}>详情</button>
            </div>
            <div className="doc-prereq-summary__chips">
              {items.slice(0, 4).map((item) => (
                <span key={item.label} className={item.ready ? "doc-prereq-chip doc-prereq-chip--ready" : "doc-prereq-chip"} title={`${item.label}：${item.detail}`}>
                  {item.label} {item.summary}
                </span>
              ))}
              {items.length > 4 && <span className="doc-prereq-chip doc-prereq-chip--more">+{items.length - 4}</span>}
            </div>
            {blocker && <div className="doc-prereq-summary__blocker" title={blocker}>卡点：{blocker}</div>}
          </>
        );
      })()}
    </div>
  );

  const getGenerationGateError = () => {
    if (requirements.length === 0) return "需求列表为空，请先完成需求解析";
    const invalidReq = requirements.filter((item) => (item as any).validityStatus === "已失效").length;
    if (invalidReq > 0) return `还有 ${invalidReq} 条需求已失效，请先重新解析需求`;
    const unreviewedReq = requirements.filter((item) => item.reviewStatus !== "已通过").length;
    if (unreviewedReq > 0) return `还有 ${unreviewedReq} 条需求未评审通过，请先完成需求评审`;
    if (clarificationPendingCount > 0) return `还有 ${clarificationPendingCount} 条需求存在待确认问题，请先在需求列表中补充确认结论`;

    if (testPoints.length === 0) return "测试点列表为空，请先生成测试点";
    const invalidPoint = testPoints.filter((item) => (item as any).validityStatus === "已失效").length;
    if (invalidPoint > 0) return `还有 ${invalidPoint} 个测试点已失效，请先重新生成测试点`;
    const unreviewedPoint = testPoints.filter((item) => item.reviewStatus !== "已通过").length;
    if (unreviewedPoint > 0) return `还有 ${unreviewedPoint} 个测试点未评审通过，请先完成测试点评审`;
    if (pointsWithRequirementCount < testPoints.length) return `还有 ${testPoints.length - pointsWithRequirementCount} 个测试点缺少需求追溯，请先重新生成测试点`;

    if (testCases.length === 0) return "测试用例列表为空，请先生成测试用例";
    const invalidCase = testCases.filter((item) => (item as any).validityStatus === "已失效").length;
    if (invalidCase > 0) return `还有 ${invalidCase} 条测试用例已失效，请先重新生成测试用例`;
    const unreviewedCase = testCases.filter((item) => item.reviewStatus !== "已通过").length;
    if (unreviewedCase > 0) return `还有 ${unreviewedCase} 条测试用例未评审通过，请先完成用例评审`;
    if (casesWithPointCount < testCases.length) return `还有 ${testCases.length - casesWithPointCount} 条测试用例缺少测试点追溯，请先重新生成测试用例`;
    if (casesWithRequirementCount < testCases.length) return `还有 ${testCases.length - casesWithRequirementCount} 条测试用例缺少需求追溯，请先重新生成测试用例`;

    return "";
  };

  const handleGenerateClick = (id: string) => {
    if (statusMap[id]?.status === "已生成") {
      setReGenerateId(id);
      return;
    }
    handleGenerate(id);
  };

  const handleGenerate = async (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    const gateError = getGenerationGateError();
    if (gateError) {
      toast.warning(gateError);
      return;
    }

    setGenerating(id);

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

  const pickGeneratedDoc = (tasks: any[], templateId: string) => {
    for (const task of tasks) {
      if (task.type !== "文档生成" || task.status !== "成功" || !task.result) continue;
      try {
        const parsed = JSON.parse(task.result);
        if (Array.isArray(parsed)) {
          const matched = parsed.find((item) => item?.templateId === templateId);
          if (matched) return matched;
        } else if (parsed?.templateId === templateId) {
          return parsed;
        } else if (!parsed?.templateId && tasks.length === 1) {
          return parsed;
        }
      } catch {
        continue;
      }
    }
    return null;
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
        const docData = pickGeneratedDoc(tasks, id);
        if (docData) {
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
      const docData = pickGeneratedDoc(tasks, id);
      if (docData) {
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
    const gateError = getGenerationGateError();
    if (gateError) {
      toast.warning(gateError);
      return;
    }

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
          { key: "name", label: "模板名称", lineClamp: 3, render: (r) => r.name },
          { key: "desc", label: "说明", lineClamp: 3, render: (r) => r.desc },
          { key: "needs", label: "前置数据", align: "left", width: "34%", render: renderPrerequisites },
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

      <Modal
        open={!!prereqDetailId}
        onClose={() => setPrereqDetailId(null)}
        title={prereqDetailId ? `前置数据详情 - ${templates.find((t) => t.id === prereqDetailId)?.name || ""}` : "前置数据详情"}
        width={860}
        footer={<button className="primary-button" type="button" onClick={() => setPrereqDetailId(null)}>关闭</button>}
      >
        {(() => {
          const tpl = templates.find((t) => t.id === prereqDetailId);
          if (!tpl) return null;
          const items = getTemplatePrerequisites(tpl);
          const blocker = getPrimaryBlocker(items);
          return (
            <div className="doc-prereq-detail">
              <div className="doc-prereq-detail__summary">
                <div>
                  <div className="doc-prereq-detail__title">生成门禁</div>
                  <div className="doc-prereq-detail__desc">文档生成只使用已通过、有效并且可追溯的数据。</div>
                </div>
                {blocker ? <StatusPill tone="amber">存在卡点</StatusPill> : <StatusPill tone="green">可生成</StatusPill>}
              </div>
              {blocker && <div className="doc-prereq-detail__blocker">当前主要卡点：{blocker}</div>}
              <div className="doc-prereq-detail__list">
                {items.map((item) => (
                  <div key={item.label} className="doc-prereq-detail__item">
                    <div className="doc-prereq-detail__item-head">
                      <div className="doc-prereq-detail__item-title">{item.label}</div>
                      <StatusPill tone={item.ready ? "green" : item.optional ? "blue" : "amber"}>{item.ready ? "满足" : item.optional ? "建议补充" : "待补"}</StatusPill>
                    </div>
                    <div className="doc-prereq-detail__item-main">{item.summary}</div>
                    <div className="doc-prereq-detail__item-desc">{item.detail}</div>
                    {item.blockers.length > 0 && (
                      <div className="doc-prereq-detail__pending">
                        {item.blockers.map((text) => <span key={text}>待处理：{text}</span>)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}
      </Modal>

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
