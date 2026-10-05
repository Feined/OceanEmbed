import numpy as np


def _profile(base, depths, slope, wave):
    depths = np.asarray(depths, dtype=float)
    return base + slope * (depths / 1000.0) + wave * np.sin(depths / 180.0)


def generate_observations(time_index=0):
    depths = np.linspace(0, 1000, 15)
    phase = time_index * 0.2

    observations = [
        {
            "id": "ARGO-2902345",
            "type": "Argo",
            "latitude": 17.4 + 0.08 * np.sin(phase),
            "longitude": 71.8 + 0.10 * np.cos(phase),
            "timestamp": "2026-09-29T12:00:00Z",
            "profile": {
                "depths": depths.tolist(),
                "temperature": _profile(28.1, depths, -17.2, 0.7).tolist(),
                "salinity": _profile(34.8, depths, 0.8, 0.08).tolist(),
            },
        },
        {
            "id": "ARGO-2902318",
            "type": "Argo",
            "latitude": 12.8 + 0.06 * np.cos(phase),
            "longitude": 83.5 + 0.08 * np.sin(phase),
            "timestamp": "2026-09-29T10:30:00Z",
            "profile": {
                "depths": depths.tolist(),
                "temperature": _profile(27.4, depths, -16.1, 0.5).tolist(),
                "salinity": _profile(35.0, depths, 0.6, 0.06).tolist(),
            },
        },
        {
            "id": "GLIDER-IND-07",
            "type": "Glider",
            "latitude": 21.6 + 0.10 * np.sin(phase + 1),
            "longitude": 91.2 + 0.12 * np.cos(phase + 1),
            "timestamp": "2026-09-29T09:15:00Z",
            "profile": {
                "depths": depths.tolist(),
                "temperature": _profile(29.0, depths, -18.4, 0.9).tolist(),
                "salinity": _profile(34.6, depths, 1.0, 0.10).tolist(),
            },
        },
    ]

    return observations
