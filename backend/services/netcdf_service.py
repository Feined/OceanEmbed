from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np

try:
    import xarray as xr
except ImportError:
    xr = None

from data.field import DEPTHS, generate_field
from data.synthetic import generate_data
from reconstruction.model import TemperatureReconstructor

VARIABLES = {
    "temperature": {"label": "Temperature", "unit": "°C"},
    "salinity": {"label": "Salinity", "unit": "PSU"},
    "current_u": {"label": "Current U", "unit": "m/s"},
    "current_v": {"label": "Current V", "unit": "m/s"},
    "current_speed": {"label": "Current Speed", "unit": "m/s"},
}

COMMON_DATASET_CANDIDATES = [
    "ocean.nc",
    "global_ocean.nc",
    "data/ocean.nc",
    "data/global_ocean.nc",
    "backend/data/ocean.nc",
    "backend/data/global_ocean.nc",
]


def _normalise_name(value: str) -> str:
    return str(value).strip().lower()


def _first_matching_name(names: list[str], aliases: list[str]) -> str | None:
    lookup = { _normalise_name(name): name for name in names }
    for alias in aliases:
        match = lookup.get(_normalise_name(alias))
        if match is not None:
            return match
    return None


def _as_float_list(values: Any) -> list[float]:
    arr = np.asarray(values, dtype=float)
    return [float(item) for item in arr.tolist()]


def _candidate_paths() -> list[str]:
    env_value = os.getenv("OCEAN_NETCDF")
    candidates: list[str] = []
    if env_value:
        candidates.append(env_value)

    repo_root = Path(__file__).resolve().parents[1]
    for relative in COMMON_DATASET_CANDIDATES:
        candidates.append(str(repo_root / relative))
    candidates.append(str(repo_root / "data" / "ocean.nc"))
    return candidates


def discover_dataset_path() -> str | None:
    seen: set[str] = set()
    for candidate in _candidate_paths():
        norm = os.path.abspath(candidate)
        if norm in seen:
            continue
        seen.add(norm)
        if os.path.isfile(norm):
            return norm
    return None


class NetCDFOceanService:
    def __init__(self, dataset_path: str | None = None):
        self.path = dataset_path or discover_dataset_path()
        self.dataset: xr.Dataset | None = None
        if self.path:
            self.dataset = self._open_dataset(self.path)

        self.lat_name = self._detect_coordinate(["latitude", "lat", "nav_lat", "y", "latitudes"])
        self.lon_name = self._detect_coordinate(["longitude", "lon", "nav_lon", "x", "longitudes"])
        self.depth_name = self._detect_coordinate(["depth", "deptht", "lev", "level", "z", "depths"])
        self.time_name = self._detect_coordinate(["time", "time_counter", "time_counter_bnds", "date", "t"])

        self.variable_names = {
            name: self._detect_variable(aliases) for name, aliases in {
                "temperature": ["temperature", "temp", "thetao", "water_temp", "sea_water_temperature"],
                "salinity": ["salinity", "so", "sss", "water_salinity", "sea_water_salinity"],
                "current_u": ["uo", "u", "eastward_sea_water_velocity", "water_u", "current_u"],
                "current_v": ["vo", "v", "northward_sea_water_velocity", "water_v", "current_v"],
            }.items()
        }

    @staticmethod
    def _open_dataset(path: str) -> Any:
        if xr is None:
            return None
        last_error: Exception | None = None
        for engine in ("netcdf4", "scipy", "h5netcdf"):
            try:
                return xr.open_dataset(path, engine=engine, decode_times=True, chunks={})
            except Exception as exc:  # pragma: no cover - fallback logic
                last_error = exc
        if last_error is not None:
            raise last_error
        return None

    def _detect_coordinate(self, aliases: list[str]) -> str | None:
        if self.dataset is None:
            return None
        names = list(self.dataset.coords) + list(self.dataset.dims)
        return _first_matching_name(names, aliases)

    def _detect_variable(self, aliases: list[str]) -> str | None:
        if self.dataset is None:
            return None
        return _first_matching_name(list(self.dataset.data_vars), aliases)

    def is_available(self) -> bool:
        return self.dataset is not None

    def _time_values(self) -> np.ndarray:
        if self.dataset is None or self.time_name is None:
            return np.array([0], dtype=int)
        values = np.asarray(self.dataset[self.time_name].values)
        if values.size == 0:
            return np.array([0], dtype=int)
        return values

    def _depth_values(self) -> np.ndarray:
        if self.dataset is None or self.depth_name is None:
            return np.asarray(DEPTHS, dtype=float)
        values = np.asarray(self.dataset[self.depth_name].values, dtype=float)
        return values.reshape(-1)

    def _latitude_values(self) -> np.ndarray:
        if self.dataset is None or self.lat_name is None:
            return np.linspace(5, 30, 12)
        return np.asarray(self.dataset[self.lat_name].values, dtype=float)

    def _longitude_values(self) -> np.ndarray:
        if self.dataset is None or self.lon_name is None:
            return np.linspace(45, 105, 20)
        return np.asarray(self.dataset[self.lon_name].values, dtype=float)

    def _grid_from_coordinates(self) -> tuple[np.ndarray, np.ndarray]:
        lat = self._latitude_values()
        lon = self._longitude_values()
        if lat.ndim == 1 and lon.ndim == 1:
            lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")
            return lat_grid, lon_grid
        if lat.ndim == 2 and lon.ndim == 2 and lat.shape == lon.shape:
            return lat, lon
        if lat.ndim == 1 and lon.ndim == 2:
            return np.broadcast_to(lat[:, None], lon.shape), lon
        if lat.ndim == 2 and lon.ndim == 1:
            return lat, np.broadcast_to(lon[None, :], lat.shape)
        return np.asarray(lat, dtype=float), np.asarray(lon, dtype=float)

    def _resolve_available_variables(self) -> list[str]:
        names = [name for name, value in self.variable_names.items() if value is not None]
        if not names:
            return ["temperature", "salinity", "current_u", "current_v", "current_speed"]
        return names

    def _validated_time_index(self, time_index: int | None, *, allow_default: bool = True) -> int:
        if self.dataset is None or self.time_name is None:
            return 0 if allow_default else max(time_index or 0, 0)

        limit = int(self.dataset.sizes.get(self.time_name, 1)) - 1
        if time_index is None:
            return 0
        if time_index < 0 or time_index > limit:
            raise ValueError(f"Invalid time index {time_index}. Valid range is 0..{limit}.")
        return time_index

    def _validated_depth_index(self, depth_index: int | None) -> int:
        if self.dataset is None or self.depth_name is None:
            return int(depth_index or 0)

        limit = int(self.dataset.sizes.get(self.depth_name, 1)) - 1
        if depth_index is None:
            return 0
        if depth_index < 0 or depth_index > limit:
            raise ValueError(f"Invalid depth index {depth_index}. Valid range is 0..{limit}.")
        return depth_index

    def _field_values(self, variable: str, time_index: int, depth_index: int | None) -> tuple[np.ndarray, np.ndarray]:
        if self.dataset is None:
            if variable == "current_speed":
                u = self.synthetic_field("current_u", time_index, depth_index)
                v = self.synthetic_field("current_v", time_index, depth_index)
                values = np.hypot(u, v)
            else:
                values = self.synthetic_field(variable, time_index, depth_index)
            lat, lon = self._grid_from_coordinates()
            return lat, values

        data_var = self.variable_names.get(variable)
        if data_var is None:
            raise ValueError(f"Unknown variable: {variable}")

        array = self.dataset[data_var]
        if self.time_name and self.time_name in array.dims:
            time_index = self._validated_time_index(time_index)
            array = array.isel({self.time_name: time_index})
        if self.depth_name and self.depth_name in array.dims:
            depth_index = self._validated_depth_index(depth_index)
            array = array.isel({self.depth_name: depth_index})

        if self.lat_name is not None and self.lat_name not in array.dims:
            # Some datasets carry latitude/longitude as coordinate variables on a 2D grid,
            # so a singleton reduction keeps the spatial fields intact.
            for dim in list(array.dims):
                if dim not in {self.lat_name, self.lon_name, self.depth_name, self.time_name} and array.sizes[dim] == 1:
                    array = array.isel({dim: 0})

        if self.lat_name and self.lon_name and self.lat_name in array.dims and self.lon_name in array.dims:
            arr = np.asarray(array.values, dtype=float)
            if arr.ndim == 1:
                arr = arr.reshape((self.dataset.sizes[self.lat_name], self.dataset.sizes[self.lon_name]))
            return self._grid_from_coordinates()[0], np.ma.filled(arr, np.nan)

        if self.lat_name not in array.dims or self.lon_name not in array.dims:
            raise ValueError(f"Variable '{variable}' is missing the required latitude/longitude dimensions.")

        arr = np.asarray(array.values, dtype=float)
        return self._grid_from_coordinates()[0], np.ma.filled(arr, np.nan)

    def synthetic_field(self, variable: str, time_index: int, depth_index: int | None = None):
        X, y = generate_data()
        model = TemperatureReconstructor()
        model.fit(X, y)
        lat, lon, features = generate_field(time_index=time_index)
        predictions = model.predict(features)
        sss = features[:, 1]
        u = features[:, 3]
        v = features[:, 4]
        values = None

        if variable == "temperature":
            values = predictions
        elif variable == "salinity":
            values = sss[:, None] + 0.7 * (1 - np.exp(-DEPTHS[None, :] / 550))
        elif variable == "current_u":
            values = u[:, None] * np.exp(-DEPTHS[None, :] / 850)
        elif variable == "current_v":
            values = v[:, None] * np.exp(-DEPTHS[None, :] / 850)
        elif variable == "current_speed":
            u_depth = u[:, None] * np.exp(-DEPTHS[None, :] / 850)
            v_depth = v[:, None] * np.exp(-DEPTHS[None, :] / 850)
            values = np.sqrt(u_depth ** 2 + v_depth ** 2)
        else:
            raise ValueError(f"Unknown variable: {variable}")

        if depth_index is not None and depth_index >= 0 and depth_index < values.shape[1]:
            return np.asarray(values[:, depth_index], dtype=float)
        return np.asarray(values, dtype=float)

    def metadata(self) -> dict[str, Any]:
        if self.dataset is None:
            lat = np.linspace(5, 30, 12)
            lon = np.linspace(45, 105, 20)
            return {
                "source": "synthetic",
                "dataset_status": "missing",
                "dataset_path": self.path,
                "available_variables": list(VARIABLES),
                "grid": {"rows": len(lat), "cols": len(lon), "depths": len(DEPTHS)},
                "latitude_range": [float(lat.min()), float(lat.max())],
                "longitude_range": [float(lon.min()), float(lon.max())],
                "depth_levels": _as_float_list(DEPTHS),
                "time_steps": 12,
                "time_range": {"start": 0, "end": 11},
                "variables": VARIABLES,
            }

        lat = self._latitude_values()
        lon = self._longitude_values()
        lat_grid, lon_grid = self._grid_from_coordinates()
        depth_values = self._depth_values()

        return {
            "source": "netcdf",
            "dataset_status": "ready",
            "dataset_path": self.path,
            "available_variables": self._resolve_available_variables(),
            "grid": {
                "rows": int(np.asarray(lat_grid).shape[0]),
                "cols": int(np.asarray(lon_grid).shape[1]),
                "depths": int(len(depth_values)),
            },
            "latitude_range": [float(np.nanmin(np.asarray(lat_grid))), float(np.nanmax(np.asarray(lat_grid)))],
            "longitude_range": [float(np.nanmin(np.asarray(lon_grid))), float(np.nanmax(np.asarray(lon_grid)))],
            "depth_levels": _as_float_list(depth_values),
            "time_steps": int(self._time_values().size),
            "time_range": {
                "start": 0,
                "end": int(self._time_values().size) - 1,
            },
            "variables": VARIABLES,
        }

    def field(self, variable: str, time_index: int = 0, depth_index: int | None = None) -> dict[str, Any]:
        if variable not in VARIABLES and self.dataset is None:
            raise ValueError(f"Unknown variable: {variable}")

        if self.dataset is None:
            lat, lon, _ = generate_field(time_index=time_index)
            values = self.synthetic_field(variable, time_index, depth_index)
            flat = np.asarray(values, dtype=float).reshape(-1)
            return {
                "variable": variable,
                "latitude": lat.tolist(),
                "longitude": lon.tolist(),
                "depths": _as_float_list(DEPTHS),
                "values": values.tolist() if depth_index is None else flat.tolist(),
                "min": float(np.nanmin(flat)),
                "max": float(np.nanmax(flat)),
                "time_index": int(time_index),
                "depth_index": int(depth_index or 0),
            }

        if variable not in VARIABLES:
            cleaned = variable.lower()
            if cleaned in {"currents", "current"}:
                variable = "current_speed"
            else:
                raise ValueError(f"Unknown variable: {variable}")

        lat_grid, lon_grid = self._grid_from_coordinates()
        arr = self.dataset[self.variable_names[variable]]
        if self.time_name and self.time_name in arr.dims:
            arr = arr.isel({self.time_name: self._validated_time_index(time_index)})
        if self.depth_name and self.depth_name in arr.dims and depth_index is None:
            depth_values = np.asarray(arr.values, dtype=float)
            if self.lat_name is not None and self.lon_name is not None:
                # Rebuild the field as a per-cell depth profile array.
                spatial = arr.transpose(self.lat_name, self.lon_name, self.depth_name)
                data = np.asarray(spatial.values, dtype=float)
                values = data.reshape(-1, data.shape[-1])
                flat = values.reshape(-1)
                return {
                    "variable": variable,
                    "latitude": np.asarray(lat_grid).tolist(),
                    "longitude": np.asarray(lon_grid).tolist(),
                    "depths": _as_float_list(self._depth_values()),
                    "values": values.tolist(),
                    "min": float(np.nanmin(flat)) if flat.size else 0.0,
                    "max": float(np.nanmax(flat)) if flat.size else 0.0,
                    "time_index": int(time_index),
                    "depth_index": int(depth_index or 0),
                }
        if self.depth_name and self.depth_name in arr.dims:
            arr = arr.isel({self.depth_name: self._validated_depth_index(depth_index)})
        if self.lat_name is not None and self.lon_name is not None and self.lat_name in arr.dims and self.lon_name in arr.dims:
            arr = arr.transpose(self.lat_name, self.lon_name)
        values = np.asarray(arr.values, dtype=float)
        if values.ndim == 1:
            values = np.asarray(values).reshape((self.dataset.sizes[self.lat_name], self.dataset.sizes[self.lon_name]))
        flat = values.reshape(-1)
        return {
            "variable": variable,
            "latitude": np.asarray(lat_grid).tolist(),
            "longitude": np.asarray(lon_grid).tolist(),
            "depths": _as_float_list(self._depth_values()),
            "values": values.tolist(),
            "min": float(np.nanmin(flat)) if flat.size else 0.0,
            "max": float(np.nanmax(flat)) if flat.size else 0.0,
            "time_index": int(time_index),
            "depth_index": int(depth_index or 0),
        }

    def profile(self, variable: str, latitude: float, longitude: float) -> dict[str, Any]:
        if self.dataset is None:
            raise ValueError("No NetCDF dataset is loaded for profile extraction.")

        if variable not in VARIABLES:
            raise ValueError(f"Unknown variable: {variable}")

        lat_grid, lon_grid = self._grid_from_coordinates()
        dist = np.abs(lat_grid - latitude) + np.abs(lon_grid - longitude)
        row, col = np.unravel_index(np.argmin(dist), dist.shape)
        values = self.dataset[self.variable_names[variable]].isel({self.lat_name: row, self.lon_name: col}) if self.lat_name and self.lon_name else self.dataset[self.variable_names[variable]]
        depth_values = self._depth_values()
        if self.depth_name is not None and self.depth_name in values.dims:
            array = np.asarray(values.values, dtype=float)
            return {
                "latitude": float(latitude),
                "longitude": float(longitude),
                "depths": _as_float_list(depth_values),
                variable: np.asarray(array, dtype=float).tolist(),
            }
        return {
            "latitude": float(latitude),
            "longitude": float(longitude),
            "depths": _as_float_list(depth_values),
            variable: np.asarray(values.values, dtype=float).tolist(),
        }


@lru_cache(maxsize=1)
def get_ocean_service() -> NetCDFOceanService:
    return NetCDFOceanService(discover_dataset_path())
