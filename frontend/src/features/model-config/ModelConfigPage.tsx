import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Eye, EyeOff, Pencil, TestTube, Loader2, Check, X, Save, Trash2, ChevronDown, RotateCcw, Settings } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { modelConfigApi, type ApiModelConfig } from "../../api/client";
import { toast } from "sonner";
import { getMeWithAdmin } from "../auth/api/auth";
import { TOKEN_KEY } from "../../shared/config/storage";
import { useUnsavedChanges } from "../../shared/hooks/useUnsavedChanges";
import { MultiSelectDropdown } from "./components/MultiSelectDropdown";
import { AdminPromptModal, BatchEditModal } from "./components/ModelConfigModals";
import { providerModels } from "./modelConfig.constants";

const nodeColors: Record<string, string> = {
  "需求解析": "green",
  "生成测试点": "blue",
  "生成测试用例": "blue",
  "生成脚本": "amber",
  "执行脚本": "amber",
  "文档生成": "purple",
};


function maskKey(key: string): string {
  if (!key) return "****未配置";
  if (key.length <= 8) return "****" + key;
  return "****" + key.slice(-6);
}

export function ModelConfigPage() {
  const [configs, setConfigs] = useState<ApiModelConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ApiModelConfig | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, "success" | "error" | null>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [nodeFilter, setNodeFilter] = useState("all");
  const [providerFilter, setProviderFilter] = useState("all");

  const resetFilters = () => {
    setNodeFilter("all");
    setProviderFilter("all");
  };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditing, setBatchEditing] = useState(false);
  const [lockedAiNodes, setLockedAiNodes] = useState<string[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const configDirty = useUnsavedChanges();
  const [showAdminPromptModal, setShowAdminPromptModal] = useState(false);
  const [adminPrompts, setAdminPrompts] = useState<{ configKey: string; name: string; prompt: string; version?: number | null; status?: string }[]>([]);
  const [promptVersions, setPromptVersions] = useState<Array<{ id: string; version: number; prompt: string; status: string; createdAt?: string | null }>>([]);
  const [promptTesting, setPromptTesting] = useState(false);
  const [adminPromptsLoading, setAdminPromptsLoading] = useState(false);
  const [editingPromptConfig, setEditingPromptConfig] = useState<ApiModelConfig | null>(null);

  // 加载配置
  useEffect(() => {
    loadConfigs();
    getMeWithAdmin().then((res) => {
      if (res.ok) setIsAdmin(res.user.is_admin || false);
    }).catch(() => {});
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const data = await modelConfigApi.list();
      if (data && data.length > 0) {
        setConfigs(data);
      }
    } catch (error) {
      console.error("Failed to load configs:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadAdminPrompts = async () => {
    setAdminPromptsLoading(true);
    try {
      const res = await fetch("/api/model-configs/admin-prompts", {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminPrompts(data);
      }
    } catch (e) {
      console.error("Failed to load admin prompts:", e);
    } finally {
      setAdminPromptsLoading(false);
    }
  };

  const loadPromptVersions = async (configKey: string) => {
    try {
      const res = await fetch(`/api/model-configs/admin-prompts/${configKey}/versions`, {
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      if (res.ok) setPromptVersions(await res.json());
    } catch (e) {
      console.error("Failed to load prompt versions:", e);
    }
  };

  const saveAdminPrompts = async () => {
    // 校验当前编辑的节点提示词不能为空
    const currentPrompt = adminPrompts.find((p) => p.configKey === editingPromptConfig?.configKey);
    if (!currentPrompt?.prompt?.trim()) {
      toast.error("提示词不能为空");
      return;
    }
    try {
      const res = await fetch("/api/model-configs/admin-prompts", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
        body: JSON.stringify({ prompts: [currentPrompt] }),
      });
      if (res.ok) {
        toast.success("提示词新版本已发布");
        setShowAdminPromptModal(false);
        setEditingPromptConfig(null);
        loadConfigs();
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.detail || "发布失败");
      }
    } catch (e) {
      toast.error("保存失败");
    }
  };

  const testAdminPrompt = async () => {
    if (!editingPromptConfig) return;
    const prompt = adminPrompts.find((item) => item.configKey === editingPromptConfig.configKey)?.prompt || "";
    if (!prompt.trim()) {
      toast.error("提示词不能为空");
      return;
    }
    setPromptTesting(true);
    try {
      const res = await fetch(`/api/model-configs/admin-prompts/${editingPromptConfig.configKey}/test`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}`,
        },
        body: JSON.stringify({ prompt }),
      });
      const data = await res.json();
      if (res.ok) toast.success(`提示词测试通过，共生成 ${data.count} 条合规数据`);
      else toast.error(data.detail || "提示词测试失败");
    } catch {
      toast.error("提示词测试失败");
    } finally {
      setPromptTesting(false);
    }
  };

  const rollbackAdminPrompt = async (versionId: string) => {
    if (!editingPromptConfig) return;
    try {
      const res = await fetch(`/api/model-configs/admin-prompts/${editingPromptConfig.configKey}/rollback/${versionId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      if (!res.ok) throw new Error("rollback failed");
      toast.success("已回滚并发布为新版本");
      await Promise.all([loadAdminPrompts(), loadPromptVersions(editingPromptConfig.configKey)]);
    } catch {
      toast.error("回滚失败");
    }
  };

  const filteredConfigs = useMemo(() => {
    return configs.filter((c) => {
      if (nodeFilter !== "all") {
        const nodes = Array.isArray(c.aiNode) ? c.aiNode : [c.aiNode];
        if (!nodes.includes(nodeFilter)) return false;
      }
      if (providerFilter !== "all" && c.provider !== providerFilter) return false;
      return true;
    });
  }, [configs, nodeFilter, providerFilter]);

  const allSelected = filteredConfigs.length > 0 && filteredConfigs.every((c) => selectedIds.has(c.id));
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredConfigs.map((c) => c.id)));
    }
  };
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const saveConfigs = async (newConfigs: ApiModelConfig[]) => {
    setSaving(true);
    try {
      const result = await modelConfigApi.update(newConfigs);
      if (result.ok) {
        setConfigs(newConfigs);
        toast.success("保存成功");
      }
    } catch (error) {
      console.error("Failed to save configs:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = useCallback(async (config: ApiModelConfig) => {
    setTestingId(config.id);
    setTestResults(prev => ({ ...prev, [config.id]: null }));

    try {
      const result = await modelConfigApi.test(config.id);
      if (result && result.ok) {
        setTestResults(prev => ({ ...prev, [config.id]: "success" }));
        toast.success(result.message || "连通正常");
      } else {
        setTestResults(prev => ({ ...prev, [config.id]: "error" }));
        toast.error(result?.message || "测试失败");
      }
    } catch (error: any) {
      console.error("Test connection error:", error);
      setTestResults(prev => ({ ...prev, [config.id]: "error" }));
      toast.error(error.message || "测试失败");
    } finally {
      setTestingId(null);
      setTimeout(() => {
        setTestResults(prev => ({ ...prev, [config.id]: null }));
      }, 3000);
    }
  }, []);

  const updateConfig = async (id: string, field: keyof ApiModelConfig, value: string | boolean) => {
    const newConfigs = configs.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    await saveConfigs(newConfigs);
  };

  const handleSaveEdit = async () => {
    if (editingConfig) {
      const newConfigs = configs.map((c) => {
        if (c.id === editingConfig.id) {
          return { ...editingConfig };
        }
        return c;
      });
      await saveConfigs(newConfigs);
      await loadConfigs();
      configDirty.markClean();
      setEditingConfig(null);
      setShowApiKey(false);
    }
  };

  // 批量编辑保存
  const handleBatchSave = async (provider: string, modelName: string, apiKey: string, endpoint: string) => {
    const newConfigs = configs.map((c) => {
      if (selectedIds.has(c.id)) {
        return { ...c, provider, modelName, apiKey, endpoint };
      }
      return c;
    });
    await saveConfigs(newConfigs);
    await loadConfigs();
    setSelectedIds(new Set());
    setBatchEditing(false);
  };

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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", width: "100%" }}>
            <div className="search-form" style={{ flex: 1, margin: 0 }}>
              <div className="search-form__field">
                <label className="search-form__label">AI 节点</label>
                <select
                  className="search-form__select"
                  value={nodeFilter}
                  onChange={(e) => setNodeFilter(e.target.value)}
                >
                  <option value="all">全部</option>
                  {Object.keys(nodeColors).map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <div className="search-form__field">
                <label className="search-form__label">供应商</label>
                <select
                  className="search-form__select"
                  value={providerFilter}
                  onChange={(e) => setProviderFilter(e.target.value)}
                >
                  <option value="all">全部供应商</option>
                  {Object.keys(providerModels).map((p) => (
                    <option key={p} value={p}>{p.split("-")[0]}</option>
                  ))}
                </select>
              </div>
              <button className="ghost-button toolbar-button toolbar-ghost-button" type="button" onClick={resetFilters}>
                <RotateCcw size={14} />
                重置
              </button>
            </div>
            {selectedIds.size > 0 && (
              <button className="primary-button toolbar-button toolbar-primary-button" type="button" onClick={() => setBatchEditing(true)} style={{ marginLeft: "auto", flexShrink: 0 }}>
                批量编辑（{selectedIds.size}）
              </button>
            )}
          </div>
        }
        total={filteredConfigs.length}
      >
        <DataTable
        rows={filteredConfigs}
        getRowKey={(row) => row.id}
        columns={[
            {
              key: "select",
              label: <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />,
              width: "40px",
              render: (row) => (
                <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelect(row.id)} />
              ),
            },
            {
              key: "aiNode",
              label: "AI 节点",
              width: "12%",
              align: "center",
              render: (row) => {
                const nodes = Array.isArray(row.aiNode) ? row.aiNode : [row.aiNode];
                return (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, justifyContent: "center" }}>
                    {nodes.map((n: string) => (
                      <StatusPill key={n} tone={(nodeColors[n] || "slate") as any}>{n}</StatusPill>
                    ))}
                  </div>
                );
              },
            },
            { key: "description", label: "说明", align: "left", width: "20%", render: (row) => <span style={{ fontSize: 13 }}>{row.description}</span> },
            { key: "provider", label: "供应商", width: "8%", render: (row) => <span className="provider-tag">{row.provider ? row.provider.split("-")[0] : "-"}</span> },
            { key: "modelName", label: "模型", width: "10%", render: (row) => row.modelName || "-" },
            {
              key: "apiKey",
              label: "API Key",
              width: "12%",
              render: (row) => <span className="api-key-masked">{maskKey(row.apiKey)}</span>,
            },
            {
              key: "endpoint",
              label: "Base URL",
              width: "20%",
              render: (row) => {
                const ep = row.endpoint;
                if (!ep) return <span className="text-muted" style={{ fontSize: 12 }}>-</span>;
                const display = ep.length > 35 ? ep.slice(0, 35) + "..." : ep;
                return (
                  <span className="text-muted" style={{ fontSize: 12 }} title={ep}>
                    {display}
                  </span>
                );
              },
            },
            {
              key: "enabled",
              label: "状态",
              width: "6%",
              align: "center",
              render: (row) => (
                <label className="toggle-switch">
                  <input type="checkbox" checked={row.enabled} onChange={(e) => updateConfig(row.id, "enabled", e.target.checked)} />
                  <span className="toggle-switch__slider" />
                </label>
              ),
            },
            {
              key: "actions",
              label: "操作",
              width: "10%",
              sticky: "right" as const, align: "center",
              render: (row) => (
                <div className="inline-actions">
                  <button className="text-button" type="button" onClick={() => {
                    const aiNode = Array.isArray(row.aiNode) ? row.aiNode : [row.aiNode];
                    setEditingConfig({ ...row, aiNode });
                    setLockedAiNodes(aiNode);
                  }}>
                    编辑
                  </button>
                  <button
                    className="text-button test-button"
                    type="button"
                    onClick={() => testConnection(row)}
                    disabled={testingId === row.id}
                  >
                    {testingId === row.id ? (
                      <span className="test-loading">
                        <Loader2 size={14} className="animate-spin" />
                        测试中
                      </span>
                    ) : '测试'}
                  </button>
                  {isAdmin && (
                    <button className="text-button" type="button" onClick={() => {
                      setEditingPromptConfig(row);
                      setShowAdminPromptModal(true);
                      loadAdminPrompts();
                      loadPromptVersions(row.configKey);
                    }}>
                      配置提示词
                    </button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </DataPanel>

      {/* 单个编辑弹窗 */}
      <Modal
        open={!!editingConfig && !batchEditing}
        onClose={() => configDirty.requestClose(() => { setEditingConfig(null); setShowApiKey(false); })}
        title={`编辑配置 - ${editingConfig?.name}`}
        width={640}
        footer={<>
          <button className="ghost-button" type="button" onClick={() => configDirty.requestClose(() => { setEditingConfig(null); setShowApiKey(false); })}>取消</button>
          <button className="primary-button" type="button" onClick={handleSaveEdit}><Save size={16} /> 保存</button>
        </>}
      >
        {editingConfig && (
          <form className="form-stack" onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
            <div className="form-row">
              <label className="form-label">
                供应商
                <select className="form-select" value={editingConfig.provider} onChange={(e) => { setEditingConfig({ ...editingConfig, provider: e.target.value }); configDirty.markDirty(); }}>
                  <option value="">请选择供应商</option>
                  {Object.keys(providerModels).map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                模型名称
                <select className="form-select" value={editingConfig.modelName} onChange={(e) => { setEditingConfig({ ...editingConfig, modelName: e.target.value }); configDirty.markDirty(); }}>
                  <option value="">请选择模型</option>
                  {(providerModels[editingConfig.provider]?.models || []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  {editingConfig.modelName && !providerModels[editingConfig.provider]?.models?.includes(editingConfig.modelName) && (
                    <option value={editingConfig.modelName}>{editingConfig.modelName}</option>
                  )}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                API Key
                <div className="input-with-icon">
                  <input className="form-input" type={showApiKey ? "text" : "password"} value={editingConfig.apiKey} onChange={(e) => {
                    const value = e.target.value;
                    const newConfig = { ...editingConfig, apiKey: value };
                    if (!editingConfig.endpoint || editingConfig.endpoint.includes("xiaomimimo")) {
                      if (value.startsWith("tp-")) {
                        newConfig.endpoint = "https://token-plan-cn.xiaomimimo.com/v1";
                      } else if (value.startsWith("sk-")) {
                        newConfig.endpoint = "https://api.xiaomimimo.com/v1";
                      }
                    }
                    setEditingConfig(newConfig);
                  }} placeholder="请输入 API Key（sk- 开头为 API Keys 模式，tp- 开头为 Token Plan 模式）" required style={{ paddingRight: 36 }} />
                  <button type="button" className="icon-button" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28 }} onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                Base URL
                <input className="form-input" type="text" value={editingConfig.endpoint} onChange={(e) => { setEditingConfig({ ...editingConfig, endpoint: e.target.value }); configDirty.markDirty(); }} placeholder="请输入 API 地址，如 https://api.openai.com/v1" required />
              </label>
            </div>
            <div className="form-row">
              <label className="toggle-label">
                启用
                <label className="toggle-switch">
                  <input type="checkbox" checked={editingConfig.enabled} onChange={(e) => { setEditingConfig({ ...editingConfig, enabled: e.target.checked }); configDirty.markDirty(); }} />
                  <span className="toggle-switch__slider" />
                </label>
              </label>
            </div>
          </form>
        )}
      </Modal>

      {/* 批量编辑弹窗 */}
      <BatchEditModal
        open={batchEditing}
        onClose={() => setBatchEditing(false)}
        onSave={handleBatchSave}
        selectedCount={selectedIds.size}
      />

      {/* 管理员提示词配置弹窗 */}
      <AdminPromptModal
        open={showAdminPromptModal}
        onClose={() => { setShowAdminPromptModal(false); setEditingPromptConfig(null); }}
        configName={editingPromptConfig?.name || ""}
        prompt={adminPrompts.find((p) => p.configKey === editingPromptConfig?.configKey)?.prompt || ""}
        loading={adminPromptsLoading}
        onSave={saveAdminPrompts}
        onPromptChange={(prompt) => {
          setAdminPrompts((prev) => prev.map((p) =>
            p.configKey === editingPromptConfig?.configKey ? { ...p, prompt } : p
          ));
        }}
        currentVersion={adminPrompts.find((p) => p.configKey === editingPromptConfig?.configKey)?.version}
        versions={promptVersions}
        testing={promptTesting}
        onTest={testAdminPrompt}
        onRollback={rollbackAdminPrompt}
      />
      {configDirty.confirmDialog}
    </div>
  );
}
