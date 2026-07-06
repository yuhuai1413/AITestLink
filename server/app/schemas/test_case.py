from typing import Optional

from pydantic import BaseModel, Field


class TestCaseCreate(BaseModel):
    case_code: str = Field(alias="caseCode")
    module: str
    feature: str = ""
    title: str
    priority: str = "P1"
    precondition: str = ""
    steps: str = ""
    test_data: str = Field(default="", alias="testData")
    expected_result: str = Field(default="", alias="expectedResult")
    automation: str = "待评估"
    review_status: str = Field(default="待评审", alias="reviewStatus")
    remark: str = ""
    test_point_id: Optional[str] = Field(default=None, alias="testPointId")
    requirement_id: Optional[str] = Field(default=None, alias="requirementId")

    model_config = {"populate_by_name": True}


class TestCaseUpdate(BaseModel):
    title: Optional[str] = None
    priority: Optional[str] = None
    precondition: Optional[str] = None
    steps: Optional[str] = None
    test_data: Optional[str] = Field(default=None, alias="testData")
    expected_result: Optional[str] = Field(default=None, alias="expectedResult")
    automation: Optional[str] = None
    review_status: Optional[str] = Field(default=None, alias="reviewStatus")
    remark: Optional[str] = None

    model_config = {"populate_by_name": True}
