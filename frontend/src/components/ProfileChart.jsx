/**
 * ProfileChart.jsx
 *
 * Renders a vertical water-column profile as an SVG chart.
 * Shows temperature (and salinity when available) vs. depth.
 * All data comes from the /api/profile endpoint.
 *
 * Props:
 *   profileData   — response from /api/profile
 *   selectedDepth — currently selected depth (metres)
 */
import { useMemo } from "react"

const WIDTH = 240
const HEIGHT = 260
const PAD = { top: 12, right: 12, bottom: 32, left: 52 }
const CHART_W = WIDTH - PAD.left - PAD.right
const CHART_H = HEIGHT - PAD.top - PAD.bottom

function linspace(min, max, n) {
  return Array.from({ length: n }, (_, i) => min + (i * (max - min)) / (n - 1))
}

function lerp(a, b, t) {
  return a + t * (b - a)
}

function buildPath(depths, values, minD, maxD, minV, maxV) {
  if (!depths?.length) return ""
  const points = depths.map((d, i) => {
    const x = PAD.left + ((values[i] - minV) / Math.max(maxV - minV, 0.001)) * CHART_W
    const y = PAD.top + ((d - minD) / Math.max(maxD - minD, 0.001)) * CHART_H
    return `${x.toFixed(1)},${y.toFixed(1)}`
  })
  return `M${points.join("L")}`
}

export default function ProfileChart({ profileData, selectedDepth }) {
  const available = profileData?.available !== false

  const tempProfile = profileData?.profile?.temperature
  const saltProfile = profileData?.profile?.salinity

  const depths = tempProfile?.depths ?? saltProfile?.depths ?? []
  const tempVals = tempProfile?.values ?? []
  const saltVals = saltProfile?.values ?? []

  const maxDepth = depths.length ? Math.max(...depths) : 1000
  const minDepth = 0

  // Temperature axis
  const tempMin = tempVals.length ? Math.floor(Math.min(...tempVals)) : 0
  const tempMax = tempVals.length ? Math.ceil(Math.max(...tempVals)) : 30

  // Selected depth line
  const selectedY = useMemo(() => {
    if (selectedDepth == null || !depths.length) return null
    return PAD.top + ((selectedDepth - minDepth) / Math.max(maxDepth - minDepth, 0.001)) * CHART_H
  }, [selectedDepth, depths, maxDepth, minDepth])

  const tempPath = buildPath(depths, tempVals, minDepth, maxDepth, tempMin, tempMax)

  // Y-axis ticks (depth)
  const depthTicks = [0, 200, 400, 600, 800, 1000].filter(d => d <= maxDepth)

  // X-axis ticks (temperature)
  const tempRange = tempMax - tempMin
  const tickStep = tempRange < 5 ? 1 : tempRange < 10 ? 2 : 5
  const tempTicks = []
  for (let t = Math.ceil(tempMin / tickStep) * tickStep; t <= tempMax; t += tickStep) {
    tempTicks.push(t)
  }

  if (!profileData) {
    return (
      <div className="profile-empty">
        <span>Select an ocean location to view the vertical profile</span>
      </div>
    )
  }

  if (!available) {
    return (
      <div className="profile-empty">
        <span>{profileData.reason ?? "Profile unavailable at this location."}</span>
      </div>
    )
  }

  if (!depths.length) {
    return (
      <div className="profile-empty">
        <span>No profile data returned from dataset.</span>
      </div>
    )
  }

  return (
    <div className="profile-chart-wrapper">
      <div className="profile-meta-row">
        <span>
          {profileData.nearest_grid_lat?.toFixed(2)}°N,{" "}
          {profileData.nearest_grid_lon?.toFixed(2)}°E
        </span>
        <span className={`source-badge ${profileData.source === "NETCDF" ? "badge-netcdf" : "badge-synthetic"}`}>
          {profileData.source ?? "SYNTHETIC"}
        </span>
      </div>

      <svg width={WIDTH} height={HEIGHT} style={{ overflow: "visible" }}>
        <defs>
          <linearGradient id="tempGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#1e90ff" />
            <stop offset="100%" stopColor="#ff4500" />
          </linearGradient>
        </defs>

        {/* Background */}
        <rect
          x={PAD.left} y={PAD.top}
          width={CHART_W} height={CHART_H}
          fill="rgba(255,255,255,0.02)"
          rx={3}
        />

        {/* Grid lines */}
        {depthTicks.map((d) => {
          const y = PAD.top + ((d - minDepth) / Math.max(maxDepth - minDepth, 0.001)) * CHART_H
          return (
            <g key={d}>
              <line x1={PAD.left} y1={y} x2={PAD.left + CHART_W} y2={y}
                stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
              <text x={PAD.left - 5} y={y + 4} textAnchor="end"
                fontSize={9} fill="#6d8ba0">{d} m</text>
            </g>
          )
        })}

        {/* Temp axis ticks */}
        {tempTicks.map((t) => {
          const x = PAD.left + ((t - tempMin) / Math.max(tempMax - tempMin, 0.001)) * CHART_W
          return (
            <g key={t}>
              <line x1={x} y1={PAD.top} x2={x} y2={PAD.top + CHART_H}
                stroke="rgba(255,255,255,0.06)" strokeWidth={1} />
              <text x={x} y={PAD.top + CHART_H + 14} textAnchor="middle"
                fontSize={9} fill="#6d8ba0">{t}°</text>
            </g>
          )
        })}

        {/* Axes */}
        <line x1={PAD.left} y1={PAD.top} x2={PAD.left} y2={PAD.top + CHART_H}
          stroke="#24465b" strokeWidth={1.5} />
        <line x1={PAD.left} y1={PAD.top + CHART_H} x2={PAD.left + CHART_W} y2={PAD.top + CHART_H}
          stroke="#24465b" strokeWidth={1.5} />

        {/* Temperature profile */}
        {tempPath && (
          <>
            {/* Area fill */}
            <path
              d={`${tempPath}L${PAD.left + CHART_W},${PAD.top + CHART_H}L${PAD.left},${PAD.top + CHART_H}Z`}
              fill="url(#tempGradient)" opacity={0.12}
            />
            {/* Line */}
            <path d={tempPath} fill="none"
              stroke="url(#tempGradient)" strokeWidth={2.5}
              strokeLinejoin="round" strokeLinecap="round" />
            {/* Data points */}
            {depths.map((d, i) => {
              const x = PAD.left + ((tempVals[i] - tempMin) / Math.max(tempMax - tempMin, 0.001)) * CHART_W
              const y = PAD.top + ((d - minDepth) / Math.max(maxDepth - minDepth, 0.001)) * CHART_H
              return (
                <circle key={d} cx={x} cy={y} r={3}
                  fill="#3fd8ff" stroke="#020b16" strokeWidth={1}>
                  <title>{d}m: {tempVals[i].toFixed(2)}°C</title>
                </circle>
              )
            })}
          </>
        )}

        {/* Selected depth indicator */}
        {selectedY != null && (
          <g>
            <line x1={PAD.left} y1={selectedY} x2={PAD.left + CHART_W} y2={selectedY}
              stroke="#2faef2" strokeWidth={1.5} strokeDasharray="4,3" />
            <rect x={PAD.left + CHART_W - 30} y={selectedY - 9} width={30} height={14}
              fill="rgba(2,15,26,0.85)" rx={3} />
            <text x={PAD.left + CHART_W - 15} y={selectedY + 1} textAnchor="middle"
              fontSize={8.5} fill="#2faef2" fontWeight="bold">{selectedDepth}m</text>
          </g>
        )}

        {/* Axis labels */}
        <text x={PAD.left + CHART_W / 2} y={HEIGHT - 2} textAnchor="middle"
          fontSize={9} fill="#7594aa">Temperature (°C)</text>
        <text x={10} y={PAD.top + CHART_H / 2} textAnchor="middle"
          fontSize={9} fill="#7594aa"
          transform={`rotate(-90,10,${PAD.top + CHART_H / 2})`}>Depth (m)</text>
      </svg>

      {/* Summary values */}
      <div className="profile-summary">
        {tempVals.length > 0 && (
          <>
            <div className="profile-summary-row">
              <span>Surface</span>
              <span className="temp-value">{tempVals[0].toFixed(2)} °C</span>
            </div>
            <div className="profile-summary-row">
              <span>{Math.round(depths[depths.length - 1])} m</span>
              <span className="temp-value">{tempVals[tempVals.length - 1].toFixed(2)} °C</span>
            </div>
          </>
        )}
        {saltVals.length > 0 && (
          <div className="profile-summary-row">
            <span>Salinity (surface)</span>
            <span className="salt-value">{saltVals[0].toFixed(2)} PSU</span>
          </div>
        )}
      </div>
    </div>
  )
}
