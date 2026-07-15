import { useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, RotateCcw, Save, TestTube } from "lucide-react";
import { Modal } from "../../../shared/components/Modal";
import { useUnsavedChanges } from "../../../shared/hooks/useUnsavedChanges";
import { providerModels } from "../modelConfig.constants";

// 批量编辑弹窗组件
export function BatchEditModal({
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

  // 根据 API Key 自动判断 Base URL
  const detectBaseUrl = (key: string): string => {
    if (!key) return "";
    key = key.trim();
    // 小米 MiMo Token Plan 模式
    if (key.startsWith("tp-")) return "https://token-plan-cn.xiaomimimo.com/v1";
    // 小米 MiMo API Keys 模式
    if (key.startsWith("sk-")) return "https://api.xiaomimimo.com/v1";
    return "";
  };

  const handleApiKeyChange = (value: string) => {
    setApiKey(value);
    // 如果 Endpoint 为空或是小米的默认值，自动填充
    if (!endpoint || endpoint.includes("xiaomimimo")) {
      const detected = detectBaseUrl(value);
      if (detected) setEndpoint(detected);
    }
  };

  const handleSubmit = (e: FormEvent) => {
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
    <Modal open={open} onClose={onClose} title={`批量编辑（${selectedCount} 项）`} width={640}
      footer={<>
        <button className="ghost-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" onClick={handleSubmit}><Save size={16} /> 确认保存</button>
      </>}
    >
      <form className="form-stack" onSubmit={handleSubmit}>
        <div style={{ padding: "12px 16px", background: "var(--blue-soft)", borderRadius: 8, fontSize: 13, color: "var(--text)", marginBottom: 8 }}>
          将为选中的 <strong>{selectedCount}</strong> 个配置统一设置以下信息
        </div>
        <div className="form-row">
          <label className="form-label">
            供应商
            <select className="form-select" value={provider} onChange={(e) => setProvider(e.target.value)} required>
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
              <input className="form-input" type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => handleApiKeyChange(e.target.value)} placeholder="请输入 API Key（sk- 开头为 API Keys 模式，tp- 开头为 Token Plan 模式）" required style={{ paddingRight: 36 }} />
              <button type="button" className="icon-button" style={{ position: "absolute", right: 4, top: "50%", transform: "translateY(-50%)", width: 28, height: 28 }} onClick={() => setShowKey(!showKey)}>
                {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
        </div>
        <div className="form-row">
          <label className="form-label">
            Base URL
            <input className="form-input" type="text" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} placeholder="请输入 API 地址，如 https://api.openai.com/v1" required />
          </label>
        </div>

      </form>
    </Modal>
  );
}

// 管理员提示词配置弹窗组件（单个节点）
export function AdminPromptModal({
  open,
  onClose,
  configName,
  prompt,
  loading,
  onSave,
  onPromptChange,
  currentVersion,
  versions,
  testing,
  onTest,
  onRollback,
}: {
  open: boolean;
  onClose: () => void;
  configName: string;
  prompt: string;
  loading: boolean;
  onSave: () => void;
  onPromptChange: (prompt: string) => void;
  currentVersion?: number | null;
  versions: Array<{ id: string; version: number; prompt: string; status: string; createdAt?: string | null }>;
  testing: boolean;
  onTest: () => void;
  onRollback: (versionId: string) => void;
}) {
  const promptDirty = useUnsavedChanges();

  return (
    <Modal
      open={open}
      onClose={() => promptDirty.requestClose(onClose)}
      title={`配置提示词 - ${configName}`}
      width={980}
      height="80vh"
      flushTop
      bodyOverflow="hidden"
      footer={<>
        <button className="ghost-button" type="button" onClick={onTest} disabled={loading || testing} style={{ marginRight: "auto" }}>
          {testing ? <Loader2 size={16} className="animate-spin" /> : <TestTube size={16} />}
          测试提示词
        </button>
        <button className="ghost-button" type="button" onClick={() => promptDirty.requestClose(onClose)}>取消</button>
        <button className="primary-button" type="button" onClick={() => { promptDirty.markClean(); onSave(); }} disabled={loading}>
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          发布新版本
        </button>
      </>}
    >
      {loading ? (
        <div style={{ textAlign: "center", padding: 40 }}>
          <Loader2 size={24} className="animate-spin" />
          <p style={{ marginTop: 8, color: "var(--muted)" }}>加载中...</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 16, height: "100%", minHeight: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0, minHeight: 0 }}>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, flexShrink: 0 }}>
              配置「{configName}」节点的全局提示词。普通用户无法查看或修改，AI 运行时只读取当前已发布版本。
              {currentVersion ? ` 当前版本：v${currentVersion}` : " 当前尚无正式版本。"}
            </p>
            <textarea
              className="form-textarea"
              value={prompt}
              onChange={(e) => { onPromptChange(e.target.value); promptDirty.markDirty(); }}
              placeholder={`请输入${configName}的系统提示词...`}
              required
              style={{ fontFamily: "var(--font-mono)", fontSize: 12, lineHeight: 1.6, flex: 1, minHeight: 0, overflow: "auto", padding: "12px" }}
            />
          </div>
          <aside className="work-panel" style={{ padding: 12, minHeight: 0, overflow: "auto" }}>
            <div style={{ fontWeight: 600, marginBottom: 10 }}>版本历史</div>
            {versions.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>暂无版本记录</div>
            ) : versions.map((item) => (
              <div key={item.id} style={{ borderBottom: "1px solid var(--border)", padding: "10px 0", display: "grid", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                  <span style={{ fontWeight: 600 }}>v{item.version}</span>
                  <span style={{ fontSize: 12, color: item.status === "published" ? "var(--success)" : "var(--muted)" }}>
                    {item.status === "published" ? "当前发布" : item.status === "draft" ? "草稿" : "历史版本"}
                  </span>
                </div>
                <div title={item.prompt} style={{ color: "var(--muted)", fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {item.prompt}
                </div>
                {item.status !== "published" && (
                  <button className="text-button" type="button" onClick={() => onRollback(item.id)} style={{ justifySelf: "start" }}>
                    <RotateCcw size={13} /> 回滚到此版本
                  </button>
                )}
              </div>
            ))}
          </aside>
        </div>
      )}
      {promptDirty.confirmDialog}
    </Modal>
  );
}
