/**
 * App.jsx — OceanEmbed 3D
 *
 * Main application shell.
 * Layout:
 *   HEADER
 *   ├── LEFT:   LayerControls
 *   ├── CENTER: GlobeView (hero)
 *   └── RIGHT:  SciPanel
 *   BOTTOM: MapView (collapsible)
 *
 * All data fetching is orchestrated here from a single useReducer state.
 */
import { useEffect, useCallback, useRef } from "react"
import { useAppState } from "./hooks/appState"
import {
  fetchMetadata,
  fetchField,
  fetchLocation,
  fetchProfile,
  fetchObservations,
} from "./services/api"

// Lazy-load heavy components to avoid SSR issues with globe
import { lazy, Suspense } from "react"
const GlobeView = lazy(() => import("./components/GlobeView"))
const MapView   = lazy(() => import("./components/MapView"))
import SciPanel from "./components/SciPanel"
import LayerControls from "./components/LayerControls"

// ---- Animation interval ----
let _animTimer = null

export default function App() {
  const [state, dispatch] = useAppState()
  const abortRefs = useRef({})

  // ---- Helper: abort-safe fetch ----
  function abort(key) {
    if (abortRefs.current[key]) {
      abortRefs.current[key].abort()
    }
    const ctrl = new AbortController()
    abortRefs.current[key] = ctrl
    return ctrl.signal
  }

  // ---- Load metadata once ----
  useEffect(() => {
    const signal = abort("metadata")
    fetchMetadata(signal)
      .then((meta) => {
        dispatch({ type: "SET_METADATA", payload: meta })
        // Set initial variable based on available variables
        if (meta.available_variables?.length) {
          const firstVar = meta.available_variables[0]
          const norm = ["current_u","current_v","current_speed"].includes(firstVar) ? "currents" : firstVar
          dispatch({ type: "SET_VARIABLE", variable: norm })
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch({
            type: "SET_ERROR",
            errors: { metadata: err.message },
          })
          // Provide minimal fallback metadata
          dispatch({
            type: "SET_METADATA",
            payload: {
              source: "synthetic",
              dataset_status: "missing",
              available_variables: ["temperature", "salinity"],
              depth_levels: Array.from({ length: 15 }, (_, i) => i * 70),
              time_steps: 12,
              latitude_range: [5, 30],
              longitude_range: [45, 105],
            },
          })
        }
      })
    return () => abortRefs.current.metadata?.abort()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load field data when variable/time/depth change ----
  useEffect(() => {
    if (!state.metadata) return
    const signal = abort("field")
    dispatch({ type: "SET_LOADING", flags: { field: true } })

    const variable = state.selectedVariable === "currents" ? "current_speed" : state.selectedVariable
    fetchField({ variable, timeIndex: state.timeIndex, depthIndex: state.depthIndex }, signal)
      .then((fd) => dispatch({ type: "SET_FIELD", payload: fd }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch({ type: "SET_ERROR", errors: { field: err.message } })
        }
      })
    return () => abortRefs.current.field?.abort()
  }, [state.selectedVariable, state.timeIndex, state.depthIndex, state.metadata]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load observations when time changes ----
  useEffect(() => {
    if (!state.metadata) return
    const signal = abort("obs")
    fetchObservations(state.timeIndex, signal)
      .then((res) => dispatch({ type: "SET_OBSERVATIONS", payload: res.observations ?? [] }))
      .catch(() => {})
    return () => abortRefs.current.obs?.abort()
  }, [state.timeIndex, state.metadata]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load location data when location/depth/time changes ----
  useEffect(() => {
    if (state.selectedLat == null || state.selectedLon == null) return
    const signal = abort("location")
    dispatch({ type: "SET_LOADING", flags: { location: true } })

    fetchLocation({
      lat: state.selectedLat,
      lon: state.selectedLon,
      depth: state.selectedDepth,
      time: state.timeIndex,
    }, signal)
      .then((ld) => dispatch({ type: "SET_LOCATION", payload: ld }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch({ type: "SET_ERROR", errors: { location: err.message } })
        }
      })
    return () => abortRefs.current.location?.abort()
  }, [state.selectedLat, state.selectedLon, state.selectedDepth, state.timeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Load vertical profile when location/time changes ----
  useEffect(() => {
    if (state.selectedLat == null || state.selectedLon == null) return
    const signal = abort("profile")
    dispatch({ type: "SET_LOADING", flags: { profile: true } })

    fetchProfile({
      lat: state.selectedLat,
      lon: state.selectedLon,
      time: state.timeIndex,
    }, signal)
      .then((pd) => dispatch({ type: "SET_PROFILE", payload: pd }))
      .catch((err) => {
        if (err.name !== "AbortError") {
          dispatch({ type: "SET_ERROR", errors: { profile: err.message } })
        }
      })
    return () => abortRefs.current.profile?.abort()
  }, [state.selectedLat, state.selectedLon, state.timeIndex]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Time animation ----
  useEffect(() => {
    if (_animTimer) clearInterval(_animTimer)
    if (!state.globeAnimation) return
    _animTimer = setInterval(() => {
      dispatch({
        type: "SET_TIME_INDEX",
        index: (state.timeIndex + 1) % (state.metadata?.time_steps ?? 12),
      })
    }, 900)
    return () => clearInterval(_animTimer)
  }, [state.globeAnimation, state.timeIndex, state.metadata]) // eslint-disable-line react-hooks/exhaustive-deps

  const sourceLabel = state.metadata?.source === "netcdf" ? "NETCDF DATASET" : "SYNTHETIC MODEL"
  const sourceClass = state.metadata?.source === "netcdf" ? "status-live" : "status-synth"

  return (
    <div className="app-shell">
      {/* ── HEADER ─────────────────────────────────── */}
      <header className="app-header">
        <div className="header-brand">
          <span className="brand-icon">🌊</span>
          <div>
            <h1 className="brand-title">OceanEmbed <span className="brand-3d">3D</span></h1>
            <p className="brand-sub">Interactive Oceanographic Digital Twin</p>
          </div>
        </div>

        <div className="header-center">
          {state.selectedLat != null && (
            <div className="coord-pill">
              <span className="coord-icon">📍</span>
              {state.selectedLat.toFixed(3)}°N, {state.selectedLon.toFixed(3)}°E
            </div>
          )}
        </div>

        <div className="header-right">
          <div className={`data-status ${sourceClass}`}>
            <span className="status-dot" />
            {sourceLabel}
          </div>
        </div>
      </header>

      {/* ── MAIN CONTENT ──────────────────────────── */}
      <div className="main-content">
        {/* Left sidebar */}
        {state.metadata && (
          <LayerControls state={state} dispatch={dispatch} />
        )}

        {/* Globe (hero center) */}
        <div className="globe-area">
          <Suspense fallback={<div className="globe-loading">Loading Earth…</div>}>
            <GlobeView state={state} dispatch={dispatch} />
          </Suspense>
        </div>

        {/* Right panel */}
        <SciPanel state={state} dispatch={dispatch} />
      </div>

      {/* ── BOTTOM MAP PANEL ──────────────────────── */}
      <div className={`bottom-strip ${state.showMapPanel ? "strip-open" : "strip-closed"}`}>
        <div className="strip-toggle-bar">
          <button
            className="strip-toggle"
            onClick={() => dispatch({ type: "TOGGLE_MAP_PANEL" })}
          >
            {state.showMapPanel ? "▾ Hide Map" : "▸ Show 2D Map"}
          </button>
          <span className="strip-label">2D Geographic Map · Scientific Overlay</span>
        </div>
        {state.showMapPanel && (
          <Suspense fallback={<div className="map-loading">Loading map…</div>}>
            <MapView state={state} dispatch={dispatch} />
          </Suspense>
        )}
      </div>

      {/* Errors */}
      {state.errors.metadata && (
        <div className="error-toast">
          ⚠ Backend unavailable: {state.errors.metadata}.{" "}
          <a href="http://127.0.0.1:8000" target="_blank" rel="noreferrer">Check API</a>
        </div>
      )}
    </div>
  )
}
