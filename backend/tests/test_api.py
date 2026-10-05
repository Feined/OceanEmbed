"""
Backend test suite for OceanEmbed 3D.
Covers: existing API, new location/profile/bathymetry endpoints,
        land/ocean classification, coordinate normalization.
"""
from fastapi.testclient import TestClient
import pytest

from main import app
from services.location_service import (
    classify_environment,
    ocean_region_name,
    approximate_bathymetry,
    nearest_grid_cell,
)
import numpy as np

client = TestClient(app)


# ---- Metadata -------------------------------------------------------

def test_metadata_endpoint_exists():
    response = client.get("/api/ocean/metadata")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "source" in payload
    assert "available_variables" in payload or "variables" in payload


def test_metadata_has_depth_levels():
    response = client.get("/api/ocean/metadata")
    payload = response.json()
    assert "depth_levels" in payload
    assert len(payload["depth_levels"]) > 0


def test_metadata_has_lat_lon_range():
    response = client.get("/api/ocean/metadata")
    payload = response.json()
    assert "latitude_range" in payload
    assert "longitude_range" in payload


# ---- Field ----------------------------------------------------------

def test_field_endpoint_temperature():
    response = client.get("/api/ocean/field?variable=temperature&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert "latitude" in payload
    assert "longitude" in payload
    assert "values" in payload
    assert "min" in payload
    assert "max" in payload


def test_field_endpoint_rejects_unknown_variable():
    response = client.get("/api/ocean/field?variable=not_real&time=0&depth=0")
    assert response.status_code == 400


def test_field_endpoint_salinity():
    response = client.get("/api/ocean/field?variable=salinity&time=0")
    assert response.status_code == 200


def test_field_depths_present():
    response = client.get("/api/ocean/field?variable=temperature&time=0")
    payload = response.json()
    assert "depths" in payload
    assert len(payload["depths"]) > 0


# ---- Location -------------------------------------------------------

def test_location_ocean_point():
    """A clearly open-ocean point in the Indian Ocean."""
    response = client.get("/api/location?lat=15.0&lon=72.0&depth=0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "ocean"
    assert payload["latitude"] == pytest.approx(15.0, abs=0.01)
    assert payload["longitude"] == pytest.approx(72.0, abs=0.01)


def test_location_land_point():
    """Mumbai is on land."""
    response = client.get("/api/location?lat=19.0&lon=72.8&depth=0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "land"
    assert payload["dataset_coverage"] is False


def test_location_out_of_coverage():
    """South Pacific is open ocean but outside OceanEmbed coverage."""
    response = client.get("/api/location?lat=-20.0&lon=-140.0&depth=0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "ocean"
    assert payload["dataset_coverage"] is False


def test_location_within_coverage():
    """Point in Arabian Sea is in the dataset coverage (5–30°N, 45–105°E)."""
    response = client.get("/api/location?lat=15.0&lon=65.0&depth=0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["dataset_coverage"] is True
    assert "variables" in payload
    assert "temperature" in payload["variables"]


def test_location_invalid_lat():
    response = client.get("/api/location?lat=200.0&lon=0.0")
    assert response.status_code == 422


def test_location_invalid_lon():
    response = client.get("/api/location?lat=0.0&lon=200.0")
    assert response.status_code == 422


# ---- Profile --------------------------------------------------------

def test_profile_ocean_within_coverage():
    response = client.get("/api/profile?lat=15.0&lon=72.0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "ocean"
    assert payload["available"] is True
    assert "profile" in payload
    # Should have temperature at minimum
    assert "temperature" in payload["profile"]


def test_profile_ocean_outside_coverage():
    response = client.get("/api/profile?lat=-20.0&lon=-140.0&time=0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["available"] is False


def test_profile_land_point():
    response = client.get("/api/profile?lat=28.0&lon=77.0&time=0")  # Delhi
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "land"
    assert payload["available"] is False


def test_profile_has_depths():
    response = client.get("/api/profile?lat=15.0&lon=72.0&time=0")
    payload = response.json()
    if payload["available"]:
        assert "depth_levels" in payload
        assert len(payload["depth_levels"]) > 0


# ---- Bathymetry -----------------------------------------------------

def test_bathymetry_ocean():
    response = client.get("/api/bathymetry?lat=15.0&lon=72.0")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "ocean"
    assert payload["seafloor_depth_m"] is not None
    assert payload["seafloor_depth_m"] < 0  # Depth is negative


def test_bathymetry_land():
    response = client.get("/api/bathymetry?lat=19.0&lon=72.8")
    assert response.status_code == 200
    payload = response.json()
    assert payload["environment"] == "land"
    assert payload["seafloor_depth_m"] is None


# ---- Observations ---------------------------------------------------

def test_observations_endpoint():
    response = client.get("/api/observations?time_index=0")
    assert response.status_code == 200
    payload = response.json()
    assert "observations" in payload
    assert isinstance(payload["observations"], list)
    assert len(payload["observations"]) > 0


def test_observation_has_profile():
    response = client.get("/api/observations?time_index=0")
    obs = response.json()["observations"][0]
    assert "profile" in obs
    assert "temperature" in obs["profile"]
    assert "depths" in obs["profile"]


# ---- Land/Ocean Classification Unit Tests --------------------------

class TestClassifyEnvironment:
    def test_pacific_ocean(self):
        assert classify_environment(0, -160) == "ocean"

    def test_atlantic_ocean(self):
        assert classify_environment(30, -40) == "ocean"

    def test_indian_ocean(self):
        assert classify_environment(-20, 75) == "ocean"

    def test_australian_landmass(self):
        assert classify_environment(-25, 133) == "land"

    def test_sahara(self):
        assert classify_environment(22, 12) == "land"

    def test_north_america(self):
        assert classify_environment(40, -100) == "land"

    def test_south_america(self):
        assert classify_environment(-15, -60) == "land"

    def test_arctic_ocean(self):
        assert classify_environment(80, 0) == "ocean"


class TestOceanRegionName:
    def test_arctic(self):
        assert "Arctic" in ocean_region_name(75, 0)

    def test_southern(self):
        assert "Southern" in ocean_region_name(-65, 0)

    def test_north_atlantic(self):
        name = ocean_region_name(30, -40)
        assert "Atlantic" in name

    def test_indian_ocean(self):
        name = ocean_region_name(-20, 75)
        assert "Indian" in name


class TestApproximateBathymetry:
    def test_returns_negative_for_ocean(self):
        depth = approximate_bathymetry(0, 0)
        assert depth is not None
        assert depth < 0

    def test_returns_none_for_land(self):
        depth = approximate_bathymetry(20, 78)  # India
        assert depth is None

    def test_realistic_range(self):
        depth = approximate_bathymetry(0, -140)  # Central Pacific
        assert depth is not None
        assert -11000 <= depth <= -50


class TestNearestGridCell:
    def test_finds_nearest(self):
        import numpy as np
        lat = np.linspace(5, 30, 12)
        lon = np.linspace(45, 105, 20)
        lat_g, lon_g = np.meshgrid(lat, lon, indexing="ij")
        cell = nearest_grid_cell(15.0, 72.0, lat_g, lon_g)
        assert cell is not None
        r, c = cell
        assert 0 <= r < 12
        assert 0 <= c < 20

    def test_returns_none_for_out_of_range(self):
        import numpy as np
        lat_g = np.linspace(5, 30, 12).reshape(12, 1)
        lon_g = np.linspace(45, 105, 20).reshape(1, 20)
        lat_g, lon_g = np.meshgrid(np.linspace(5, 30, 12), np.linspace(45, 105, 20), indexing="ij")
        cell = nearest_grid_cell(-80.0, -140.0, lat_g, lon_g)
        assert cell is None  # more than 10 degrees away
