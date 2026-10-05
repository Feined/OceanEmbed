/**
 * SciPanel.jsx
 *
 * Scientific location analysis panel.
 * Shows land/ocean classification, variable values, bathymetry,
 * dataset coverage, and source badges.
 *
 * Appears only after a location is selected.
 *
 * Props:
 *   state    — global app state
 *   dispatch — dispatch function
 */
import ProfileChart from "./ProfileChart"

function Badge({ type }) {
  const classes = {
    OBSERVATION: "badge-obs",
    MODEL: "badge-model",
    SYNTHETIC: "badge-synthetic",
    NETCDF: "badge-netcdf",
    DERIVED: "badge-derived",
    "NO DATA": "badge-nodata",
    APPROXIMATE_SYNTHETIC: "badge-approx",
  }
  return (
    <span className={`data-badge ${classes[type] ?? ""}`}>{type}</span>
  )
}

function DataRow({ label, value, unit, badge, na }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className="data-value">
        {na ? <span className="na-value">N/A</span> : (
          <>
            {value != null ? (
              <>{typeof value === "number" ? value.toFixed(2) : value}
                {unit && <span className="data-unit"> {unit}</span>}
              </>
            ) : <span className="na-value">N/A</span>}
            {badge && <Badge type={badge} />}
          </>
        )}
      </span>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="sci-section">
      <div className="sci-section-title">{title}</div>
      {children}
    </div>
  )
}

export default function SciPanel({ state, dispatch }) {
  const { locationData, profileData, selectedLat, selectedLon, selectedDepth, selectedVariable, loading } = state

  if (selectedLat == null) {
    return (
      <aside className="sci-panel sci-panel-idle">
        <div className="sci-idle-msg">
          <div className="sci-idle-icon">🌊</div>
          <h3>Select an ocean location to begin analysis</h3>
          <p>Click anywhere on the globe or the 2D map to retrieve oceanographic data for that point.</p>
        </div>
      </aside>
    )
  }

  const isLoading = loading.location || loading.profile
  const ld = locationData

  const env = ld?.environment
  const isOcean = env === "ocean"
  const hasCoverage = ld?.dataset_coverage === true

  const tempVar = ld?.variables?.temperature
  const saltVar = ld?.variables?.salinity

  return (
    <aside className="sci-panel">
      {/* Header */}
      <div className="sci-panel-header">
        <span className="panel-eyebrow">LOCATION ANALYSIS</span>
        <button
          className="close-btn"
          onClick={() => dispatch({ type: "CLEAR_SELECTION" })}
          aria-label="Clear selection"
        >×</button>
      </div>

      {/* Location coordinates */}
      <Section title="LOCATION">
        <DataRow label="Latitude" value={selectedLat?.toFixed(5)} unit="°" />
        <DataRow label="Longitude" value={selectedLon?.toFixed(5)} unit="°" />
        {isLoading ? (
          <div className="loading-row">Loading…</div>
        ) : (
          <>
            <DataRow
              label="Environment"
              value={ld?.environment ?? "—"}
            />
            {ld?.region && <DataRow label="Region" value={ld.region} />}
            {ld?.nearest_grid_cell && (
              <DataRow
                label="Nearest grid"
                value={`${ld.nearest_grid_cell.lat.toFixed(2)}°N, ${ld.nearest_grid_cell.lon.toFixed(2)}°E`}
              />
            )}
          </>
        )}
      </Section>

      {/* Dataset coverage notice */}
      {!isLoading && ld && (
        <div className={`coverage-banner ${hasCoverage ? "coverage-ok" : "coverage-none"}`}>
          {hasCoverage
            ? "✓ Within OceanEmbed dataset coverage"
            : env === "land"
              ? "⚠ Land — oceanographic data unavailable"
              : `⚠ Outside OceanEmbed dataset coverage (${ld?.dataset_lat_range?.[0]}–${ld?.dataset_lat_range?.[1]}°N, ${ld?.dataset_lon_range?.[0]}–${ld?.dataset_lon_range?.[1]}°E)`
          }
        </div>
      )}

      {/* Temperature */}
      {(hasCoverage || isLoading) && (
        <Section title="TEMPERATURE">
          {isLoading ? (
            <div className="loading-row">Loading…</div>
          ) : (
            <>
              <DataRow
                label="Value"
                value={tempVar?.available ? tempVar.value : null}
                unit={tempVar?.unit ?? "°C"}
                badge={tempVar?.available ? tempVar.source : undefined}
                na={!tempVar?.available}
              />
              <DataRow label="Depth" value={selectedDepth} unit="m" />
              {tempVar?.available === false && (
                <div className="na-reason">{tempVar.reason}</div>
              )}
            </>
          )}
        </Section>
      )}

      {/* Salinity */}
      {hasCoverage && !isLoading && (
        <Section title="SALINITY">
          <DataRow
            label="Value"
            value={saltVar?.available ? saltVar.value : null}
            unit={saltVar?.unit ?? "PSU"}
            badge={saltVar?.available ? saltVar.source : undefined}
            na={!saltVar?.available}
          />
          {saltVar?.available === false && (
            <div className="na-reason">{saltVar.reason}</div>
          )}
        </Section>
      )}

      {/* Bathymetry */}
      {isOcean && !isLoading && ld?.bathymetry_m != null && (
        <Section title="SEAFLOOR">
          <DataRow
            label="Seafloor depth"
            value={ld.bathymetry_m.toFixed(0)}
            unit="m"
            badge={ld.bathymetry_source}
          />
        </Section>
      )}

      {/* Vertical profile */}
      {(hasCoverage || profileData) && (
        <Section title="VERTICAL PROFILE">
          {loading.profile ? (
            <div className="loading-row">Loading profile…</div>
          ) : (
            <ProfileChart
              profileData={profileData}
              selectedDepth={selectedDepth}
            />
          )}
        </Section>
      )}

      {/* Data sources footer */}
      <div className="sci-footer">
        <span className="sci-footer-title">DATA SOURCES</span>
        <div className="sci-footer-sources">
          <div>Globe: NASA Blue Marble (public domain)</div>
          <div>Basemap: CartoDB / OpenStreetMap</div>
          <div>Ocean data: {state.metadata?.source === "netcdf" ? `NetCDF (${state.metadata.dataset_path?.split(/[\\/]/).pop()})` : "OceanEmbed Synthetic Model"}</div>
          <div>Bathymetry: Parametric approximation (not GEBCO)</div>
        </div>
      </div>
    </aside>
  )
}
