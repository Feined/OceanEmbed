import numpy as np
from sklearn.metrics import mean_squared_error


def evaluate(y_true, y_pred, depths):
    results = []

    for i, depth in enumerate(depths):
        rmse = mean_squared_error(
            y_true[:, i],
            y_pred[:, i]
        ) ** 0.5

        correlation = np.corrcoef(
            y_true[:, i],
            y_pred[:, i]
        )[0, 1]

        results.append({
            "depth": int(depth),
            "rmse": float(rmse),
            "correlation": float(correlation)
        })

    return results