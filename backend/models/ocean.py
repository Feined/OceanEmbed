from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class OceanFieldRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    variable: str = Field(default="temperature")
    time: int = Field(default=0, ge=0)
    depth: int | None = Field(default=None, ge=0)


class OceanMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    source: str
    dataset_status: str
    dataset_path: str | None = None
    available_variables: list[str]
    grid: dict[str, Any]
    latitude_range: list[float]
    longitude_range: list[float]
    depth_levels: list[float]
    time_steps: int
    time_range: dict[str, Any] | None = None
