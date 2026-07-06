from typing import Optional

from pydantic import BaseModel, Field


class TestPointCreate(BaseModel):
    module: str
    type: str
    title: str
    description: str = ""
    priority: str = "P1"
    automatable: bool = False


class TestPointUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    priority: Optional[str] = None
    review_status: Optional[str] = Field(default=None, alias="reviewStatus")

    model_config = {"populate_by_name": True}
