import numpy as np
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler


class EOFEmbedding:
    def __init__(self, components=32):
        self.scaler = StandardScaler()
        self.eof = PCA(n_components=components)

    def fit_transform(self, X):
        X = self.scaler.fit_transform(X)
        return self.eof.fit_transform(X)

    def transform(self, X):
        X = self.scaler.transform(X)
        return self.eof.transform(X)

    @property
    def explained_variance(self):
        return self.eof.explained_variance_ratio_.sum()