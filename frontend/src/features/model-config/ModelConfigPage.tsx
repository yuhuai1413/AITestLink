import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Eye, EyeOff, Pencil, TestTube, Loader2, Check, X, Save, Trash2, ChevronDown } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { modelConfigApi, type ApiModelConfig } from "../../api/client";
import { toast } from "sonner";

const nodeColors: Record<string, string> = {
  "需求解析": "green",
  "生成测试点": "blue",
  "生成测试用例": "blue",
  "用例评审": "red",
  "生成脚本": "amber",
  "执行脚本": "amber",
  "文档生成": "purple",
};

const providerModels: Record<string, { models: string[]; endpoint: string }> = {
  "百度-千帆大模型平台": {
    models: ["ernie-4.0-8k", "ernie-3.5-flash-8k", "ernie-4.0-128k", "ernie-4.5-vl"],
    endpoint: "https://qianfan.baidubce.com/v2",
  },
  "阿里-Dashscope通义千问": {
    models: ["qwen3.6-max", "qwen3.6-plus", "qwen3.5-flash", "qwen-vl-max"],
    endpoint: "https://dashscope.aliyuncs.com/api/v1",
  },
  "字节跳动-火山方舟豆包": {
    models: ["doubao-1.5-pro-32k", "doubao-pro-128k", "doubao-lite-4k", "doubao-vl-pro"],
    endpoint: "https://ark.cn-beijing.volces.com/api/v3",
  },
  "小米-MiMo大模型平台": {
    models: ["mimo-v2.5-pro", "mimo-v2.5", "mimo-v2.5-omni"],
    endpoint: "https://api.xiaomimimo.com/v1",
  },
  "腾讯-云TI混元": {
    models: ["hunyuan-t1", "hunyuan-standard", "hunyuan-long-128k"],
    endpoint: "https://cloud.tencentstudios.tencentcloudapi.com",
  },
  "智谱AI-清言开放平台": {
    models: ["glm-5.1", "glm-4-flash", "glm-vl"],
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
  },
  "深度求索-DeepSeek开放平台": {
    models: ["deepseek-chat", "deepseek-r1"],
    endpoint: "https://api.deepseek.com/v1",
  },
  "月之暗面-Moonshot开放平台": {
    models: ["kimi-k2.6"],
    endpoint: "https://api.moonshot.cn/v1",
  },
  "百川智能-百川大模型平台": {
    models: ["baichuan4-ultra", "baichuan4-turbo"],
    endpoint: "https://api.baichuan-ai.com/v1",
  },
  "科大讯飞-星火认知大模型平台": {
    models: ["spark-4.0-ultra"],
    endpoint: "https://spark-api.xf-yun.com/v1",
  },
};

// 多选下拉框组件
// lockedValues: 不可取消的值（单个编辑时锁定该配置固有的节点）
function MultiSelectDropdown({
  options,
  value,
  onChange,
  lockedValues = [],
  placeholder = "请选择",
}: {
  options: { label: string; value: string; color: string }[];
  value: string[];
  onChange: (value: string[]) => void;
  lockedValues?: string[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setIsFocused(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const toggleOption = (val: string) => {
    if (value.includes(val)) {
      // 锁定的值不可取消
      if (lockedValues.includes(val)) return;
      onChange(value.filter((v) => v !== val));
    } else {
      onChange([...value, val]);
    }
  };

  const selectedLabels = options.filter((o) => value.includes(o.value));

  const inputStyle: React.CSSProperties = {
    width: "100%",
    minHeight: 38,
    border: `1px solid ${isFocused ? "var(--blue)" : "var(--line)"}`,
    borderRadius: "var(--radius-l4)",
    background: "var(--surface)",
    cursor: "pointer",
    padding: "0 32px 0 12px",
    fontSize: 14,
    outline: isFocused ? "2px solid var(--blue)" : "none",
    outlineOffset: isFocused ? "-1px" : "auto",
    transition: "border-color 0.15s, outline 0.15s",
  };

  const dropdownStyle: React.CSSProperties = {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    marginTop: 4,
    background: "var(--surface)",
    border: "1px solid var(--line)",
    borderRadius: "var(--radius-l4)",
    boxShadow: "0 10px 40px rgba(15, 23, 42, 0.12)",
    zIndex: 1000,
    maxHeight: 220,
    overflowY: "auto",
    padding: "4px 0",
  };

  return (
    <div ref={dropdownRef} style={{ position: "relative" }}>
      <div
        onClick={() => { setIsOpen(!isOpen); setIsFocused(!isOpen); }}
        style={inputStyle}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, minHeight: 38, alignItems: "center" }}>
          {selectedLabels.length === 0 ? (
            <span style={{ color: "var(--muted)", fontSize: 14 }}>{placeholder}</span>
          ) : (
            selectedLabels.map((item) => {
              const isLocked = lockedValues.includes(item.value);
              return (
                <StatusPill key={item.value} tone={item.color as any} className="multi-select-tag">
                  {item.label}
                  {!isLocked && (
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleOption(item.value); }}
                      style={{ marginLeft: 4, cursor: "pointer", display: "flex", alignItems: "center", opacity: 0.7 }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = "1"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = "0.7"; }}
                    >
                      <X size={12} />
                    </span>
                  )}
                </StatusPill>
              );
            })
          )}
        </div>
        <ChevronDown
          size={16}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--muted)",
            pointerEvents: "none",
            transition: "transform 0.15s",
          }}
        />
      </div>
      {isOpen && (
        <div style={dropdownStyle} onMouseDown={(e) => e.stopPropagation()}>
          {options.map((opt, index) => {
            const isLocked = lockedValues.includes(opt.value);
            const isSelected = value.includes(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => toggleOption(opt.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "8px 12px",
                  cursor: isLocked ? "default" : "pointer",
                  opacity: isLocked ? 0.7 : 1,
                  background: isSelected ? "var(--blue-soft)" : "transparent",
                  transition: "background 0.1s",
                  borderBottom: index < options.length - 1 ? "1px solid var(--line)" : "none",
                }}
                onMouseEnter={(e) => { if (!isLocked && !isSelected) e.currentTarget.style.background = "var(--surface-soft)"; }}
                onMouseLeave={(e) => { if (!isLocked) e.currentTarget.style.background = isSelected ? "var(--blue-soft)" : "transparent"; }}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  readOnly
                  tabIndex={-1}
                  style={{ cursor: isLocked ? "default" : "pointer", width: 15, height: 15, accentColor: "var(--blue)" }}
                />
                <StatusPill tone={opt.color as any}>{opt.label}</StatusPill>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchEditing, setBatchEditing] = useState(false);
  const [lockedAiNodes, setLockedAiNodes] = useState<string[]>([]);

  // 加载配置
  useEffect(() => {
    loadConfigs();
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
      if (result.ok) {
        setTestResults(prev => ({ ...prev, [config.id]: "success" }));
        toast.success(result.message || "连通正常");
      } else {
        setTestResults(prev => ({ ...prev, [config.id]: "error" }));
        toast.error(result.message || "测试失败");
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
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
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
            </div>
            {selectedIds.size > 0 && (
              <button className="primary-button" type="button" onClick={() => setBatchEditing(true)}>
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
              label: "Endpoint",
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
              align: "center",
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
                    disabled={testingId === row.id}
                  >
                    测试
                  </button>
                </div>
              ),
            },
          ]}
        />
      </DataPanel>

      {/* 单个编辑弹窗 */}
      <Modal
        open={!!editingConfig && !batchEditing}
        onClose={() => { setEditingConfig(null); setShowApiKey(false); }}
        title={`编辑配置 - ${editingConfig?.name}`}
        width={520}
      >
        {editingConfig && (
          <form className="form-stack" onSubmit={(e) => { e.preventDefault(); handleSaveEdit(); }}>
            <div className="form-row">
              <label className="form-label">
                供应商
                <select className="form-select" value={editingConfig.provider} onChange={(e) => {
                  const provider = e.target.value;
                  const models = providerModels[provider];
                  setEditingConfig({
                    ...editingConfig,
                    provider,
                    modelName: models?.models[0] || "",
                    endpoint: models?.endpoint || "",
                  });
                }}>
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
                <select className="form-select" value={editingConfig.modelName} onChange={(e) => setEditingConfig({ ...editingConfig, modelName: e.target.value })}>
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
                  <input className="form-input" type={showApiKey ? "text" : "password"} value={editingConfig.apiKey} onChange={(e) => setEditingConfig({ ...editingConfig, apiKey: e.target.value })} placeholder="请输入 API Key" required style={{ paddingRight: 36 }} />
                  <button type="button" className="icon-button" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28 }} onClick={() => setShowApiKey(!showApiKey)}>
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
            </div>
            <div className="form-row">
              <label className="form-label">
                Endpoint
                <input className="form-input" type="text" value={editingConfig.endpoint} onChange={(e) => setEditingConfig({ ...editingConfig, endpoint: e.target.value })} placeholder="请输入 API 地址" required />
              </label>
            </div>
            <div className="form-row">
              <label className="toggle-label">
                启用
                <label className="toggle-switch">
                  <input type="checkbox" checked={editingConfig.enabled} onChange={(e) => setEditingConfig({ ...editingConfig, enabled: e.target.checked })} />
                  <span className="toggle-switch__slider" />
                </label>
              </label>
            </div>
            <div className="form-actions">
              <button className="ghost-button" type="button" onClick={() => { setEditingConfig(null); setShowApiKey(false); }}>取消</button>
              <button className="primary-button" type="submit">
                <Save size={16} />
                保存
              </button>
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
    </div>
  );
}

// 批量编辑弹窗组件
function BatchEditModal({
  open,
  onClose,
  onSave,
  selectedCount,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (provider: string, modelName: string, apiKey: string, endpoint: string) => void;
  selectedCount: number;
}) {
  const [provider, setProvider] = useState("");
  const [modelName, setModelName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("");
  const [showKey, setShowKey] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(provider, modelName, apiKey, endpoint);
    // 重置
    setProvider("");
    setModelName("");
    setApiKey("");
    setEndpoint("");
    setShowKey(false);
  };

  return (
    <Modal open={open} onClose={onClose} title={`批量编辑（${selectedCount} 项）`} width={520}>
      <form className="form-stack" onSubmit={handleSubmit}>
        <div style={{ padding: "12px 16px", background: "var(--blue-soft)", borderRadius: 8, fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
          将为选中的 <strong>{selectedCount}</strong> 个配置统一设置以下信息
        </div>
        <div className="form-row">
          <label className="form-label">
            供应商
            <select className="form-select" value={provider} onChange={(e) => {
              const p = e.target.value;
              setProvider(p);
              const models = providerModels[p];
              if (models) {
                setModelName(models.models[0] || "");
                setEndpoint(models.endpoint || "");
              }
            }} required>
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
            <select className="form-select" value={modelName} onChange={(e) => setModelName(e.target.value)} required>
              <option value="">请选择模型</option>
              {(providerModels[provider]?.models || []).map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            API Key
            <div className="input-with-icon">
              <input className="form-input" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="请输入 API Key" required style={{ paddingRight: 36 }} />
              <button type="button" className="icon-button" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28 }} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            Endpoint
            <input className="form-input" type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="请输入 API 地址" required />
          </label>
        </div>
        <div className="form-actions">
          <button className="ghost-button" type="button" onClick={onClose}>取消</button>
          <button className="primary-button" type="submit">
            <Save size={16} />
            确认保存
          </button>
        </div>
      </form>
    </Modal>
  );
}
