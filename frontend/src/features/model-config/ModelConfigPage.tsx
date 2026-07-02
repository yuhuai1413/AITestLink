import { useState, useEffect } from "react";
import { Eye, EyeOff, Pencil, TestTube } from "lucide-react";
import { Modal } from "../../shared/components/Modal";
import { SectionHeader } from "../../shared/components/SectionHeader";
import { StatusPill } from "../../shared/components/StatusPill";
import { DataTable } from "../../shared/components/DataTable";

interface ModelConfig {
  id: string;
  name: string;
  aiNode: string;
  provider: string;
  modelName: string;
  apiKey: string;
  endpoint: string;
  description: string;
  enabled: boolean;
}

const STORAGE_KEY = "aitestlink-model-configs";
const CONFIG_VERSION = "2.0";

const defaultConfigs: ModelConfig[] = [
  {
    id: "parse-requirements",
    name: "需求解析",
    aiNode: "需求解析节点",
    provider: "小米-MiMo大模型平台",
    modelName: "mimo-v2.5",
    apiKey: "tp-cazodxk90u6tcem5z6cumzxxlxzm5ioon8hf561ow4bo0jzf",
    endpoint: "https://api.xiaomimimo.com/v1",
    description: "从需求文档中提取模块、功能点和业务规则",
    enabled: true,
  },
  {
    id: "generate-test-points",
    name: "测试点生成",
    aiNode: "测试设计节点",
    provider: "小米-MiMo大模型平台",
    modelName: "mimo-v2.5",
    apiKey: "tp-cazodxk90u6tcem5z6cumzxxlxzm5ioon8hf561ow4bo0jzf",
    endpoint: "https://api.xiaomimimo.com/v1",
    description: "根据需求生成覆盖正常、异常、边界等场景的测试点",
    enabled: true,
  },
  {
    id: "generate-test-cases",
    name: "用例生成",
    aiNode: "测试设计节点",
    provider: "小米-MiMo大模型平台",
    modelName: "mimo-v2.5",
    apiKey: "tp-cazodxk90u6tcem5z6cumzxxlxzm5ioon8hf561ow4bo0jzf",
    endpoint: "https://api.xiaomimimo.com/v1",
    description: "根据测试点生成包含步骤和预期结果的测试用例",
    enabled: true,
  },
  {
    id: "review-test-cases",
    name: "用例评审",
    aiNode: "测试设计节点",
    provider: "小米-MiMo大模型平台",
    modelName: "mimo-v2.5",
    apiKey: "tp-cazodxk90u6tcem5z6cumzxxlxzm5ioon8hf561ow4bo0jzf",
    endpoint: "https://api.xiaomimimo.com/v1",
    description: "评审测试用例的完整性和可执行性",
    enabled: true,
  },
];

const nodeColors: Record<string, string> = {
  "需求解析节点": "green",
  "测试设计节点": "blue",
  "自动化节点": "amber",
  "报告节点": "slate",
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

function loadConfigs(): ModelConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // 版本检查：旧数据自动替换为新默认值
      if (parsed._version === CONFIG_VERSION) {
        return parsed.configs || defaultConfigs;
      }
    }
  } catch {}
  return defaultConfigs;
}

function saveConfigs(configs: ModelConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ _version: CONFIG_VERSION, configs }));
}

function maskKey(key: string): string {
  if (!key) return "****未配置";
  if (key.length <= 8) return "****" + key;
  return "****" + key.slice(-6);
}

export function ModelConfigPage() {
  const [configs, setConfigs] = useState<ModelConfig[]>([]);
  const [editingConfig, setEditingConfig] = useState<ModelConfig | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    setConfigs(loadConfigs());
  }, []);

  const updateConfig = (id: string, field: keyof ModelConfig, value: string | boolean) => {
    const newConfigs = configs.map((c) => (c.id === id ? { ...c, [field]: value } : c));
    setConfigs(newConfigs);
    saveConfigs(newConfigs);
  };

  return (
    <div className="page-stack">
      <SectionHeader
        eyebrow="系统设置"
        title="模型配置"
        description="为每个 AI 节点配置模型供应商、API Key 和参数。"
      />

      <section className="work-panel">
        <DataTable
          rows={configs}
          getRowKey={(row) => row.id}
          columns={[
            {
              key: "aiNode",
              label: "AI 节点",
              width: "110px",
              render: (row) => (
                <StatusPill tone={(nodeColors[row.aiNode] || "slate") as any}>{row.aiNode}</StatusPill>
              ),
            },
            { key: "description", label: "说明", align: "left", width: "15%", render: (row) => <span style={{ fontSize: 13 }}>{row.description}</span> },
            { key: "provider", label: "供应商", width: "80px", render: (row) => <span className="provider-tag">{row.provider.split("-")[0]}</span> },
            { key: "modelName", label: "模型", width: "110px", render: (row) => row.modelName },
            {
              key: "apiKey",
              label: "API Key",
              width: "140px",
              render: (row) => <span className="api-key-masked">{maskKey(row.apiKey)}</span>,
            },
            {
              key: "endpoint",
              label: "Endpoint",
              width: "18%",
              render: (row) => (
                <span className="text-muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }} title={row.endpoint}>
                  {row.endpoint}
                </span>
              ),
            },
            {
              key: "enabled",
              label: "状态",
              width: "70px",
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
              width: "120px",
              render: (row) => (
                <div className="inline-actions" style={{ whiteSpace: "nowrap" }}>
                  <button className="text-button" type="button" style={{ color: "var(--blue)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => setEditingConfig({ ...row })}>
                    <Pencil size={13} strokeWidth={2.5} /> 编辑
                  </button>
                  <button className="text-button" type="button" style={{ color: "var(--green)", fontSize: 13, display: "inline-flex", alignItems: "center", gap: 4 }} onClick={() => alert("测试连接中...（功能待实现）")}>
                    <TestTube size={13} strokeWidth={2.5} /> 测试
                  </button>
                </div>
              ),
            },
          ]}
        />
      </section>

      {/* 编辑弹窗 */}
      <Modal
        open={!!editingConfig}
        onClose={() => { setEditingConfig(null); setShowApiKey(false); }}
        title={`编辑配置 - ${editingConfig?.name}`}
        width={560}
      >
        {editingConfig && (
          <form className="form-stack" onSubmit={(e) => { e.preventDefault(); if (editingConfig) { const newConfigs = configs.map((c) => (c.id === editingConfig.id ? editingConfig : c)); setConfigs(newConfigs); saveConfigs(newConfigs); } setEditingConfig(null); setShowApiKey(false); }}>
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
                  {(providerModels[editingConfig.provider]?.models || []).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value={editingConfig.modelName}>{editingConfig.modelName}</option>
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
                <input className="form-input" type="text" value={editingConfig.endpoint} onChange={(e) => setEditingConfig({ ...editingConfig, endpoint: e.target.value })} required />
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
              <button className="primary-button" type="submit">保存</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}
