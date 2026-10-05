import numpy as np


DEPTHS = np.linspace(0, 1000, 15)


def generate_data(samples=1000, seed=42):
    rng = np.random.default_rng(seed)

    lat = rng.uniform(5, 30, samples)
    lon = rng.uniform(45, 105, samples)

    spatial = (
        np.sin(lat[:, None] / 4)
        + np.cos(lon[:, None] / 7)
    )

    sst = (
        27
        - 0.08 * (lat - 15)
        + 0.8 * np.sin(lon / 8)
        + 0.4 * spatial[:, 0]
        + rng.normal(0, 0.2, samples)
    )

    sss = (
        34.5
        + 0.02 * lat
        + 0.4 * np.cos(lon / 10)
        + 0.15 * spatial[:, 0]
        + rng.normal(0, 0.05, samples)
    )

    ssh = (
        0.25 * np.sin(lat / 5)
        + 0.15 * np.cos(lon / 7)
        + rng.normal(0, 0.02, samples)
    )

    u = (
        0.5 * np.cos(lat / 6)
        + 0.1 * np.sin(lon / 8)
        + rng.normal(0, 0.03, samples)
    )

    v = (
        0.4 * np.sin(lon / 9)
        + 0.1 * np.cos(lat / 7)
        + rng.normal(0, 0.03, samples)
    )

    surface = np.column_stack([sst, sss, ssh, u, v])

    temperature = []

    for depth in DEPTHS:
        decay = np.exp(-depth / 450)

        temp = (
            5
            + 22 * decay
            + 0.35 * sst * decay
            + 1.5 * ssh * decay
            + 0.8 * u
            - 0.4 * v
            + 0.5 * spatial[:, 0] * decay
            + rng.normal(0, 0.1, samples)
        )

        temperature.append(temp)

    temperature = np.column_stack(temperature)

    return surface, temperature