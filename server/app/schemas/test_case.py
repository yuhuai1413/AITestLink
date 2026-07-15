from typing import Annotated, Optional

from pydantic import BaseModel, Field


class TestCaseCreate(BaseModel):
    case_code: Annotated[str, Field(alias="caseCode")]
    module: str
    feature: str = ""
    title: str
    priority: str = "P1"
    precondition: str = ""
    steps: str = ""
    test_data: Annotated[str, Field(alias="testData")] = ""
    expected_result: Annotated[str, Field(alias="expectedResult")] = ""
    environment_id: Annotated[Optional[str], Field(alias="environmentId")] = None
    target_platform: Annotated[str, Field(alias="targetPlatform")] = "PC"
    test_url: Annotated[str, Field(alias="testUrl")] = ""
    required_role: Annotated[str, Field(alias="requiredRole")] = "无"
    automation: str = "待评估"
    review_status: Annotated[str, Field(alias="reviewStatus")] = "待评审"
    remark: str = ""
    test_point_id: Annotated[Optional[str], Field(alias="testPointId")] = None
    requirement_id: Annotated[Optional[str], Field(alias="requirementId")] = None

    model_config = {"populate_by_name": True}


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    precondition: Optional[str] = None
    steps: Optional[str] = None
    test_data: Annotated[Optional[str], Field(alias="testData")] = None
    expected_result: Annotated[Optional[str], Field(alias="expectedResult")] = None
    environment_id: Annotated[Optional[str], Field(alias="environmentId")] = None
    target_platform: Annotated[Optional[str], Field(alias="targetPlatform")] = None
    test_url: Annotated[Optional[str], Field(alias="testUrl")] = None
    required_role: Annotated[Optional[str], Field(alias="requiredRole")] = None
    automation: Optional[str] = None
    review_status: Annotated[Optional[str], Field(alias="reviewStatus")] = None
    remark: Optional[str] = None

    model_config = {"populate_by_name": True}
