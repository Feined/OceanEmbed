from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from data.observations import generate_observations
from services.location_service import (
    build_location_response,
    build_profile_response,
    classify_environment,
    ocean_region_name,
    approximate_bathymetry,
)
from services.netcdf_service import VARIABLES, get_ocean_service

app = FastAPI(title="OceanEmbed API", version="0.3.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"project": "OceanEmbed", "status": "running", "version": "0.3.0"}


# ---------------------------------------------------------------------------
# Metadata
# ---------------------------------------------------------------------------

@app.get("/api/ocean/metadata")
@app.get("/ocean/metadata")
def ocean_metadata() -> dict[str, Any]:
    service = get_ocean_service()
    metadata = service.metadata()
    if metadata.get("source") == "synthetic" and metadata.get("dataset_status") == "missing":
        metadata["message"] = (
            "No NetCDF dataset detected. "
            "Set OCEAN_NETCDF or place a file at backend/data/ocean.nc to enable real model data."
        )
    return metadata


# ---------------------------------------------------------------------------
# Field (2D slice of a variable at a given depth + time)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Location analysis (new — point query)
# ---------------------------------------------------------------------------

@app.get("/api/location")
def location_analysis(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Latitude"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Longitude"),
    depth: float = Query(0.0, ge=0.0, description="Target depth in metres"),
    time: int = Query(0, ge=0, description="Time index"),
) -> dict[str, Any]:
    """
    Resolve a geographic coordinate to land/ocean classification and,
    if within the OceanEmbed dataset coverage, return oceanographic variable
    values at the nearest grid cell.
    """
    service = get_ocean_service()
    try:
        return build_location_response(lat, lon, depth, time, service)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Vertical water-column profile (new)
# ---------------------------------------------------------------------------

@app.get("/api/profile")
def vertical_profile(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
    time: int = Query(0, ge=0),
) -> dict[str, Any]:
    """
    Return temperature and salinity at all available depth levels for the
    nearest grid cell to the requested coordinate.
    """
    service = get_ocean_service()
    try:
        return build_profile_response(lat, lon, time, service)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Existing profile (single variable, NetCDF only)
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Bathymetry (new)
# ---------------------------------------------------------------------------

@app.get("/api/bathymetry")
def bathymetry(
    lat: float = Query(..., ge=-90.0, le=90.0),
    lon: float = Query(..., ge=-180.0, le=180.0),
) -> dict[str, Any]:
    """
    Return approximate seafloor depth for an ocean coordinate.
    Clearly labelled as APPROXIMATE_SYNTHETIC when no real dataset is loaded.
    """
    env = classify_environment(lat, lon)
    if env == "land":
        return {
            "latitude": lat,
            "longitude": lon,
            "environment": "land",
            "seafloor_depth_m": None,
            "source": "N/A",
        }
    depth = approximate_bathymetry(lat, lon)
    return {
        "latitude": lat,
        "longitude": lon,
        "environment": "ocean",
        "region": ocean_region_name(lat, lon),
        "seafloor_depth_m": depth,
        "source": "APPROXIMATE_SYNTHETIC",
        "note": "Parametric approximation only. For accurate bathymetry, integrate GEBCO dataset.",
    }


# ---------------------------------------------------------------------------
# Observations
# ---------------------------------------------------------------------------

@app.get("/api/observations")
@app.get("/observations")
def observations(time_index: int = Query(0, ge=0)) -> dict[str, Any]:
    return {"observations": generate_observations(time_index)}


# ---------------------------------------------------------------------------
# Dataset source info
# ---------------------------------------------------------------------------

@app.get("/api/ocean/source")
@app.get("/ocean/source")
def ocean_source() -> dict[str, Any]:
    service = get_ocean_service()
    return {
        "mode": service.metadata().get("source", "synthetic"),
        "file": service.path,
        "metadata": service.metadata(),
    }
