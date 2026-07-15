"""AI 结构化结果契约。

所有会写入业务表的 AI JSON 必须先经过这里验证，避免提示词或模型变化
产生缺字段、错字段或错误类型的数据。
"""

from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator


class _AIOutputBase(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True, populate_by_name=True)


def _required_text(value: Any) -> str:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("不能为空且必须是字符串")
    return value.strip()


class RequirementOutput(_AIOutputBase):
    module: str
    feature: str
    source: str = ""
    risk: Literal["高", "中", "低"] = "中"
    rule: str = ""
    question: str = ""

    _module_required = field_validator("module", mode="before")(_required_text)
    _feature_required = field_validator("feature", mode="before")(_required_text)


class TestPointOutput(_AIOutputBase):
    requirementId: str
    module: str
    type: str
    title: str
    description: str = ""
    priority: Literal["P0", "P1", "P2", "P3"] = "P1"
    automatable: bool = False

    _module_required = field_validator("module", mode="before")(_required_text)
    _type_required = field_validator("type", mode="before")(_required_text)
    _title_required = field_validator("title", mode="before")(_required_text)
    _requirement_required = field_validator("requirementId", mode="before")(_required_text)

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: Any) -> Any:
        return value.upper() if isinstance(value, str) else value

    @field_validator("automatable", mode="before")
    @classmethod
    def normalize_automatable(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"是", "适合", "true", "yes", "1"}:
                return True
            if normalized in {"否", "不适合", "false", "no", "0", ""}:
                return False
        return value


class TestCaseOutput(_AIOutputBase):
    testPointId: str = Field(
        validation_alias=AliasChoices("testPointId", "tpId", "tp_id"),
        serialization_alias="testPointId",
    )
    module: str
    feature: str = ""
    title: str
    priority: Literal["P0", "P1", "P2", "P3"] = "P1"
    precondition: str = ""
    steps: str = ""
    testData: Any = ""
    expectedResult: str = ""
    testType: str = "功能测试"
    environmentId: str
    targetPlatform: Literal["PC", "APP"]
    testUrl: str
    requiredRole: str
    automation: bool = False

    _module_required = field_validator("module", mode="before")(_required_text)
    _title_required = field_validator("title", mode="before")(_required_text)
    _test_point_required = field_validator("testPointId", mode="before")(_required_text)
    _environment_required = field_validator("environmentId", mode="before")(_required_text)
    _test_url_required = field_validator("testUrl", mode="before")(_required_text)
    _role_required = field_validator("requiredRole", mode="before")(_required_text)

    @field_validator("priority", mode="before")
    @classmethod
    def normalize_priority(cls, value: Any) -> Any:
        return value.upper() if isinstance(value, str) else value

    @field_validator("steps", "expectedResult", mode="before")
    @classmethod
    def normalize_text_or_list(cls, value: Any) -> str:
        if isinstance(value, list):
            return "\n".join(str(item) for item in value)
        if value is None:
            return ""
        return str(value)

    @field_validator("automation", mode="before")
    @classmethod
    def normalize_automation(cls, value: Any) -> Any:
        if isinstance(value, str):
            normalized = value.strip().lower()
            if normalized in {"是", "适合", "true", "yes", "1"}:
                return True
            if normalized in {"否", "不适合", "false", "no", "0", "", "待评估"}:
                return False
        return value


class AutomationScriptOutput(_AIOutputBase):
    testCaseId: str
    scriptType: str = "UI"
    framework: str = "Playwright"
    language: str = "Python"
    code: str

    _code_required = field_validator("code", mode="before")(_required_text)
    _test_case_required = field_validator("testCaseId", mode="before")(_required_text)


class ExecutionReportOutput(_AIOutputBase):
    class Summary(_AIOutputBase):
        total: int = Field(ge=0)
        passed: int = Field(ge=0)
        failed: int = Field(ge=0)
        timeout: int = Field(default=0, ge=0)
        skipped: int = Field(default=0, ge=0)

    class Detail(_AIOutputBase):
        scriptId: str
        testCaseId: str
        environmentId: str
        status: Literal["passed", "failed", "timeout", "skipped"]
        durationSeconds: float = Field(default=0, ge=0)
        failureType: Literal["无", "应用缺陷", "脚本问题", "环境问题", "测试数据问题", "待确认"] = "无"
        errorInfo: str = ""
        evidence: str = ""

        _script_required = field_validator("scriptId", mode="before")(_required_text)
        _case_required = field_validator("testCaseId", mode="before")(_required_text)
        _environment_required = field_validator("environmentId", mode="before")(_required_text)

    class Defect(_AIOutputBase):
        testCaseId: str
        severity: Literal["P0", "P1", "P2", "P3"]
        title: str
        evidence: str
        expected: str
        actual: str

        _case_required = field_validator("testCaseId", mode="before")(_required_text)
        _title_required = field_validator("title", mode="before")(_required_text)
        _evidence_required = field_validator("evidence", mode="before")(_required_text)

    summary: Summary
    executionDetails: list[Detail]
    defects: list[Defect] = Field(default_factory=list)
    scriptIssues: list[str] = Field(default_factory=list)
    environmentIssues: list[str] = Field(default_factory=list)
    recommendations: list[str] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_statistics_and_references(self):
        counts = {status: 0 for status in ("passed", "failed", "timeout", "skipped")}
        case_ids = set()
        for detail in self.executionDetails:
            counts[detail.status] += 1
            case_ids.add(detail.testCaseId)
        expected_total = len(self.executionDetails)
        if self.summary.total != expected_total:
            raise ValueError("summary.total 必须等于 executionDetails 数量")
        for status, count in counts.items():
            if getattr(self.summary, status) != count:
                raise ValueError(f"summary.{status} 与 executionDetails 统计不一致")
        unknown_defects = {item.testCaseId for item in self.defects} - case_ids
        if unknown_defects:
            raise ValueError("defects 包含 executionDetails 中不存在的 testCaseId")
        return self


class GeneratedDocumentOutput(_AIOutputBase):
    title: str
    content: str
    documentType: str = "测试文档"
    metadata: dict[str, Any] = Field(default_factory=dict)

    _title_required = field_validator("title", mode="before")(_required_text)
    _content_required = field_validator("content", mode="before")(_required_text)


OUTPUT_SCHEMAS: dict[str, type[_AIOutputBase]] = {
    "需求解析": RequirementOutput,
    "测试点生成": TestPointOutput,
    "用例生成": TestCaseOutput,
    "脚本生成": AutomationScriptOutput,
    "执行脚本": ExecutionReportOutput,
    "文档生成": GeneratedDocumentOutput,
}

SINGLE_OBJECT_TASKS = {"执行脚本", "文档生成"}


def extract_ai_items(data: Any) -> list[dict[str, Any]]:
    """兼容模型常见的 `{key: [...]}` 包装，但不猜测字段内容。"""
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        list_values = [value for value in data.values() if isinstance(value, list)]
        if len(list_values) == 1:
            return list_values[0]
        return [data]
    raise ValueError("AI 返回结果必须是 JSON 对象或数组")


def validate_ai_output(task_type: str, data: Any) -> list[dict[str, Any]]:
    schema = OUTPUT_SCHEMAS.get(task_type)
    if schema is None:
        raise ValueError(f"不支持的 AI 任务类型：{task_type}")

    items = [data] if task_type in SINGLE_OBJECT_TASKS and isinstance(data, dict) else extract_ai_items(data)
    if not items:
        raise ValueError(f"{task_type}未返回任何数据")

    try:
        return [
            schema.model_validate(item).model_dump(by_alias=True)
            for item in items
        ]
    except ValidationError as exc:
        first_error = exc.errors()[0]
        field = ".".join(str(part) for part in first_error.get("loc", ())) or "结果"
        raise ValueError(
            f"{task_type}结果结构校验失败：字段 {field} {first_error.get('msg', '不合法')}"
        ) from exc


def validate_ai_object(task_type: str, data: Any) -> dict[str, Any]:
    if task_type not in SINGLE_OBJECT_TASKS:
        raise ValueError(f"{task_type}不是单对象输出任务")
    return validate_ai_output(task_type, data)[0]


def output_json_schema(task_type: str) -> dict[str, Any] | None:
    schema = OUTPUT_SCHEMAS.get(task_type)
    if schema is None:
        return None
    item_schema = schema.model_json_schema(by_alias=True)
    if task_type in SINGLE_OBJECT_TASKS:
        return item_schema
    return {"type": "array", "items": item_schema, "minItems": 1}
