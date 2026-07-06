from typing import Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    test_type: str = Field(alias="testType")
    test_status: str = Field(default="待测试", alias="testStatus")
    doc_status: str = Field(default="待解析", alias="docStatus")
    priority: str = "中"
    description: str = ""

    model_config = {"populate_by_name": True}


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    test_type: Optional[str] = Field(default=None, alias="testType")
    test_status: Optional[str] = Field(default=None, alias="testStatus")
    doc_status: Optional[str] = Field(default=None, alias="docStatus")
    priority: Optional[str] = None
    description: Optional[str] = None

    model_config = {"populate_by_name": True}
