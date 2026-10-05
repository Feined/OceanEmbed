# OceanEmbed

OceanEmbed is a browser-native 3D ocean-state visualization prototype for SIH26067. It currently demonstrates synthetic model fields, depth navigation, time animation, current vectors, and Argo/Glider profile overlays.

## Stack

- Frontend: React + Vite + Three.js / React Three Fiber
- Backend: FastAPI + NumPy + scikit-learn
- Planned data layer: xarray + NetCDF / CF-Conventions

## Run locally

### Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\\Scripts\\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, normally `http://localhost:5173`.

## Current prototype features

- Temperature and salinity depth slices
- Current-speed field with U/V vector arrows
- 15 depth levels from 0–1000 m
- 12 synthetic time steps with play/pause animation
- Argo and Glider markers
- Clickable depth-profile inspection
- Layer visibility controls
- Vertical exaggeration control

The current data is intentionally synthetic. The next data-engineering step is replacing the synthetic adapter with xarray/NetCDF ingestion while keeping the API contract stable.


## Real NetCDF model data

OceanEmbed can now read a CF-style NetCDF ocean model file through xarray. By default the app continues to use the built-in synthetic dataset.

1. Put your NetCDF file anywhere on your machine.
2. Set `OCEAN_NETCDF` to its full path before starting FastAPI.

PowerShell example:

```powershell
$env:OCEAN_NETCDF = "C:\data\ocean_model.nc"
uvicorn main:app --reload
```

The loader looks for common names for latitude, longitude, depth and time, and common CF/ocean aliases for temperature (`thetao`, `temp`), salinity (`so`, `salinity`) and currents (`uo`, `vo`). The frontend reads the dataset's grid, depth count and time count from `/ocean/metadata`.

If the NetCDF file is not configured, `/ocean/source` reports `synthetic` and the demo remains unchanged.
