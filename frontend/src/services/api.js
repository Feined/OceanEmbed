/**
 * api.js — centralized API client for OceanEmbed backend.
 * All fetch calls go through here. Handles errors gracefully.
 */

const BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"

async function fetchJSON(url, signal) {
  const res = await fetch(url, signal ? { signal } : undefined)
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`API ${res.status}: ${text}`)
  }
  return res.json()
}

export async function fetchMetadata(signal) {
  return fetchJSON(`${BASE}/api/ocean/metadata`, signal)
}

export async function fetchField({ variable, timeIndex, depthIndex }, signal) {
  const params = new URLSearchParams({ variable, time: String(timeIndex) })
  if (depthIndex != null) params.set("depth", String(depthIndex))
  return fetchJSON(`${BASE}/api/ocean/field?${params}`, signal)
}

export async function fetchLocation({ lat, lon, depth, time }, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    depth: String(depth ?? 0),
    time: String(time ?? 0),
  })
  return fetchJSON(`${BASE}/api/location?${params}`, signal)
}

export async function fetchProfile({ lat, lon, time }, signal) {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lon),
    time: String(time ?? 0),
  })
  return fetchJSON(`${BASE}/api/profile?${params}`, signal)
}

export async function fetchObservations(timeIndex, signal) {
  return fetchJSON(`${BASE}/api/observations?time_index=${timeIndex}`, signal)
}

export async function fetchBathymetry({ lat, lon }, signal) {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) })
  return fetchJSON(`${BASE}/api/bathymetry?${params}`, signal)
}

export const API_BASE = BASE
