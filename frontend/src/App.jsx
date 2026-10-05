import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { Canvas } from "@react-three/fiber"
import { OrbitControls } from "@react-three/drei"

const API = "http://127.0.0.1:8000"

const VARIABLE_META = {
  temperature: { label: "Temperature", unit: "°C", api: "temperature" },
  salinity: { label: "Salinity", unit: "PSU", api: "salinity" },
  currents: { label: "Currents", unit: "m/s", api: "current_speed" },
}

function getApiVariableName(variable) {
  return VARIABLE_META[variable]?.api ?? variable
}

function normalizeVariableKey(key) {
  if (["current_u", "current_v", "current_speed"].includes(key)) return "currents"
  return key
}

function fieldColor(value, min, max) {
  const t = Math.min(1, Math.max(0, (value - min) / Math.max(max - min, 0.001)))
  const color = new THREE.Color()
  color.setHSL(0.62 - t * 0.62, 0.9, 0.52)
  return color
}

function coordinate(lat, lon, bounds) {
  const x = ((lon - bounds.lonMin) / Math.max(bounds.lonMax - bounds.lonMin, 0.001) - 0.5) * 11
  const z = ((lat - bounds.latMin) / Math.max(bounds.latMax - bounds.latMin, 0.001) - 0.5) * 7
  return [x, z]
}

function OceanLayers({ data, activeDepth, verticalScale }) {
  const rows = data.latitude.length
  const cols = data.latitude[0].length

  const bounds = useMemo(() => ({
    latMin: Math.min(...data.latitude.flat()),
    latMax: Math.max(...data.latitude.flat()),
    lonMin: Math.min(...data.longitude.flat()),
    lonMax: Math.max(...data.longitude.flat()),
  }), [data])

  const layers = useMemo(() => {
    return data.depths.map((depth, depthIndex) => {
      const positions = []
      const colors = []
      const indices = []

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const [x, z] = coordinate(data.latitude[r][c], data.longitude[r][c], bounds)
          const raw = data.values[r * cols + c]
          const value = Array.isArray(raw) ? raw[depthIndex] : raw
          const y = -depth * 0.008 * verticalScale

          positions.push(x, y, z)
          const color = fieldColor(value, data.min, data.max)
          colors.push(color.r, color.g, color.b)
        }
      }

      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < cols - 1; c++) {
          const a = r * cols + c
          const b = a + 1
          const d = (r + 1) * cols + c
          const e = d + 1
          indices.push(a, b, d, b, e, d)
        }
      }

      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3))
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3))
      geometry.setIndex(indices)
      geometry.computeVertexNormals()
      return geometry
    })
  }, [data, rows, cols, bounds, verticalScale])

  return (
    <group>
      {layers.map((geometry, index) => {
        const active = index === activeDepth
        return (
          <mesh key={index} geometry={geometry}>
            <meshStandardMaterial
              vertexColors
              side={THREE.DoubleSide}
              transparent
              opacity={active ? 1 : 0.055}
              roughness={0.72}
              depthWrite={active}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function CurrentVectors({ uData, vData, activeDepth, bounds }) {
  const rows = uData.latitude.length
  const cols = uData.latitude[0].length
  const depthIndex = activeDepth

  const vectors = useMemo(() => {
    const result = []
    const step = 2

    for (let r = 0; r < rows; r += step) {
      for (let c = 0; c < cols; c += step) {
        const [x, z] = coordinate(uData.latitude[r][c], uData.longitude[r][c], bounds)
        const u = uData.values[r * cols + c][depthIndex]
        const v = vData.values[r * cols + c][depthIndex]
        const speed = Math.sqrt(u * u + v * v)
        const angle = Math.atan2(v, u)
        result.push({ x, z, speed, angle })
      }
    }
    return result
  }, [uData, vData, rows, cols, depthIndex, bounds])

  return (
    <group>
      {vectors.map((vector, index) => {
        const length = 0.28 + Math.min(vector.speed * 0.9, 0.65)
        return (
          <group key={index} position={[vector.x, -activeDepth * 0.008 + 0.04, vector.z]} rotation={[0, -vector.angle, 0]}>
            <mesh position={[length / 2, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.018, 0.018, length, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh position={[length, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
              <coneGeometry args={[0.07, 0.16, 6]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
          </group>
        )
      })}
    </group>
  )
}

function ObservationMarkers({ observations, bounds, onSelect }) {
  return (
    <group>
      {observations.map((observation) => {
        const [x, z] = coordinate(observation.latitude, observation.longitude, bounds)
        const isArgo = observation.type === "Argo"
        return (
          <mesh
            key={observation.id}
            position={[x, 0.13, z]}
            onClick={(event) => {
              event.stopPropagation()
              onSelect(observation)
            }}
          >
            <sphereGeometry args={[isArgo ? 0.11 : 0.14, 16, 16]} />
            <meshStandardMaterial
              color={isArgo ? "#38e6a5" : "#ffb84d"}
              emissive={isArgo ? "#145c45" : "#6d3e0a"}
              emissiveIntensity={1.5}
            />
          </mesh>
        )
      })}
    </group>
  )
}

function OceanGrid() {
  return <gridHelper args={[22, 22, "#12304a", "#071c2d"]} position={[0, 0.01, 0]} />
}

function ProfilePanel({ observation, variable, onClose }) {
  if (!observation) return null
  const values = observation.profile[variable === "salinity" ? "salinity" : "temperature"]
  const unit = variable === "salinity" ? "PSU" : "°C"

  return (
    <aside className="profile-panel">
      <div className="profile-header">
        <div>
          <span className="eyebrow">{observation.type} PROFILE</span>
          <h2>{observation.id}</h2>
        </div>
        <button onClick={onClose} aria-label="Close profile">×</button>
      </div>
      <div className="profile-meta">
        <span>{observation.latitude.toFixed(2)}° N</span>
        <span>{observation.longitude.toFixed(2)}° E</span>
        <span>{observation.timestamp.replace("T", " ").replace("Z", " UTC")}</span>
      </div>
      <div className="profile-chart">
        {observation.profile.depths.map((depth, index) => {
          const value = values[index]
          const min = Math.min(...values)
          const max = Math.max(...values)
          const x = 12 + ((value - min) / Math.max(max - min, 0.001)) * 76
          const y = 10 + (depth / 1000) * 190
          return <div key={depth} className="profile-point" style={{ left: `${x}%`, top: `${y}px` }} title={`${depth} m · ${value.toFixed(2)} ${unit}`} />
        })}
        <div className="profile-line" />
        <div className="profile-axis">0 m</div>
        <div className="profile-axis bottom">1000 m</div>
      </div>
      <div className="profile-values">
        <span>Surface {values[0].toFixed(2)} {unit}</span>
        <span>1000 m {values[values.length - 1].toFixed(2)} {unit}</span>
      </div>
    </aside>
  )
}

function App() {
  const [data, setData] = useState(null)
  const [uData, setUData] = useState(null)
  const [vData, setVData] = useState(null)
  const [observations, setObservations] = useState([])
  const [selectedObservation, setSelectedObservation] = useState(null)
  const [activeDepth, setActiveDepth] = useState(0)
  const [variable, setVariable] = useState("temperature")
  const [timeIndex, setTimeIndex] = useState(0)
  const [verticalScale, setVerticalScale] = useState(1)
  const [showArgo, setShowArgo] = useState(true)
  const [showGlider, setShowGlider] = useState(true)
  const [playing, setPlaying] = useState(false)
  const [metadata, setMetadata] = useState(null)
  const [sourceMode, setSourceMode] = useState("synthetic")

  useEffect(() => {
    async function loadMetadata() {
      const endpoints = [`${API}/api/ocean/metadata`, `${API}/ocean/metadata`]
      for (const endpoint of endpoints) {
        try {
          const response = await fetch(endpoint)
          if (!response.ok) continue
          const meta = await response.json()
          setMetadata(meta)
          setSourceMode(meta.source || "synthetic")
          if (meta.available_variables?.length) {
            const firstKey = normalizeVariableKey(meta.available_variables[0])
            setVariable((current) => {
              const normalizedCurrent = normalizeVariableKey(current)
              return meta.available_variables.some((item) => normalizeVariableKey(item) === normalizedCurrent) ? current : firstKey
            })
          }
          setTimeIndex((value) => Math.min(value, Math.max((meta.time_steps || 1) - 1, 0)))
          setActiveDepth((value) => Math.min(value, Math.max((meta.depth_levels?.length || 1) - 1, 0)))
          return
        } catch (error) {
          console.error(error)
        }
      }
      setSourceMode("synthetic")
      setMetadata({
        source: "synthetic",
        dataset_status: "missing",
        message: "No NetCDF dataset detected. Set OCEAN_NETCDF or place a file at backend/data/ocean.nc.",
        available_variables: ["temperature", "salinity", "currents"],
        time_steps: 12,
        depth_levels: Array.from({ length: 15 }, (_, index) => index * 70),
      })
    }

    loadMetadata()
  }, [])

  useEffect(() => {
    const apiVariable = getApiVariableName(variable)
    const params = new URLSearchParams({
      variable: apiVariable,
      time: String(timeIndex),
    })
    fetch(`${API}/api/ocean/field?${params}`)
      .then((response) => response.json())
      .then(setData)
      .catch(console.error)

    fetch(`${API}/api/observations?time_index=${timeIndex}`)
      .then((response) => response.json())
      .then((result) => setObservations(result.observations))
      .catch(console.error)
  }, [variable, timeIndex])

  useEffect(() => {
    if (variable !== "currents") {
      setUData(null)
      setVData(null)
      return
    }
    Promise.all([
      fetch(`${API}/api/ocean/field?variable=current_u&time=${timeIndex}`).then((r) => r.json()),
      fetch(`${API}/api/ocean/field?variable=current_v&time=${timeIndex}`).then((r) => r.json()),
    ])
      .then(([u, v]) => {
        setUData(u)
        setVData(v)
      })
      .catch(console.error)
  }, [variable, timeIndex])

  useEffect(() => {
    if (!playing) return undefined
    const timer = window.setInterval(() => {
      const total = metadata?.time_steps || 12
      setTimeIndex((value) => (value + 1) % total)
    }, 900)
    return () => window.clearInterval(timer)
  }, [playing])

  useEffect(() => {
    setSelectedObservation(null)
  }, [variable, timeIndex])

  if (!data) return <div className="loading">Loading OceanEmbed...</div>

  const rows = data.latitude.length
  const cols = data.latitude[0].length
  const depthCount = data.depths.length
  const depth = Math.round(data.depths[activeDepth])
  const meta = VARIABLE_META[variable] || VARIABLE_META.temperature
  const bounds = {
    latMin: Math.min(...data.latitude.flat()),
    latMax: Math.max(...data.latitude.flat()),
    lonMin: Math.min(...data.longitude.flat()),
    lonMax: Math.max(...data.longitude.flat()),
  }
  const visibleObservations = observations.filter((item) => item.type === "Argo" ? showArgo : showGlider)
  const legendLabel = variable === "currents" ? "Current speed" : meta.label
  const legendUnit = variable === "currents" ? "m/s" : meta.unit

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>OceanEmbed</h1>
          <p>Interactive 3D Ocean State Visualization</p>
        </div>
        <div className="status"><span /> {sourceMode === "netcdf" ? "NETCDF MODEL" : metadata?.dataset_status === "missing" ? "DATASET MISSING" : "DEMO MODEL"}</div>
      </header>

      <section className="stats">
        <div className="stat"><label>VARIABLE</label><strong>{meta.label}</strong></div>
        <div className="stat"><label>DEPTH</label><strong>{depth} m</strong></div>
        <div className="stat"><label>GRID</label><strong>{rows} × {cols} × {depthCount}</strong></div>
        <div className="stat"><label>TIME STEP</label><strong>{timeIndex + 1} / {metadata?.time_steps || 12}</strong></div>
      </section>

      <Canvas camera={{ position: [0, 7.5, 13], fov: 42, near: 0.1, far: 100 }} dpr={[1, 2]}>
        <color attach="background" args={["#020b16"]} />
        <ambientLight intensity={1.8} />
        <directionalLight position={[4, 10, 6]} intensity={2} />
        <directionalLight position={[-5, 4, -4]} intensity={0.8} />
        <OceanLayers data={data} activeDepth={activeDepth} verticalScale={verticalScale} />
        {variable === "currents" && uData && vData && <CurrentVectors uData={uData} vData={vData} activeDepth={activeDepth} bounds={bounds} />}
        <ObservationMarkers observations={visibleObservations} bounds={bounds} onSelect={setSelectedObservation} />
        <OceanGrid />
        <OrbitControls enableDamping dampingFactor={0.08} minDistance={8} maxDistance={25} minPolarAngle={0.45} maxPolarAngle={1.45} target={[0, -1.5, 0]} />
      </Canvas>

      <aside className="tool-panel">
        <div className="panel-title">DATA LAYERS</div>
        <div className="button-row">
          {Array.from(new Set((metadata?.available_variables?.length ? metadata.available_variables : Object.keys(VARIABLE_META)).map(normalizeVariableKey))).map((key) => {
            const item = VARIABLE_META[key] || { label: key, unit: "" }
            return (
              <button key={key} className={variable === key ? "active" : ""} onClick={() => setVariable(key)}>{item.label}</button>
            )
          })}
        </div>

        <div className="panel-title spaced">OBSERVATIONS</div>
        <label className="check"><input type="checkbox" checked={showArgo} onChange={(e) => setShowArgo(e.target.checked)} /> Argo floats <span>●</span></label>
        <label className="check"><input type="checkbox" checked={showGlider} onChange={(e) => setShowGlider(e.target.checked)} /> Gliders <span className="glider-dot">●</span></label>

        <div className="panel-title spaced">VERTICAL EXAGGERATION</div>
        <input type="range" min="0.5" max="2.5" step="0.1" value={verticalScale} onChange={(e) => setVerticalScale(Number(e.target.value))} />
        <div className="small-value">{verticalScale.toFixed(1)}×</div>
      </aside>

      <div className="control-panel">
        <div className="control-top">
          <div><label>DEPTH LEVEL</label><strong>{depth} m</strong></div>
          <span>{activeDepth + 1} / {depthCount}</span>
        </div>
        <input type="range" min="0" max={depthCount - 1} value={activeDepth} onChange={(e) => setActiveDepth(Number(e.target.value))} />
        <div className="labels"><span>0 m</span><span>{Math.round(data.depths[depthCount - 1])} m</span></div>

        <div className="time-row">
          <button className="play" onClick={() => setPlaying((value) => !value)}>{playing ? "Pause" : "Play"}</button>
          <div className="time-track">
            <input type="range" min="0" max={Math.max((metadata?.time_steps || 12) - 1, 0)} value={timeIndex} onChange={(e) => setTimeIndex(Number(e.target.value))} />
            <div className="labels"><span>T0</span><span>T{Math.max((metadata?.time_steps || 12) - 1, 0)}</span></div>
          </div>
        </div>
      </div>

      <div className="legend">
        <span>{legendLabel} · {legendUnit}</span>
        <div className="gradient" />
        <div className="legend-values"><span>{data.min.toFixed(1)}</span><span>{data.max.toFixed(1)}</span></div>
      </div>

      <div className="observation-hint">Click a green Argo or amber Glider marker to inspect its profile.</div>
      <ProfilePanel observation={selectedObservation} variable={variable} onClose={() => setSelectedObservation(null)} />
    </div>
  )
}

export default App
