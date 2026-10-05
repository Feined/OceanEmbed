"""
location_service.py
-------------------
Resolves a (lat, lon) coordinate to:
  - land / ocean classification
  - nearest grid cell in the OceanEmbed dataset (if within coverage)
  - oceanographic variable values at that cell for a given depth & time
  - approximate bathymetric depth

Land/ocean classification uses a coarse polygon test derived from natural-earth
bounding boxes. This is accurate enough to distinguish clearly open-ocean points
from major continental land masses without any external dependency. For the
scientific application the distinction is informational — data availability is
always determined by actual dataset coverage.
"""
from __future__ import annotations

import math
from typing import Any

import numpy as np

# ---------------------------------------------------------------------------
# Very coarse land bounding boxes (lon_min, lon_max, lat_min, lat_max).
# These are simplified continental + large-island boxes used only for the
# "is this approximately land?" check. They will produce false-positives
# near coastlines, which is acceptable — we always check dataset coverage
# independently.
# ---------------------------------------------------------------------------
_LAND_BOXES: list[tuple[float, float, float, float]] = [
    # North America
    (-168, -52, 15, 72),
    # Central America / Caribbean (rough)
    (-92, -60, 10, 25),
    # Greenland
    (-73, -15, 59, 84),
    # South America
    (-82, -34, -56, 13),
    # Europe
    (-25, 45, 36, 71),
    # Scandinavia extra
    (5, 32, 56, 71),
    # Africa — North & West Africa (north of Gulf of Guinea)
    (-18, 52, 4.5, 38),
    # Africa — Central & Southern Africa (east of Gulf of Guinea)
    (8.5, 52, -35, 4.5),
    # Madagascar
    (43, 51, -26, -12),
    # Middle East / Arabian Peninsula
    (32, 60, 12, 35),
    # South Asia (North India, Pakistan, Nepal: lat >= 23°N)
    (66, 92, 23, 36),
    # South Asia (Central / West India: lat 18–23°N, includes Mumbai at 72.8°E)
    (72.7, 88, 18, 23),
    # South Asia (Peninsular India: lat 8–18°N, west coast ~74°E)
    (74.0, 85, 8, 18),
    # Russia / Siberia
    (26, 190, 50, 78),
    # China / East Asia mainland
    (73, 135, 18, 55),
    # Southeast Asia mainland
    (92, 109, 8, 28),
    # Australia
    (113, 154, -39, -10),
    # New Zealand (approx)
    (166, 178, -47, -34),
    # Japan (Honshu)
    (129, 146, 30, 46),
    # British Isles
    (-11, 2, 50, 61),
    # Iceland
    (-24, -13, 63, 67),
    # Antarctic
    (-180, 180, -90, -62),
    # Alaska
    (-170, -130, 54, 72),
    # Philippines (rough)
    (116, 127, 5, 20),
    # Indonesia / Borneo
    (95, 142, -10, 6),
    # Sri Lanka
    (80, 82, 6, 10),
    # Taiwan
    (120, 122, 22, 25),
]


def _in_land_box(lat: float, lon: float) -> bool:
    """Return True if (lat, lon) falls inside any coarse land bounding box."""
    # Normalise longitude to [-180, 180]
    lon = ((lon + 180) % 360) - 180
    for lon_min, lon_max, lat_min, lat_max in _LAND_BOXES:
        if lon_min <= lon <= lon_max and lat_min <= lat <= lat_max:
            return True
    return False


def classify_environment(lat: float, lon: float) -> str:
    """
    Classify a coordinate as 'ocean' or 'land'.
    Returns 'ocean' when clearly in open ocean, 'land' otherwise.
    This is a coarse approximation; coastline accuracy is ±few degrees.
    """
    if lat < -90 or lat > 90:
        return "invalid"
    if lon < -180 or lon > 180:
        return "invalid"
    return "land" if _in_land_box(lat, lon) else "ocean"


def ocean_region_name(lat: float, lon: float) -> str:
    """Return a human-readable ocean/sea region name for open-ocean coordinates."""
    # Very rough classification by bounding boxes
    if lat > 66.5:
        return "Arctic Ocean"
    if lat < -60:
        return "Southern Ocean"
    if -60 <= lat <= 0 and -70 <= lon <= 20:
        return "South Atlantic Ocean"
    if 0 <= lat <= 66.5 and -80 <= lon <= 0:
        return "North Atlantic Ocean"
    if -60 <= lat <= 0 and -180 <= lon <= -70:
        return "South Pacific Ocean"
    if 0 <= lat <= 66.5 and (-180 <= lon <= -80 or lon >= 130):
        return "North Pacific Ocean"
    if -60 <= lat <= 30 and 20 <= lon <= 110:
        return "Indian Ocean"
    if 20 <= lat <= 30 and 45 <= lon <= 78:
        return "Arabian Sea"
    if 5 <= lat <= 22 and 78 <= lon <= 100:
        return "Bay of Bengal"
    if 10 <= lat <= 30 and 32 <= lon <= 45:
        return "Red Sea"
    if 22 <= lat <= 42 and -5 <= lon <= 42:
        return "Mediterranean Sea"
    if 25 <= lat <= 66.5 and 28 <= lon <= 65:
        return "Indian Ocean / Persian Gulf region"
    return "Open Ocean"


def approximate_bathymetry(lat: float, lon: float) -> float | None:
    """
    Return an approximate seafloor depth (negative metres) for ocean points
    using a simple parametric model derived from global ocean topography patterns.

    This is NOT real GEBCO data. It is a smooth approximation used only when no
    real bathymetric dataset is available. The UI must label it clearly as
    APPROXIMATE / SYNTHETIC.

    Returns None for land points.
    """
    env = classify_environment(lat, lon)
    if env == "land":
        return None

    # Distance from equator (normalised)
    abs_lat = abs(lat) / 90.0

    # Base depth increases toward mid-ocean ridges and varies by ocean
    # Values are negative (depth below sea level)
    # Parametric ocean ridge / trench pattern
    ridge_depth = -2500 - 1500 * math.sin(math.radians(abs(lon) * 0.8 + lat * 0.5))
    base = -3800 + ridge_depth * 0.15

    # Shallow shelves near coasts (very rough)
    shelf_factor = 1.0
    # Simple distance-from-land heuristic: already classified as ocean,
    # so this is minimal without a distance transform.
    depth = base * (0.85 + 0.15 * abs_lat)
    # Clamp to realistic range
    return float(max(-11000, min(-50, depth)))


def nearest_grid_cell(
    lat: float,
    lon: float,
    lat_grid: np.ndarray,
    lon_grid: np.ndarray,
) -> tuple[int, int] | None:
    """
    Find the nearest grid cell (row, col) to (lat, lon).
    Returns None if the grid is empty or coordinate is out of grid bounds.
    """
    if lat_grid.size == 0:
        return None

    dist = np.abs(lat_grid - lat) + np.abs(lon_grid - lon)
    idx = int(np.argmin(dist))
    row, col = np.unravel_index(idx, lat_grid.shape)

    # Check coverage: nearest cell must be within ~5 degrees
    min_dist = float(dist.flat[idx])
    if min_dist > 10:  # clearly outside dataset coverage
        return None

    return int(row), int(col)


def build_location_response(
    lat: float,
    lon: float,
    depth_m: float,
    time_index: int,
    service: Any,  # NetCDFOceanService
) -> dict[str, Any]:
    """
    Build a complete location analysis response for a given coordinate.
    """
    env = classify_environment(lat, lon)
    region = ocean_region_name(lat, lon) if env == "ocean" else "Land"

    response: dict[str, Any] = {
        "latitude": round(lat, 5),
        "longitude": round(lon, 5),
        "environment": env,
        "region": region,
        "requested_depth_m": depth_m,
        "time_index": time_index,
    }

    if env == "land":
        response["message"] = (
            "Geographic location is on land. "
            "Oceanographic water-column variables are not available at this point."
        )
        response["dataset_coverage"] = False
        return response

    # Bathymetry
    bathy = approximate_bathymetry(lat, lon)
    response["bathymetry_m"] = bathy
    response["bathymetry_source"] = "APPROXIMATE_SYNTHETIC"

    # Check dataset coverage
    meta = service.metadata()
    lat_range = meta.get("latitude_range", [5, 30])
    lon_range = meta.get("longitude_range", [45, 105])
    within_coverage = (
        lat_range[0] <= lat <= lat_range[1]
        and lon_range[0] <= lon <= lon_range[1]
    )
    response["dataset_coverage"] = within_coverage
    response["dataset_lat_range"] = lat_range
    response["dataset_lon_range"] = lon_range

    if not within_coverage:
        response["message"] = (
            f"Global geographic location available. "
            f"OceanEmbed scientific dataset unavailable at this location. "
            f"Dataset covers {lat_range[0]}–{lat_range[1]}°N, "
            f"{lon_range[0]}–{lon_range[1]}°E."
        )
        return response

    # Find nearest grid cell
    from services.netcdf_service import get_ocean_service  # avoid circular at module level
    svc = service
    lat_grid, lon_grid = svc._grid_from_coordinates()
    cell = nearest_grid_cell(lat, lon, lat_grid, lon_grid)
    if cell is None:
        response["message"] = "Coordinate is outside dataset grid."
        response["dataset_coverage"] = False
        return response

    row, col = cell
    grid_lat = float(lat_grid[row, col])
    grid_lon = float(lon_grid[row, col])
    response["nearest_grid_cell"] = {"row": row, "col": col, "lat": grid_lat, "lon": grid_lon}

    # Depth levels
    from data.field import DEPTHS as SYNTH_DEPTHS
    depth_levels = meta.get("depth_levels", SYNTH_DEPTHS.tolist())
    depth_arr = np.asarray(depth_levels, dtype=float)

    # Find nearest depth index
    depth_idx = int(np.argmin(np.abs(depth_arr - depth_m)))
    actual_depth = float(depth_arr[depth_idx])
    response["depth_index"] = depth_idx
    response["actual_depth_m"] = actual_depth

    # Fetch variable values at this cell
    variables: dict[str, Any] = {}
    for var_name in ["temperature", "salinity"]:
        try:
            field_data = svc.field(variable=var_name, time_index=time_index, depth_index=depth_idx)
            flat_values = np.asarray(field_data["values"], dtype=float).reshape(-1)
            n_cols = lat_grid.shape[1]
            cell_idx = row * n_cols + col
            if cell_idx < len(flat_values):
                val = float(flat_values[cell_idx])
                variables[var_name] = {
                    "value": round(val, 3),
                    "unit": "°C" if var_name == "temperature" else "PSU",
                    "depth_m": actual_depth,
                    "source": meta.get("source", "synthetic").upper(),
                    "available": True,
                }
            else:
                variables[var_name] = {"available": False, "reason": "Index out of range"}
        except Exception as exc:
            variables[var_name] = {"available": False, "reason": str(exc)}

    response["variables"] = variables
    response["source"] = meta.get("source", "synthetic")
    response["message"] = "Location resolved within OceanEmbed dataset coverage."
    return response


def build_profile_response(
    lat: float,
    lon: float,
    time_index: int,
    service: Any,
) -> dict[str, Any]:
    """
    Build a vertical profile response (all depths) for a given ocean coordinate.
    """
    env = classify_environment(lat, lon)
    if env == "land":
        return {
            "latitude": lat,
            "longitude": lon,
            "environment": "land",
            "available": False,
            "reason": "Location is on land — no water column profile.",
        }

    meta = service.metadata()
    lat_range = meta.get("latitude_range", [5, 30])
    lon_range = meta.get("longitude_range", [45, 105])
    within_coverage = (
        lat_range[0] <= lat <= lat_range[1]
        and lon_range[0] <= lon <= lon_range[1]
    )

    if not within_coverage:
        return {
            "latitude": lat,
            "longitude": lon,
            "environment": "ocean",
            "available": False,
            "reason": (
                f"OceanEmbed dataset does not cover this location. "
                f"Coverage: {lat_range[0]}–{lat_range[1]}°N, "
                f"{lon_range[0]}–{lon_range[1]}°E."
            ),
        }

    lat_grid, lon_grid = service._grid_from_coordinates()
    cell = nearest_grid_cell(lat, lon, lat_grid, lon_grid)
    if cell is None:
        return {
            "latitude": lat,
            "longitude": lon,
            "environment": "ocean",
            "available": False,
            "reason": "Coordinate is outside dataset grid.",
        }

    row, col = cell
    depth_levels = meta.get("depth_levels", [])
    depth_arr = np.asarray(depth_levels, dtype=float)

    profile_vars: dict[str, list[float]] = {}
    for var_name in ["temperature", "salinity"]:
        depths_out = []
        values_out = []
        for depth_idx, depth_m in enumerate(depth_arr):
            try:
                field_data = service.field(variable=var_name, time_index=time_index, depth_index=depth_idx)
                flat_values = np.asarray(field_data["values"], dtype=float).reshape(-1)
                n_cols = lat_grid.shape[1]
                cell_idx = row * n_cols + col
                if cell_idx < len(flat_values):
                    val = float(flat_values[cell_idx])
                    if not math.isnan(val):
                        depths_out.append(float(depth_m))
                        values_out.append(round(val, 3))
            except Exception:
                continue
        if depths_out:
            profile_vars[var_name] = {"depths": depths_out, "values": values_out}

    return {
        "latitude": lat,
        "longitude": lon,
        "environment": "ocean",
        "available": True,
        "nearest_grid_lat": float(lat_grid[row, col]),
        "nearest_grid_lon": float(lon_grid[row, col]),
        "source": meta.get("source", "synthetic").upper(),
        "time_index": time_index,
        "profile": profile_vars,
        "depth_levels": depth_arr.tolist(),
    }
