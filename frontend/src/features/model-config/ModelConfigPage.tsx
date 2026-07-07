import { useState, useEffect, useCallback, useMemo } from "react";
import { Eye, EyeOff, Pencil, TestTube, Loader2, Check, X, Save } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";
import { DataPanel } from "../../shared/components/DataPanel";
import { modelConfigApi, type ApiModelConfig } from "../../api/client";
import { toast } from "sonner";

const nodeColors: Record<string, string> = {
  "需求解析": "green",
  "测试设计": "blue",
  "用例评审": "red",
  "自动化": "amber",
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
      if (nodeFilter !== "all" && c.aiNode !== nodeFilter) return false;
      if (providerFilter !== "all" && c.provider !== providerFilter) return false;
      return true;
    });
  }, [configs, nodeFilter, providerFilter]);

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
          <div className="search-form">
            <div className="search-form__field">
              <label className="search-form__label">AI 能力</label>
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
        }
        total={filteredConfigs.length}
      >
        <DataTable
        rows={filteredConfigs}
        getRowKey={(row) => row.id}
        columns={[
            {
              key: "aiNode",
              label: "AI 能力",
              width: "10%",
              render: (row) => (
                <StatusPill tone={(nodeColors[row.aiNode] || "slate") as any}>{row.aiNode}</StatusPill>
              ),
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
                  <button className="text-button" type="button" onClick={() => setEditingConfig({ ...row })}>
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

      {/* 编辑弹窗 */}
      <Modal
        open={!!editingConfig}
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
    </div>
  );
}
