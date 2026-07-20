import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, EyeOff, Loader2, Save, RotateCcw } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { MenuSelect } from "../../shared/components/MenuSelect";
import { modelConfigApi, type ApiModelConfig } from "../../api/client";
import { toast } from "sonner";
import { getMeWithAdmin } from "../auth/api/auth";
import { TOKEN_KEY } from "../../shared/config/storage";
import { useUnsavedChanges } from "../../shared/hooks/useUnsavedChanges";
import { MultiSelectDropdown } from "./components/MultiSelectDropdown";
import { AdminPromptModal, BatchEditModal } from "./components/ModelConfigModals";
import { providerModels } from "./modelConfig.constants";
import { formatDateTime } from "../../shared/utils/dateTime";

const nodeColors: Record<string, string> = {
  "需求解析": "green",
  "AI反推需求": "green",
  "系统识别": "purple",
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

const connectionTone: Record<ApiModelConfig["connectionStatus"], "green" | "red" | "amber" | "slate" | "blue"> = {
  normal: "green",
  abnormal: "red",
  testing: "blue",
  untested: "slate",
};

const connectionText: Record<ApiModelConfig["connectionStatus"], string> = {
  normal: "正常",
  abnormal: "异常",
  testing: "检测中",
  untested: "未测试",
};

function formatTestTime(value: string | null | undefined): string {
  return formatDateTime(value, "");
}

export function ModelConfigPage() {
  const [configs, setConfigs] = useState<ApiModelConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ApiModelConfig | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [autoTestingIds, setAutoTestingIds] = useState<Set<string>>(new Set());
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

  const deleteAdminPromptVersion = async (versionId: string) => {
    if (!editingPromptConfig) return;
    try {
      const res = await fetch(`/api/model-configs/admin-prompts/${editingPromptConfig.configKey}/versions/${versionId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY)}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "delete failed");
      toast.success("已删除历史版本");
      await loadPromptVersions(editingPromptConfig.configKey);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
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

  const applyTestResult = (id: string, result: { ok: boolean; status: ApiModelConfig["connectionStatus"]; message: string; latencyMs?: number | null; lastTestedAt?: string | null }) => {
    setConfigs((prev) => prev.map((item) => item.id === id ? {
      ...item,
      connectionStatus: result.status,
      lastTestMessage: result.message,
      lastTestLatencyMs: result.latencyMs ?? null,
      lastTestedAt: result.lastTestedAt ?? new Date().toISOString(),
    } : item));
  };

  const runConnectionTest = useCallback(async (configId: string, options?: { silent?: boolean }) => {
    setTestingId((current) => current || configId);
    setAutoTestingIds((prev) => new Set(prev).add(configId));
    setConfigs((prev) => prev.map((item) => item.id === configId ? { ...item, connectionStatus: "testing" } : item));
    try {
      const result = await modelConfigApi.test(configId);
      applyTestResult(configId, result);
      if (!options?.silent) {
        result.ok ? toast.success(result.message || "连通正常") : toast.error(result.message || "测试失败");
      }
      return result.ok;
    } catch (error: any) {
      const message = error.message || "测试失败";
      setConfigs((prev) => prev.map((item) => item.id === configId ? {
        ...item,
        connectionStatus: "abnormal",
        lastTestMessage: message,
        lastTestedAt: new Date().toISOString(),
      } : item));
      if (!options?.silent) toast.error(message);
      return false;
    } finally {
      setTestingId((current) => current === configId ? null : current);
      setAutoTestingIds((prev) => {
        const next = new Set(prev);
        next.delete(configId);
        return next;
      });
    }
  }, []);

  const runConnectionTests = useCallback(async (configIds: string[]) => {
    const queue = [...new Set(configIds)];
    const workers = Array.from({ length: Math.min(2, queue.length) }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (id) await runConnectionTest(id, { silent: true });
      }
    });
    await Promise.all(workers);
    await loadConfigs();
  }, [runConnectionTest]);

  const enabledTestIds = (configList: ApiModelConfig[], candidateIds: string[]) => {
    const candidates = new Set(candidateIds);
    return configList.filter((config) => candidates.has(config.id) && config.enabled).map((config) => config.id);
  };

  const saveConfigs = async (newConfigs: ApiModelConfig[], testIds: string[] = []) => {
    setSaving(true);
    try {
      const result = await modelConfigApi.update(newConfigs);
      if (result.ok) {
        setConfigs(newConfigs);
        toast.success("保存成功");
        const idsToTest = enabledTestIds(newConfigs, testIds);
        if (idsToTest.length > 0) {
          toast.info("已开始自动检测连接状态");
          void runConnectionTests(idsToTest);
        }
      }
    } catch (error) {
      console.error("Failed to save configs:", error);
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = useCallback(async (config: ApiModelConfig) => {
    if (!config.enabled) {
      toast.warning("配置已禁用，启用后再测试连接");
      return;
    }
    await runConnectionTest(config.id);
  }, [runConnectionTest]);

  const updateConfig = async (id: string, field: keyof ApiModelConfig, value: string | boolean) => {
    const newConfigs = configs.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    await saveConfigs(newConfigs, [id]);
  };

  const handleSaveEdit = async () => {
    if (editingConfig) {
      const newConfigs = configs.map((c) => {
        if (c.id === editingConfig.id) {
          return { ...editingConfig };
        }
        return c;
      });
      await saveConfigs(newConfigs, [editingConfig.id]);
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
    await saveConfigs(newConfigs, Array.from(selectedIds));
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
                <MenuSelect
                  className="search-form__menu-select"
                  size="compact"
                  value={nodeFilter}
                  options={[{ value: "all", label: "全部" }, ...Object.keys(nodeColors).map((n) => ({ value: n, label: n }))]}
                  onChange={setNodeFilter}
                />
              </div>
              <div className="search-form__field">
                <label className="search-form__label">供应商</label>
                <MenuSelect
                  className="search-form__menu-select"
                  size="compact"
                  value={providerFilter}
                  options={[{ value: "all", label: "全部供应商" }, ...Object.keys(providerModels).map((p) => ({ value: p, label: p.split("-")[0] }))]}
                  onChange={setProviderFilter}
                />
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
            { key: "description", label: "说明", align: "left", width: "16%", lineClamp: 2, render: (row) => <span style={{ fontSize: 13 }}>{row.description}</span> },
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
              width: "14%",
              lineClamp: 2,
              render: (row) => {
                const ep = row.endpoint;
                if (!ep) return <span className="text-muted" style={{ fontSize: 12 }}>-</span>;
                return (
                  <span className="text-muted" style={{ fontSize: 12 }} title={ep}>
                    {ep}
                  </span>
                );
              },
            },
            {
              key: "enabled",
              label: "启用",
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
              key: "connectionStatus",
              label: "连接状态",
              width: "96px",
              align: "center",
              render: (row) => {
                const isTesting = row.connectionStatus === "testing" || autoTestingIds.has(row.id);
                const message = row.lastTestMessage || "暂无测试记录";
                return (
                  <span title={message}>
                    <StatusPill tone={connectionTone[isTesting ? "testing" : row.connectionStatus]} className="model-config-status-pill">
                      {isTesting ? <><Loader2 size={12} className="animate-spin" /> 检测中</> : connectionText[row.connectionStatus]}
                    </StatusPill>
                  </span>
                );
              },
            },
            {
              key: "lastTestedAt",
              label: "测试时间",
              width: "10%",
              align: "center",
              render: (row) => {
                const time = formatTestTime(row.lastTestedAt);
                const latency = row.lastTestLatencyMs ? `耗时 ${row.lastTestLatencyMs}ms` : "";
                const message = row.lastTestMessage || "暂无测试记录";
                return time ? (
                  <span title={`${message}${latency ? `\n${latency}` : ""}`} style={{ color: "var(--muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                    {time}
                  </span>
                ) : (
                  <span title={message} style={{ color: "var(--muted)", fontSize: 12 }}>-</span>
                );
              },
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
                    className="text-button"
                    type="button"
                    onClick={() => testConnection(row)}
                    disabled={!row.enabled || testingId === row.id || autoTestingIds.has(row.id)}
                    title={!row.enabled ? "配置已禁用，启用后再测试" : undefined}
                  >
                    测试
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
                <MenuSelect value={editingConfig.provider} options={[{ value: "", label: "请选择供应商" }, ...Object.keys(providerModels).map((p) => ({ value: p, label: p }))]} onChange={(value) => { setEditingConfig({ ...editingConfig, provider: value }); configDirty.markDirty(); }} />
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                模型名称
                <MenuSelect value={editingConfig.modelName} options={[
                  { value: "", label: "请选择模型" },
                  ...(providerModels[editingConfig.provider]?.models || []).map((m) => ({ value: m, label: m })),
                  ...(editingConfig.modelName && !providerModels[editingConfig.provider]?.models?.includes(editingConfig.modelName) ? [{ value: editingConfig.modelName, label: editingConfig.modelName }] : []),
                ]} onChange={(value) => { setEditingConfig({ ...editingConfig, modelName: value }); configDirty.markDirty(); }} />
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
                    configDirty.markDirty();
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
        onDelete={deleteAdminPromptVersion}
      />
      {configDirty.confirmDialog}
    </div>
  );
}
