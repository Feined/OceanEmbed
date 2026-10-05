import os
from functools import lru_cache

import numpy as np
import xarray as xr


# Common CF / ocean-model aliases. The first matching name is used.
ALIASES = {
    "temperature": ["temperature", "temp", "thetao", "water_temp", "sea_water_temperature"],
    "salinity": ["salinity", "so", "sss", "water_salinity", "sea_water_salinity"],
    "current_u": ["uo", "u", "eastward_sea_water_velocity", "current_u", "water_u"],
    "current_v": ["vo", "v", "northward_sea_water_velocity", "current_v", "water_v"],
}


def _first_existing(values, candidates):
    lower = {str(v).lower(): str(v) for v in values}
    for candidate in candidates:
        if candidate.lower() in lower:
            return lower[candidate.lower()]
    return None


def _find_coord(ds, aliases):
    return _first_existing(list(ds.coords) + list(ds.dims), aliases)


def _find_variable(ds, aliases):
    return _first_existing(ds.data_vars, aliases)


def _axis_name(da, aliases):
    return _find_coord(da.to_dataset(name="_value"), aliases)


class NetCDFOceanData:
    """Small adapter that converts a CF-style NetCDF ocean field into OceanEmbed's API shape."""

    def __init__(self, path):
        self.path = path
        self.ds = xr.open_dataset(path)

        self.lat_name = _find_coord(self.ds, ["latitude", "lat", "nav_lat", "y"])
        self.lon_name = _find_coord(self.ds, ["longitude", "lon", "nav_lon", "x"])
        self.depth_name = _find_coord(self.ds, ["depth", "deptht", "lev", "level", "z"])
        self.time_name = _find_coord(self.ds, ["time", "time_counter", "date"])

        if not self.lat_name or not self.lon_name or not self.depth_name:
            raise ValueError("NetCDF must contain latitude, longitude and depth coordinates.")

        self.variable_names = {
            key: _find_variable(self.ds, aliases)
            for key, aliases in ALIASES.items()
        }
        if not self.variable_names["temperature"]:
            raise ValueError("NetCDF temperature variable was not found.")

    @property
    def time_count(self):
        if not self.time_name:
            return 1
        return int(self.ds.sizes[self.time_name])

    @property
    def depths(self):
        return np.asarray(self.ds[self.depth_name].values, dtype=float)

    def _slice(self, variable, time_index):
        name = self.variable_names.get(variable)
        if not name:
            raise ValueError(f"Variable '{variable}' is not available in this NetCDF file.")

        da = self.ds[name]
        if self.time_name and self.time_name in da.dims:
            da = da.isel({self.time_name: min(time_index, da.sizes[self.time_name] - 1)})
        return da

    def _grid(self):
        lat = np.asarray(self.ds[self.lat_name].values, dtype=float)
        lon = np.asarray(self.ds[self.lon_name].values, dtype=float)

        # 1D coordinates are the common CF representation.
        if lat.ndim == 1 and lon.ndim == 1:
            lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")
            return lat_grid, lon_grid

        if lat.shape != lon.shape:
            raise ValueError("Latitude and longitude grids must have matching shapes.")
        return lat, lon

    def _to_grid(self, da):
        # Remove singleton dimensions that are not spatial/depth dimensions.
        allowed = {self.lat_name, self.lon_name, self.depth_name}
        for dim in list(da.dims):
            if dim not in allowed and da.sizes[dim] == 1:
                da = da.isel({dim: 0}, drop=True)

        missing = [d for d in (self.lat_name, self.lon_name, self.depth_name) if d not in da.dims]
        if missing:
            raise ValueError(f"Variable is missing required dimensions: {missing}")

        da = da.transpose(self.lat_name, self.lon_name, self.depth_name, missing_dims="ignore")
        arr = np.asarray(da.values, dtype=float)

        # Some datasets store longitude/latitude as 2D coordinates while the data
        # dimensions have different names. This adapter targets the regular-grid case.
        expected = (
            self.ds.sizes[self.lat_name],
            self.ds.sizes[self.lon_name],
            self.ds.sizes[self.depth_name],
        )
        if arr.shape != expected:
            raise ValueError(f"Expected field shape {expected}, got {arr.shape}.")
        return arr

    def field(self, variable, time_index=0):
        if variable == "current_speed":
            u = self._to_grid(self._slice("current_u", time_index))
            v = self._to_grid(self._slice("current_v", time_index))
            values = np.sqrt(u ** 2 + v ** 2)
        else:
            values = self._to_grid(self._slice(variable, time_index))
        lat, lon = self._grid()
        return lat, lon, values

    def metadata(self):
        return {
            "grid": {
                "rows": int(self.ds.sizes[self.lat_name]),
                "cols": int(self.ds.sizes[self.lon_name]),
                "depths": len(self.depths),
            },
            "depths": self.depths.tolist(),
            "time_steps": self.time_count,
            "variables_available": [k for k, v in self.variable_names.items() if v],
            "source_file": os.path.basename(self.path),
        }


@lru_cache(maxsize=1)
def get_netcdf(path):
    return NetCDFOceanData(path)


def get_configured_dataset():
    path = os.getenv("OCEAN_NETCDF")
    if not path:
        return None
    if not os.path.isfile(path):
        raise FileNotFoundError(f"OCEAN_NETCDF points to a missing file: {path}")
    return get_netcdf(path)
