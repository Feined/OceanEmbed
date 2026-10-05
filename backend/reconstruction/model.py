from sklearn.ensemble import ExtraTreesRegressor


class TemperatureReconstructor:
    def __init__(self):
        self.model = ExtraTreesRegressor(
            n_estimators=150,
            max_depth=18,
            min_samples_leaf=2,
            n_jobs=-1,
            random_state=42
        )

    def fit(self, X, y):
        self.model.fit(X, y)
        return self

    def predict(self, X):
        return self.model.predict(X)