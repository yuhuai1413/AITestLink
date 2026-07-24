const CLARIFICATION_PENDING = "待确认";
const CLARIFICATION_CONFIRMED = "已确认";
const CLARIFICATION_NOT_REQUIRED = "无需确认";
const VAGUE_ANSWER_PATTERNS = ["待确认", "后续确认", "后续补充", "看情况", "按实际", "用户提供", "客户提供", "暂不明确", "不确定", "待定", "todo", "TODO"];
const EXPLICIT_CONCLUSION_MARKERS = ["按", "以", "仅", "不再", "不纳入", "不包含", "统一", "采用", "使用", "归属", "范围", "口径", "处理", "执行", "确认", "纳入", "排除", "开放", "关闭"];

function hasRealClarificationQuestion(question?: string) {
  const parts = questionParts(question);
  if (parts.length === 0) return false;
  const emptyValues = new Set(["无", "暂无", "无。", "暂无。", "无待确认问题", "无待确认问题。"]);
  return parts.some((part) => !emptyValues.has(part) && !part.startsWith("【辅助文档信息】") && !part.startsWith("辅助文档信息"));
}

function questionParts(question?: string) {
  return (question || "")
    .split(/[\n；;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function clarificationAnswerQualityIssues(question?: string, answer?: string) {
  const emptyValues = new Set(["无", "暂无", "无。", "暂无。", "无待确认问题", "无待确认问题。"]);
  const realQuestions = questionParts(question).filter((part) => !emptyValues.has(part) && !part.startsWith("【辅助文档信息】") && !part.startsWith("辅助文档信息"));
  if (realQuestions.length === 0) return [];
  const normalizedAnswer = (answer || "").trim();
  if (!normalizedAnswer) return ["确认结论为空，请逐条回答待确认问题"];
  const loweredAnswer = normalizedAnswer.toLowerCase();
  const vagueHits = VAGUE_ANSWER_PATTERNS.filter((token) => loweredAnswer.includes(token.toLowerCase()));
  if (vagueHits.length > 0) return [`确认结论仍包含不明确表述：${vagueHits.slice(0, 3).join("、")}`];
  const compactAnswer = normalizedAnswer.replace(/\s+/g, "");
  if (compactAnswer.length < Math.max(12, realQuestions.length * 8)) return ["确认结论过短，无法判断是否已回答清楚待确认问题"];
  const hasExplicitConclusion = EXPLICIT_CONCLUSION_MARKERS.some((marker) => normalizedAnswer.includes(marker));
  if (!hasExplicitConclusion && !/[。！？.!?；;\n]/.test(normalizedAnswer)) return ["确认结论缺少明确表述，请补充结论范围或判断口径"];
  const numberedAnswer = /(^|[\n；;])\s*(\d+|[一二三四五六七八九十]+)[、.．)]/.test(normalizedAnswer);
  if (realQuestions.length >= 2 && !numberedAnswer && compactAnswer.length < realQuestions.length * 16) return ["存在多条待确认问题，请在确认结论中逐条说明"];
  return [];
}

function isClarificationAnswerSufficient(question?: string, answer?: string) {
  return clarificationAnswerQualityIssues(question, answer).length === 0;
}

function getClarificationStatus(item: { question?: string; clarificationAnswer?: string; clarificationStatus?: string; confirmed?: boolean } | null | undefined) {
  if (!item) return CLARIFICATION_NOT_REQUIRED;
  const explicitStatus = (item.clarificationStatus || "").trim();
  if (explicitStatus === CLARIFICATION_CONFIRMED) {
    return isClarificationAnswerSufficient(item.question, item.clarificationAnswer) ? CLARIFICATION_CONFIRMED : CLARIFICATION_PENDING;
  }
  if (explicitStatus === CLARIFICATION_NOT_REQUIRED || explicitStatus === CLARIFICATION_PENDING) {
    return explicitStatus;
  }
  if (!hasRealClarificationQuestion(item.question)) return CLARIFICATION_NOT_REQUIRED;
  if (isClarificationAnswerSufficient(item.question, item.clarificationAnswer) || item.confirmed) return CLARIFICATION_CONFIRMED;
  return CLARIFICATION_PENDING;
}

function isClarificationResolved(item: { question?: string; clarificationAnswer?: string; clarificationStatus?: string; confirmed?: boolean } | null | undefined) {
  const status = getClarificationStatus(item);
  return status === CLARIFICATION_CONFIRMED || status === CLARIFICATION_NOT_REQUIRED;
}

export {
  CLARIFICATION_CONFIRMED,
  CLARIFICATION_NOT_REQUIRED,
  CLARIFICATION_PENDING,
  clarificationAnswerQualityIssues,
  getClarificationStatus,
  hasRealClarificationQuestion,
  isClarificationAnswerSufficient,
  isClarificationResolved,
};
