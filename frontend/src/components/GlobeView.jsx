/**
 * GlobeView.jsx
 *
 * A TRUE geographic Earth globe using react-globe.gl (wraps Three.js).
 * - Full planet Earth from space
 * - NASA Blue Marble satellite texture
 * - Click to select any geographic location
 * - Scientific data overlay as colored hex polygons within dataset coverage
 * - Observation markers for ARGO / Glider floats
 *
 * Props:
 *   state        — global app state
 *   dispatch     — dispatch function
 */
import { useRef, useEffect, useCallback, useState, useMemo } from "react"
import Globe from "react-globe.gl"

// Color scale: cold (blue) → warm (red) for temperature
function tempToColor(value, min, max) {
  if (value == null || isNaN(value)) return "rgba(100,100,100,0.3)"
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.001)))
  // Interpolate HSL: 0.66 (blue) → 0 (red)
  const h = Math.round((0.66 - t * 0.66) * 360)
  const s = 85
  const l = 45 + t * 10
  return `hsla(${h},${s}%,${l}%,0.72)`
}

function salinityToColor(value, min, max) {
  if (value == null || isNaN(value)) return "rgba(100,100,100,0.3)"
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.001)))
  const h = Math.round(200 + t * 40)
  return `hsla(${h},75%,${40 + t * 20}%,0.7)`
}

function speedToColor(value, min, max) {
  if (value == null || isNaN(value)) return "rgba(100,100,100,0.3)"
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.001)))
  return `hsla(${Math.round(160 - t * 80)},80%,${40 + t * 20}%,0.7)`
}

function valueToColor(value, min, max, variable) {
  if (variable === "salinity") {
    // Calibrated oceanic salinity range: 32–38 PSU
    return salinityToColor(value, 32, 38)
  }
  if (variable === "currents" || variable?.includes("current")) {
    return speedToColor(value, 0, 1.5)
  }
  // Standard oceanographic temperature scale: 4°C (abyssal/polar) to 32°C (tropical surface)
  // Ensures depth slider accurately reflects thermocline cooling
  return tempToColor(value, 4, 32)
}

// Build hex polygon grid from field data returned by the API
function buildHexPoints(fieldData, variable) {
  if (!fieldData?.latitude || !fieldData?.longitude || !fieldData?.values) return []

  const latGrid = fieldData.latitude
  const lonGrid = fieldData.longitude
  const rows = latGrid.length
  const cols = latGrid[0]?.length ?? 0
  const values = fieldData.values
  const min = fieldData.min ?? 0
  const max = fieldData.max ?? 30

  const points = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lat = latGrid[r][c]
      const lon = lonGrid[r][c]
      const rawVal = values[r * cols + c]
      const val = Array.isArray(rawVal) ? rawVal[0] : rawVal
      if (lat == null || lon == null || isNaN(val)) continue
      points.push({
        lat,
        lng: lon,
        value: val,
        color: valueToColor(val, min, max, variable),
      })
    }
  }
  return points
}

// Coarse ocean region navigation presets
const OCEAN_PRESETS = [
  { label: "Global", lat: 20, lon: 0, altitude: 2.5 },
  { label: "Pacific", lat: 10, lon: -160, altitude: 1.8 },
  { label: "Atlantic", lat: 20, lon: -35, altitude: 1.8 },
  { label: "Indian", lat: -10, lon: 75, altitude: 1.8 },
  { label: "Southern", lat: -55, lon: 0, altitude: 1.8 },
  { label: "Arctic", lat: 80, lon: 0, altitude: 1.5 },
  { label: "Arabian Sea", lat: 18, lon: 65, altitude: 1.0 },
  { label: "Bay of Bengal", lat: 14, lon: 88, altitude: 1.0 },
]

export default function GlobeView({ state, dispatch }) {
  const globeRef = useRef()
  const [hexPoints, setHexPoints] = useState([])
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight })

  // Update hex overlay when field data changes
  useEffect(() => {
    if (state.fieldData) {
      setHexPoints(buildHexPoints(state.fieldData, state.selectedVariable))
    } else {
      setHexPoints([])
    }
  }, [state.fieldData, state.selectedVariable])

  // Resize observer
  useEffect(() => {
    function onResize() {
      setDimensions({ width: window.innerWidth, height: window.innerHeight })
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  // Initial globe position — overview from space
  useEffect(() => {
    if (globeRef.current) {
      globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2.5 }, 0)
    }
  }, [])

  // Navigate to selected location when it changes
  useEffect(() => {
    if (globeRef.current && state.selectedLat != null && state.selectedLon != null) {
      globeRef.current.pointOfView(
        { lat: state.selectedLat, lng: state.selectedLon, altitude: 1.2 },
        800
      )
    }
  }, [state.selectedLat, state.selectedLon])

  const handleGlobeClick = useCallback(({ lat, lng }) => {
    if (lat == null || lng == null) return
    dispatch({ type: "SELECT_LOCATION", lat, lon: lng })
  }, [dispatch])

  const handlePreset = useCallback((preset) => {
    if (globeRef.current) {
      globeRef.current.pointOfView(
        { lat: preset.lat, lng: preset.lon, altitude: preset.altitude },
        1000
      )
    }
  }, [])

  // Observation markers (filtered by showArgo / showGlider)
  const obsPoints = useMemo(() => {
    if (!state.observations?.length) return []
    return state.observations
      .filter((obs) => obs.type === "Argo" ? state.showArgo : state.showGlider)
      .map((obs) => ({
        lat: obs.latitude,
        lng: obs.longitude,
        color: obs.type === "Argo" ? "#38e6a5" : "#ffb84d",
        radius: 0.4,
        altitude: 0.005,
        id: obs.id,
        label: `${obs.type}: ${obs.id}`,
        obs,
      }))
  }, [state.observations, state.showArgo, state.showGlider])

  // Selected location marker
  const selectedPoints = useMemo(() => {
    if (state.selectedLat == null) return []
    return [{
      lat: state.selectedLat,
      lng: state.selectedLon,
      color: "#ffffff",
      radius: 0.5,
      altitude: 0.01,
      label: `${state.selectedLat.toFixed(3)}°, ${state.selectedLon.toFixed(3)}°`,
    }]
  }, [state.selectedLat, state.selectedLon])

  const allPoints = useMemo(() => [...obsPoints, ...selectedPoints], [obsPoints, selectedPoints])

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* Ocean navigation shortcuts */}
      <div className="ocean-nav">
        {OCEAN_PRESETS.map((p) => (
          <button key={p.label} onClick={() => handlePreset(p)} className="ocean-nav-btn">
            {p.label}
          </button>
        ))}
      </div>

      <Globe
        ref={globeRef}
        width={dimensions.width}
        height={dimensions.height}
        backgroundColor="rgba(0,0,0,0)"
        // Earth textures — NASA Blue Marble via three-globe CDN
        globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
        bumpImageUrl="//unpkg.com/three-globe/example/img/earth-topology.png"
        // Atmosphere
        showAtmosphere
        atmosphereColor="#3a9bdc"
        atmosphereAltitude={0.15}
        // Scientific data overlay as hex points
        hexBinPointsData={hexPoints}
        hexBinPointLat={(d) => d.lat}
        hexBinPointLng={(d) => d.lng}
        hexBinPointWeight={() => 1}
        hexBinResolution={3}
        hexTopColor={(d) => d.points?.[0]?.color ?? "rgba(100,150,200,0.6)"}
        hexSideColor={(d) => d.points?.[0]?.color ?? "rgba(100,150,200,0.4)"}
        hexAltitude={0.004}
        hexLabel={(d) => {
          const pt = d.points?.[0]
          if (!pt) return ""
          return `${state.selectedVariable}: ${pt.value?.toFixed(2)}`
        }}
        // Observation + selected markers
        pointsData={allPoints}
        pointLat={(d) => d.lat}
        pointLng={(d) => d.lng}
        pointColor={(d) => d.color}
        pointRadius={(d) => d.radius ?? 0.4}
        pointAltitude={(d) => d.altitude ?? 0.005}
        pointLabel={(d) => d.label ?? ""}
        // Click handler
        onGlobeClick={handleGlobeClick}
        // Controls
        enablePointerInteraction
      />

      {/* Dataset coverage indicator */}
      {state.fieldData && (
        <div className="globe-coverage-badge">
          <span className="badge-dot" />
          OceanEmbed dataset overlay active
        </div>
      )}

      {/* Click prompt */}
      {state.selectedLat == null && (
        <div className="globe-click-prompt">
          🌊 Click any ocean to begin analysis
        </div>
      )}
    </div>
  )
}
