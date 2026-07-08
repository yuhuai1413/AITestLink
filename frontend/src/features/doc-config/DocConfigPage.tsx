import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Eye, Pencil, Loader2, Save } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { docConfigApi, type ApiDocConfig } from "../../api/client";

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

  useEffect(() => {
    loadConfigs();
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

  const handleDownload = useCallback((config: ApiDocConfig) => {
    if (!config.templateFile) {
      toast.warning("该模板暂无文件");
      return;
    }
    const url = docConfigApi.downloadUrl(config.id);
    const a = document.createElement("a");
    a.href = url;
    a.download = config.templateFile;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, []);

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
      <DataPanel
        toolbar={
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>
              共 {configs.length} 个文档模板
            </span>
          </div>
        }
        total={configs.length}
      >
        <DataTable
          rows={configs}
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
              width: "25%",
              align: "left",
              render: (row) => <span style={{ fontSize: 13 }}>{row.description || "-"}</span>,
            },
            {
              key: "outputFields",
              label: "输出字段",
              width: "25%",
              align: "left",
              render: (row) => {
                try {
                  const fields = JSON.parse(row.outputFields);
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "flex-start" }}>
                      {fields.map((f: string) => (
                        <StatusPill key={f} tone="slate">{f}</StatusPill>
                      ))}
                    </div>
                  );
                } catch {
                  return <span>-</span>;
                }
              },
            },
            {
              key: "actions",
              label: "操作",
              width: "12%",
              sticky: "right" as const,
              align: "center",
              render: (row) => (
                <div className="inline-actions">
                  <button
                    className="text-button"
                    type="button"
                    disabled={!row.templateFile}
                    onClick={() => handleDownload(row)}
                  >
                    <Eye size={13} /> 查看
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() => startEdit(row)}
                  >
                    <Pencil size={13} /> 编辑
                  </button>
                </div>
              ),
            },
          ]}
        />
      </DataPanel>

      {/* no view modal needed - downloads directly */}

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
