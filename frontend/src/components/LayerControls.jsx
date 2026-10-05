/**
 * LayerControls.jsx
 *
 * Left sidebar with:
 * - Variable selector
 * - Depth slider
 * - Time slider + play/pause
 * - Legend
 * - Dataset status
 */
import { useCallback } from "react"

const VARIABLE_META = {
  temperature: { label: "Temperature", unit: "°C", color: "#ff6b35" },
  salinity:    { label: "Salinity",    unit: "PSU", color: "#38d9f5" },
  currents:    { label: "Currents",    unit: "m/s", color: "#a8e063" },
}

export default function LayerControls({ state, dispatch }) {
  const meta = state.metadata
  const depthLevels = meta?.depth_levels ?? []
  const timeSteps = meta?.time_steps ?? 12

  const setVariable = useCallback((v) => {
    dispatch({ type: "SET_VARIABLE", variable: v })
  }, [dispatch])

  const setDepthIndex = useCallback((idx) => {
    dispatch({ type: "SET_DEPTH_INDEX", index: idx })
  }, [dispatch])

  const setTimeIndex = useCallback((idx) => {
    dispatch({ type: "SET_TIME_INDEX", index: idx })
  }, [dispatch])

  const availableVars = meta?.available_variables
    ? [...new Set(meta.available_variables.map(v => {
        if (["current_u","current_v","current_speed"].includes(v)) return "currents"
        return v
      }))]
    : Object.keys(VARIABLE_META)

  const fd = state.fieldData
  const currentDepth = depthLevels[state.depthIndex] ?? state.selectedDepth

  return (
    <aside className="layer-controls">
      {/* Dataset status */}
      <div className="dataset-status">
        <span className={`status-dot ${meta?.source === "netcdf" ? "dot-live" : "dot-synth"}`} />
        <span>{meta?.source === "netcdf" ? "NETCDF DATASET" : "SYNTHETIC MODEL"}</span>
      </div>

      {/* Variable selector */}
      <div className="ctrl-section">
        <div className="ctrl-label">VARIABLE</div>
        <div className="var-buttons">
          {availableVars.map((v) => {
            const info = VARIABLE_META[v] ?? { label: v, unit: "" }
            return (
              <button
                key={v}
                className={`var-btn ${state.selectedVariable === v ? "active" : ""}`}
                onClick={() => setVariable(v)}
                style={{ "--accent": info.color }}
              >
                {info.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Depth slider */}
      {depthLevels.length > 0 && (
        <div className="ctrl-section">
          <div className="ctrl-label">DEPTH</div>
          <div className="depth-readout">{Math.round(currentDepth)} m</div>
          <input
            type="range"
            min={0}
            max={depthLevels.length - 1}
            value={state.depthIndex}
            onChange={(e) => setDepthIndex(Number(e.target.value))}
            className="depth-slider"
          />
          <div className="slider-labels">
            <span>0 m</span>
            <span>{Math.round(depthLevels[depthLevels.length - 1])} m</span>
          </div>
          <div className="depth-presets">
            {[0, 50, 100, 200, 500, 1000].map((d) => {
              if (d > (depthLevels[depthLevels.length - 1] ?? 1000)) return null
              const nearestIdx = depthLevels.reduce((best, depth, i) =>
                Math.abs(depth - d) < Math.abs(depthLevels[best] - d) ? i : best, 0)
              return (
                <button key={d}
                  className={`depth-preset-btn ${state.depthIndex === nearestIdx ? "active" : ""}`}
                  onClick={() => setDepthIndex(nearestIdx)}
                >
                  {d}m
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Time control */}
      <div className="ctrl-section">
        <div className="ctrl-label">TIME STEP</div>
        <div className="time-row-ctrl">
          <button
            className="play-btn"
            onClick={() => dispatch({ type: "TOGGLE_ANIMATION" })}
          >
            {state.globeAnimation ? "⏸" : "▶"}
          </button>
          <span className="time-readout">{state.timeIndex + 1} / {timeSteps}</span>
        </div>
        <input
          type="range"
          min={0}
          max={Math.max(timeSteps - 1, 0)}
          value={state.timeIndex}
          onChange={(e) => setTimeIndex(Number(e.target.value))}
          className="depth-slider"
        />
        <div className="slider-labels">
          <span>T₀</span>
          <span>T{Math.max(timeSteps - 1, 0)}</span>
        </div>
      </div>

      {/* Legend */}
      {fd && (
        <div className="ctrl-section">
          <div className="ctrl-label">COLOR SCALE</div>
          <div className="legend-label">
            {VARIABLE_META[state.selectedVariable]?.label ?? state.selectedVariable} ·{" "}
            {VARIABLE_META[state.selectedVariable]?.unit ?? ""}
          </div>
          <div className="legend-gradient" />
          <div className="legend-values">
            <span>
              {state.selectedVariable === "temperature"
                ? "4.0 °C"
                : state.selectedVariable === "salinity"
                  ? "32.0 PSU"
                  : fd.min?.toFixed(1)}
            </span>
            <span>
              {state.selectedVariable === "temperature"
                ? "32.0 °C"
                : state.selectedVariable === "salinity"
                  ? "38.0 PSU"
                  : fd.max?.toFixed(1)}
            </span>
          </div>
          {fd.min != null && (
            <div style={{ fontSize: "11px", color: "#6d8ba0", marginTop: "4px" }}>
              Slice range: {fd.min.toFixed(1)} – {fd.max.toFixed(1)} {VARIABLE_META[state.selectedVariable]?.unit ?? ""}
            </div>
          )}
        </div>
      )}

      {/* Observation layer toggles */}
      <div className="ctrl-section">
        <div className="ctrl-label">OBSERVATIONS</div>
        <label className="check-row">
          <input
            type="checkbox"
            defaultChecked
            onChange={(e) => dispatch({ type: "TOGGLE_ARGO", checked: e.target.checked })}
          />
          <span className="obs-dot argo-dot">●</span> Argo floats
          <span className="badge-small badge-synthetic">SYNTHETIC</span>
        </label>
        <label className="check-row">
          <input
            type="checkbox"
            defaultChecked
            onChange={(e) => dispatch({ type: "TOGGLE_GLIDER", checked: e.target.checked })}
          />
          <span className="obs-dot glider-dot">●</span> Gliders
          <span className="badge-small badge-synthetic">SYNTHETIC</span>
        </label>
      </div>
    </aside>
  )
}
