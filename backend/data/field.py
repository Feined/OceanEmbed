import numpy as np


DEPTHS = np.linspace(0, 1000, 15)


def surface_features(lat, lon, time_index=0):
    phase = time_index * 0.35

    sst = (
        27
        - 0.08 * (lat - 15)
        + 0.8 * np.sin(lon / 8 + phase)
    )

    sss = (
        34.5
        + 0.02 * lat
        + 0.4 * np.cos(lon / 10 + phase * 0.7)
    )

    ssh = (
        0.25 * np.sin(lat / 5 + phase)
        + 0.15 * np.cos(lon / 7 - phase)
    )

    u = (
        0.5 * np.cos(lat / 6 + phase)
        + 0.1 * np.sin(lon / 8)
    )

    v = (
        0.4 * np.sin(lon / 9 - phase)
        + 0.1 * np.cos(lat / 7)
    )

    return np.column_stack([sst, sss, ssh, u, v])


def generate_field(rows=12, cols=20, time_index=0):
    lat = np.linspace(5, 30, rows)
    lon = np.linspace(45, 105, cols)

    lat_grid, lon_grid = np.meshgrid(lat, lon, indexing="ij")

    features = surface_features(
        lat_grid.ravel(),
        lon_grid.ravel(),
        time_index=time_index,
    )

    return lat_grid, lon_grid, features
