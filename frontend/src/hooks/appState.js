/**
 * appState.js — global application state using useReducer.
 *
 * Single source of truth for:
 *   - selectedLat / selectedLon
 *   - selectedDepth (metres)
 *   - selectedVariable
 *   - timeIndex
 *   - metadata
 *   - locationData (from /api/location)
 *   - profileData  (from /api/profile)
 *   - fieldData    (from /api/ocean/field)
 *   - observations
 *   - ui flags (loading, errors, panels)
 */
import { useReducer, useCallback } from "react"

export const INITIAL_STATE = {
  // Selected location (null = nothing selected)
  selectedLat: null,
  selectedLon: null,
  selectedDepth: 0,      // metres
  depthIndex: 0,          // index into depth_levels array
  selectedVariable: "temperature",
  timeIndex: 0,

  // Backend data
  metadata: null,
  fieldData: null,
  locationData: null,
  profileData: null,
  observations: [],

  // UI state
  loading: { metadata: true, field: false, location: false, profile: false },
  errors: { metadata: null, field: null, location: null, profile: null },

  // Panel visibility
  showSciPanel: false,
  showProfilePanel: false,
  showMapPanel: true,

  // Globe state
  globeAnimation: false,

  // Observation filter
  showArgo: true,
  showGlider: true,
}

function reducer(state, action) {
  switch (action.type) {
    case "SET_METADATA":
      return { ...state, metadata: action.payload, loading: { ...state.loading, metadata: false } }
    case "SET_FIELD":
      return { ...state, fieldData: action.payload, loading: { ...state.loading, field: false } }
    case "SET_LOCATION":
      return {
        ...state,
        locationData: action.payload,
        showSciPanel: true,
        loading: { ...state.loading, location: false },
        errors: { ...state.errors, location: null },
      }
    case "SET_PROFILE":
      return {
        ...state,
        profileData: action.payload,
        showProfilePanel: action.payload?.available !== false,
        loading: { ...state.loading, profile: false },
        errors: { ...state.errors, profile: null },
      }
    case "SET_OBSERVATIONS":
      return { ...state, observations: action.payload }
    case "SELECT_LOCATION":
      return {
        ...state,
        selectedLat: action.lat,
        selectedLon: action.lon,
        locationData: null,
        profileData: null,
        showSciPanel: false,
        showProfilePanel: false,
        loading: { ...state.loading, location: true, profile: true },
      }
    case "SET_DEPTH": {
      const depthLevels = state.metadata?.depth_levels ?? []
      const idx = depthLevels.length > 0
        ? depthLevels.reduce((best, d, i) =>
            Math.abs(d - action.depthM) < Math.abs(depthLevels[best] - action.depthM) ? i : best, 0)
        : 0
      return {
        ...state,
        selectedDepth: action.depthM,
        depthIndex: idx,
        locationData: null,  // will refetch
        loading: { ...state.loading, location: state.selectedLat != null },
      }
    }
    case "SET_DEPTH_INDEX": {
      const depthLevels = state.metadata?.depth_levels ?? []
      const depthM = depthLevels[action.index] ?? 0
      return { ...state, depthIndex: action.index, selectedDepth: depthM, locationData: null }
    }
    case "SET_VARIABLE":
      return { ...state, selectedVariable: action.variable, fieldData: null }
    case "SET_TIME_INDEX":
      return {
        ...state,
        timeIndex: action.index,
        fieldData: null,
        locationData: null,
      }
    case "SET_LOADING":
      return { ...state, loading: { ...state.loading, ...action.flags } }
    case "SET_ERROR":
      return { ...state, errors: { ...state.errors, ...action.errors }, loading: { ...state.loading, ...Object.fromEntries(Object.keys(action.errors).map(k => [k, false])) } }
    case "CLEAR_SELECTION":
      return {
        ...state,
        selectedLat: null,
        selectedLon: null,
        locationData: null,
        profileData: null,
        showSciPanel: false,
        showProfilePanel: false,
      }
    case "TOGGLE_MAP_PANEL":
      return { ...state, showMapPanel: !state.showMapPanel }
    case "TOGGLE_PROFILE_PANEL":
      return { ...state, showProfilePanel: !state.showProfilePanel }
    case "TOGGLE_ANIMATION":
      return { ...state, globeAnimation: !state.globeAnimation }
    case "TOGGLE_ARGO":
      return { ...state, showArgo: action.checked }
    case "TOGGLE_GLIDER":
      return { ...state, showGlider: action.checked }
    default:
      return state
  }
}

export function useAppState() {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const send = useCallback((action) => dispatch(action), [])
  return [state, send]
}
