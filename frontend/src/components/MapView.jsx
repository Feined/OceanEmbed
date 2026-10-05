/**
 * MapView.jsx
 *
 * A 2D geographic map using Leaflet with:
 * - Real basemap (CartoDB dark tiles, no API key)
 * - Scientific data overlay (colored grid cells within dataset coverage)
 * - Selected location marker
 * - Observation markers
 */
import { useEffect, useRef, useMemo, useCallback } from "react"

// Leaflet must be imported dynamically to avoid SSR issues with Vite
// We use the raw Leaflet API (no react-leaflet) to keep control.
let L = null
let leafletLoaded = false

async function ensureLeaflet() {
  if (leafletLoaded && L) return L
  const mod = await import("leaflet")
  L = mod.default
  // Inject Leaflet CSS if not already present
  if (!document.getElementById("leaflet-css")) {
    const link = document.createElement("link")
    link.id = "leaflet-css"
    link.rel = "stylesheet"
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
    document.head.appendChild(link)
  }
  leafletLoaded = true
  return L
}

// Color helpers (same as GlobeView for visual consistency)
function tempToHex(value, min, max) {
  const t = Math.max(0, Math.min(1, (value - min) / Math.max(max - min, 0.001)))
  const h = Math.round((0.66 - t * 0.66) * 360)
  return `hsl(${h},85%,50%)`
}

function valueToHex(value, min, max, variable) {
  if (variable === "salinity") {
    const t = Math.max(0, Math.min(1, (value - 32) / 6))
    return `hsl(${Math.round(200 + t * 40)},75%,50%)`
  }
  if (variable === "currents" || variable?.includes("current")) {
    const t = Math.max(0, Math.min(1, value / 1.5))
    return `hsl(${Math.round(160 - t * 80)},80%,50%)`
  }
  // Standard oceanographic temperature scale: 4°C to 32°C
  return tempToHex(value, 4, 32)
}

export default function MapView({ state, dispatch }) {
  const mapRef = useRef(null)        // Leaflet map instance
  const containerRef = useRef(null)  // DOM container
  const overlayLayerRef = useRef(null) // field overlay layer group
  const markerLayerRef = useRef(null)  // markers
  const selectedMarkerRef = useRef(null)
  const initRef = useRef(false)

  // Initialize map once
  useEffect(() => {
    if (initRef.current || !containerRef.current) return
    initRef.current = true

    ensureLeaflet().then((Lf) => {
      const map = Lf.map(containerRef.current, {
        center: [20, 10],
        zoom: 2,
        zoomControl: true,
        attributionControl: true,
      })

      // CartoDB dark basemap — no API key required
      Lf.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors © <a href="https://carto.com/attributions">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
        }
      ).addTo(map)

      mapRef.current = map
      overlayLayerRef.current = Lf.layerGroup().addTo(map)
      markerLayerRef.current = Lf.layerGroup().addTo(map)

      // Click handler
      map.on("click", (e) => {
        dispatch({ type: "SELECT_LOCATION", lat: e.latlng.lat, lon: e.latlng.lng })
      })
    })

    return () => {
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
        initRef.current = false
      }
    }
  }, [dispatch])

  // Scientific field overlay
  useEffect(() => {
    if (!mapRef.current || !overlayLayerRef.current) return
    if (typeof L?.layerGroup !== "function") return

    overlayLayerRef.current.clearLayers()

    const fd = state.fieldData
    if (!fd?.latitude || !fd?.longitude || !fd?.values) return

    const latGrid = fd.latitude
    const lonGrid = fd.longitude
    const rows = latGrid.length
    const cols = latGrid[0]?.length ?? 0
    const values = fd.values
    const min = fd.min ?? 0
    const max = fd.max ?? 30

    // Cell size estimation (degrees)
    const latStep = rows > 1 ? Math.abs(latGrid[1][0] - latGrid[0][0]) : 2
    const lonStep = cols > 1 ? Math.abs(lonGrid[0][1] - lonGrid[0][0]) : 2

    const half_lat = latStep / 2
    const half_lon = lonStep / 2

    // Only draw every 2nd cell for performance (map is supplementary)
    for (let r = 0; r < rows; r += 2) {
      for (let c = 0; c < cols; c += 2) {
        const lat = latGrid[r][c]
        const lon = lonGrid[r][c]
        const rawVal = values[r * cols + c]
        const val = Array.isArray(rawVal) ? rawVal[0] : rawVal
        if (lat == null || lon == null || isNaN(val)) continue

        const color = valueToHex(val, min, max, fd.variable)
        const bounds = [
          [lat - half_lat, lon - half_lon],
          [lat + half_lat, lon + half_lon],
        ]
        L.rectangle(bounds, {
          color: "none",
          fillColor: color,
          fillOpacity: 0.55,
          weight: 0,
        })
          .bindTooltip(`${fd.variable}: ${val.toFixed(2)} ${fd.unit ?? ""}`, { sticky: true })
          .addTo(overlayLayerRef.current)
      }
    }
  }, [state.fieldData])

  // Observation markers
  useEffect(() => {
    if (!mapRef.current || !markerLayerRef.current || !L?.circleMarker) return

    markerLayerRef.current.clearLayers()

    state.observations.forEach((obs) => {
      const color = obs.type === "Argo" ? "#38e6a5" : "#ffb84d"
      L.circleMarker([obs.latitude, obs.longitude], {
        radius: 6,
        color,
        fillColor: color,
        fillOpacity: 0.85,
        weight: 1.5,
      })
        .bindPopup(
          `<b>${obs.type}</b>: ${obs.id}<br/>` +
          `${obs.latitude.toFixed(3)}°N, ${obs.longitude.toFixed(3)}°E<br/>` +
          `${obs.timestamp}`
        )
        .addTo(markerLayerRef.current)
    })
  }, [state.observations])

  // Selected location marker + pan
  useEffect(() => {
    if (!mapRef.current || !L?.marker) return

    if (selectedMarkerRef.current) {
      selectedMarkerRef.current.remove()
      selectedMarkerRef.current = null
    }

    if (state.selectedLat == null) return

    const icon = L.divIcon({
      className: "",
      html: `<div style="
        width:16px;height:16px;
        border-radius:50%;
        background:white;
        border:3px solid #2faef2;
        box-shadow:0 0 12px rgba(47,174,242,0.8);
        transform:translate(-50%,-50%)
      "></div>`,
      iconSize: [0, 0],
    })

    const marker = L.marker([state.selectedLat, state.selectedLon], { icon })
      .bindPopup(
        `<b>Selected</b><br/>` +
        `${state.selectedLat.toFixed(4)}°N, ${state.selectedLon.toFixed(4)}°E`
      )
      .addTo(mapRef.current)

    selectedMarkerRef.current = marker
    mapRef.current.setView([state.selectedLat, state.selectedLon], Math.max(mapRef.current.getZoom(), 4), { animate: true })
  }, [state.selectedLat, state.selectedLon])

  // Add dataset coverage rectangle
  const coverageBoxRef = useRef(null)
  useEffect(() => {
    if (!mapRef.current || !L?.rectangle) return
    if (coverageBoxRef.current) {
      coverageBoxRef.current.remove()
      coverageBoxRef.current = null
    }
    const meta = state.metadata
    if (!meta?.latitude_range || !meta?.longitude_range) return

    const [latMin, latMax] = meta.latitude_range
    const [lonMin, lonMax] = meta.longitude_range
    coverageBoxRef.current = L.rectangle(
      [[latMin, lonMin], [latMax, lonMax]],
      {
        color: "#2faef2",
        fillColor: "#2faef2",
        fillOpacity: 0.04,
        weight: 1,
        dashArray: "5,5",
      }
    )
      .bindTooltip("OceanEmbed dataset coverage")
      .addTo(mapRef.current)
  }, [state.metadata])

  return (
    <div className="map-panel">
      <div className="map-header">
        <span className="panel-eyebrow">2D MAP</span>
        <span className="map-subtitle">Geographic + Scientific overlay</span>
      </div>
      <div ref={containerRef} className="leaflet-container-inner" />
      {!state.fieldData && (
        <div className="map-no-data">Select a variable to see data overlay</div>
      )}
    </div>
  )
}
