from fastapi.testclient import TestClient

from main import app

client = TestClient(app)


def test_metadata_endpoint_exists():
    response = client.get("/api/ocean/metadata")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert "source" in payload
    assert "available_variables" in payload or "variables" in payload


def test_field_endpoint_rejects_unknown_variable():
    response = client.get("/api/ocean/field?variable=not_real&time=0&depth=0")
    assert response.status_code == 400
