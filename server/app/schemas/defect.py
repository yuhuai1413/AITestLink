from typing import Annotated, Optional

from pydantic import BaseModel, Field


class DefectCreate(BaseModel):
    title: str
    description: str = ""
    severity: str = "一般"
    priority: str = "P1"
    status: str = "新建"
    module: str = ""
    category: str = "功能缺陷"
    source: str = "手工"
    test_case_id: Annotated[Optional[str], Field(alias="testCaseId")] = None
    script_id: Annotated[Optional[str], Field(alias="scriptId")] = None
    execution_run_id: Annotated[Optional[str], Field(alias="executionRunId")] = None
    steps_to_reproduce: Annotated[str, Field(alias="stepsToReproduce")] = ""
    expected_result: Annotated[str, Field(alias="expectedResult")] = ""
    actual_result: Annotated[str, Field(alias="actualResult")] = ""
    environment_info: Annotated[str, Field(alias="environmentInfo")] = ""
    reporter: str = ""
    assignee: str = ""
    remark: str = ""
    screenshot_url: Annotated[str, Field(alias="screenshotUrl")] = ""

    model_config = {"populate_by_name": True}


class DefectUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    severity: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    module: Optional[str] = None
    category: Optional[str] = None
    source: Optional[str] = None
    test_case_id: Annotated[Optional[str], Field(alias="testCaseId")] = None
    script_id: Annotated[Optional[str], Field(alias="scriptId")] = None
    execution_run_id: Annotated[Optional[str], Field(alias="executionRunId")] = None
    steps_to_reproduce: Annotated[Optional[str], Field(alias="stepsToReproduce")] = None
    expected_result: Annotated[Optional[str], Field(alias="expectedResult")] = None
    actual_result: Annotated[Optional[str], Field(alias="actualResult")] = None
    environment_info: Annotated[Optional[str], Field(alias="environmentInfo")] = None
    reporter: Optional[str] = None
    assignee: Optional[str] = None
    remark: Optional[str] = None
    screenshot_url: Annotated[Optional[str], Field(alias="screenshotUrl")] = None

    model_config = {"populate_by_name": True}
