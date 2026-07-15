from typing import Annotated, Optional

from pydantic import BaseModel, Field


class ProjectCreate(BaseModel):
    name: str
    test_type: Annotated[str, Field(alias="testType")]
    test_status: Annotated[str, Field(alias="testStatus")] = "待测试"
    doc_status: Annotated[str, Field(alias="docStatus")] = "待解析"
    priority: str = "中"
    description: str = ""

    model_config = {"populate_by_name": True}


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    test_type: Annotated[Optional[str], Field(alias="testType")] = None
    test_status: Annotated[Optional[str], Field(alias="testStatus")] = None
    doc_status: Annotated[Optional[str], Field(alias="docStatus")] = None
    priority: Optional[str] = None
    description: Optional[str] = None

    model_config = {"populate_by_name": True}
