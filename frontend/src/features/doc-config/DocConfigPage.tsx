import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Loader2, Save, Download, Search, X, RotateCcw, Upload } from "lucide-react";
import { renderAsync } from "docx-preview";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { docConfigApi, type ApiDocConfig } from "../../api/client";
import { getMeWithAdmin } from "../auth/api/auth";

const DOC_CATEGORY_MAP: Record<string, string> = {
  "tpl-plan": "测试计划",
  "tpl-spec": "测试说明",
  "tpl-report": "测试报告",
  "tpl-pc": "操作手册",
  "tpl-app": "操作手册",
};

const DOC_TONE_MAP: Record<string, string> = {
  "tpl-plan": "blue",
  "tpl-spec": "green",
  "tpl-report": "purple",
  "tpl-pc": "amber",
  "tpl-app": "red",
};

export function DocConfigPage() {
  const [configs, setConfigs] = useState<ApiDocConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingConfig, setEditingConfig] = useState<ApiDocConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewConfig, setPreviewConfig] = useState<ApiDocConfig | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [searchName, setSearchName] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    loadConfigs();
    getMeWithAdmin().then((res) => {
      if (res.ok && res.user) setIsAdmin(res.user.is_admin || false);
    }).catch(() => {});
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await docConfigApi.list();
      if (data) setConfigs(data);
    } catch (error) {
      console.error("Failed to load doc configs:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredConfigs = useMemo(() => {
    return configs.filter((c) => {
      const matchName = !searchName || c.name.toLowerCase().includes(searchName.toLowerCase());
      const matchCategory = filterCategory === "all" || c.configKey === filterCategory;
      return matchName && matchCategory;
    });
  }, [configs, searchName, filterCategory]);

  // Unique categories for filter dropdown
  const categories = useMemo(() => {
    const keys = [...new Set(configs.map((c) => c.configKey))];
    return keys.map((k) => ({ key: k, label: DOC_CATEGORY_MAP[k] || k }));
  }, [configs]);

  const resetFilters = () => {
    setSearchName("");
    setFilterCategory("all");
  };

  const handleSaveEdit = async () => {
    if (!editingConfig) return;
    setSaving(true);
    try {
      const result = await docConfigApi.update([editingConfig]);
      if (result.ok) {
        setConfigs((prev) =>
          prev.map((c) => (c.id === editingConfig.id ? editingConfig : c))
        );
        toast.success("保存成功");
        setEditingConfig(null);
      }
    } catch (error) {
      console.error("Failed to save:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = useCallback((config: ApiDocConfig) => {
    setEditingConfig({ ...config });
  }, []);

  const handlePreview = useCallback(async (config: ApiDocConfig) => {
    if (!config.templateFile) {
      toast.warning("该模板暂无文件");
      return;
    }
    setPreviewConfig(config);
    setPreviewLoading(true);
    try {
      const response = await fetch(docConfigApi.downloadUrl(config.id), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
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
    } catch (error) {
      console.error("Preview error:", error);
      toast.error("预览加载失败");
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  const handleDownloadFile = useCallback(async (config: ApiDocConfig) => {
    if (!config.templateFile) return;
    try {
      const response = await fetch(docConfigApi.downloadUrl(config.id), {
        headers: { Authorization: `Bearer ${localStorage.getItem("token") || ""}` },
      });
      if (!response.ok) throw new Error("下载失败");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = config.templateFile;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
      toast.error("下载失败");
    }
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUploadFile = useCallback(async (config: ApiDocConfig, file: File) => {
    try {
      const result = await docConfigApi.upload(config.id, file);
      if (result.ok) {
        setConfigs((prev) =>
          prev.map((c) => (c.id === config.id ? { ...c, templateFile: result.templateFile } : c))
        );
        toast.success("模板上传成功");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error("上传失败");
    }
  }, []);

  const handleUploadClick = useCallback((config: ApiDocConfig) => {
    const input = fileInputRef.current;
    if (!input) return;
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleUploadFile(config, file);
      input.value = "";
    };
    input.click();
  }, [handleUploadFile]);

  if (loading) {
    return (
      <div className="page-stack">
        <div className="work-panel" style={{ textAlign: "center", padding: "40px" }}>
          <Loader2 size={24} className="animate-spin" style={{ marginBottom: 8 }} />
          <p>加载配置中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <input ref={fileInputRef} type="file" accept=".docx,.doc" style={{ display: "none" }} />
      <DataPanel
        search={
          <div className="search-form">
            <div className="search-form__field">
              <label className="search-form__label">模板名称</label>
              <input
                className="search-form__input"
                type="text"
                placeholder="搜索模板名称"
                value={searchName}
                onChange={(e) => setSearchName(e.target.value)}
              />
              {searchName && (
                <button className="search-form__clear" type="button" onClick={() => setSearchName("")}>
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="search-form__field">
              <label className="search-form__label">分类</label>
              <select
                className="search-form__select"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
              >
                <option value="all">全部分类</option>
                {categories.map((cat) => (
                  <option key={cat.key} value={cat.key}>{cat.label}</option>
                ))}
              </select>
            </div>
            <button className="ghost-button" type="button" onClick={resetFilters}>
              <RotateCcw size={14} />
              重置
            </button>
          </div>
        }
        total={filteredConfigs.length}
      >
        <DataTable
          rows={filteredConfigs}
          getRowKey={(row) => row.id}
          columns={[
            {
              key: "name",
              label: "模板名称",
              width: "15%",
              render: (row) => <span style={{ fontSize: 14 }}>{row.name}</span>,
            },
            {
              key: "configKey",
              label: "分类",
              width: "10%",
              align: "center",
              render: (row) => (
                <StatusPill tone={(DOC_TONE_MAP[row.configKey] || "slate") as any}>
                  {DOC_CATEGORY_MAP[row.configKey] || "其他"}
                </StatusPill>
              ),
            },
            {
              key: "description",
              label: "说明",
              width: "20%",
              align: "left",
              render: (row) => <span style={{ fontSize: 13 }}>{row.description || "-"}</span>,
            },
            {
              key: "updatedAt",
              label: "上传时间",
              width: "15%",
              align: "center",
              render: (row) => {
                if (!row.updatedAt) return <span>-</span>;
                const d = new Date(row.updatedAt);
                return <span style={{ fontSize: 13 }}>{`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`}</span>;
              },
            },
            {
              key: "actions",
              label: "操作",
              width: "15%",
              sticky: "right" as const,
              align: "center",
              render: (row) => (
                <div className="inline-actions">
                  <button
                    className="text-button"
                    type="button"
                    disabled={!row.templateFile}
                    onClick={() => handlePreview(row)}
                  >
                    查看
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={!row.templateFile}
                    onClick={() => handleDownloadFile(row)}
                  >
                    下载
                  </button>
                  {isAdmin && (
                    <>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => startEdit(row)}
                      >
                        编辑
                      </button>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => handleUploadClick(row)}
                      >
                        上传模板
                      </button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
        />
      </DataPanel>

      {/* 预览弹窗 */}
      <Modal
        open={!!previewConfig}
        onClose={() => { setPreviewConfig(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
        title={`预览模板 - ${previewConfig?.name}`}
        width={1100}
        height="90vh"
        footer={<>
          <button
            className="ghost-button"
            type="button"
            onClick={() => { setPreviewConfig(null); if (previewRef.current) previewRef.current.innerHTML = ""; }}
          >
            关闭
          </button>
          {previewConfig?.templateFile && (
            <button
              className="primary-button"
              type="button"
              onClick={() => handleDownloadFile(previewConfig)}
            >
              <Download size={16} /> 下载模板
            </button>
          )}
        </>}
      >
        <div style={{ position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 }}>
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
              padding: 16,
            }}
          />
        </div>
      </Modal>

      {/* 编辑弹窗 */}
      <Modal
        open={!!editingConfig}
        onClose={() => setEditingConfig(null)}
        title={`编辑模板 - ${editingConfig?.name}`}
        width={640}
      >
        {editingConfig && (
          <form
            className="form-stack"
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveEdit();
            }}
          >
            <div className="form-row">
              <label className="form-label">
                模板名称
                <input
                  className="form-input"
                  value={editingConfig.name}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, name: e.target.value })
                  }
                  required
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                说明
                <input
                  className="form-input"
                  value={editingConfig.description}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, description: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                输出字段（JSON 数组）
                <input
                  className="form-input"
                  value={editingConfig.outputFields}
                  onChange={(e) =>
                    setEditingConfig({ ...editingConfig, outputFields: e.target.value })
                  }
                />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                提示词模板
                <textarea
                  className="form-textarea"
                  rows={12}
                  value={editingConfig.promptTemplate}
                  onChange={(e) =>
                    setEditingConfig({
                      ...editingConfig,
                      promptTemplate: e.target.value,
                    })
                  }
                  style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6 }}
                />
              </label>
            </div>
            <div className="form-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => setEditingConfig(null)}
              >
                取消
              </button>
              <button className="primary-button" type="submit" disabled={saving}>
                <Save size={16} />
                {saving ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
