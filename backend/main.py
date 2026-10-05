from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data.observations import generate_observations
from services.netcdf_service import VARIABLES, get_ocean_service

app = FastAPI(title="OceanEmbed API", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"project": "OceanEmbed", "status": "running", "version": "0.2.0"}


@app.get("/api/ocean/metadata")
@app.get("/ocean/metadata")
def ocean_metadata() -> dict[str, Any]:
    service = get_ocean_service()
    metadata = service.metadata()
    if metadata.get("source") == "synthetic" and metadata.get("dataset_status") == "missing":
        metadata["message"] = "No NetCDF dataset detected. Set OCEAN_NETCDF or place a file at backend/data/ocean.nc to enable real model data."
    return metadata


@app.get("/api/ocean/profile")
@app.get("/ocean/profile")
def ocean_profile(
    latitude: float = Query(..., ge=-90.0, le=90.0),
    longitude: float = Query(..., ge=-180.0, le=180.0),
    variable: str = Query("temperature"),
) -> dict[str, Any]:
    service = get_ocean_service()
    try:
        return service.profile(variable, latitude, longitude)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/ocean/field")
@app.get("/ocean/field")
def ocean_field(
    variable: str = Query("temperature"),
    time: int = Query(0, ge=0),
    depth: int | None = Query(default=None, ge=0),
    time_index: int | None = Query(default=None, ge=0),
) -> dict[str, Any]:
    time_value = time_index if time_index is not None else time
    service = get_ocean_service()
    try:
        field_data = service.field(variable=variable, time_index=time_value, depth_index=depth)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    field_data["label"] = VARIABLES.get(variable, {}).get("label", variable)
    field_data["unit"] = VARIABLES.get(variable, {}).get("unit", "")
    field_data["source"] = service.metadata().get("source", "synthetic")
    return field_data


@app.get("/api/ocean/source")
@app.get("/ocean/source")
def ocean_source() -> dict[str, Any]:
    service = get_ocean_service()
    return {
        "mode": service.metadata().get("source", "synthetic"),
        "file": service.path,
        "metadata": service.metadata(),
    }


@app.get("/api/observations")
@app.get("/observations")
def observations(time_index: int = Query(0, ge=0)) -> dict[str, Any]:
    return {"observations": generate_observations(time_index)}
