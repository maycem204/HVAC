"use strict";

const cache = new Map();
let requestChain = Promise.resolve();
let lastRequestAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cached(key) {
  const value = cache.get(key);
  if (!value || value.expiresAt < Date.now()) return null;
  return value.data;
}

function save(key, data) {
  cache.set(key, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return data;
}

async function nominatim(path, { baseUrl, userAgent }) {
  const run = async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequestAt));
    if (wait) await sleep(wait);
    lastRequestAt = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
        headers: { "user-agent": userAgent, accept: "application/json" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  };
  const result = requestChain.then(run, run);
  requestChain = result.catch(() => undefined);
  return result;
}

function cityFromAddress(address = {}) {
  return address.city || address.town || address.village || address.municipality || address.county || address.state;
}

async function forwardGeocode(query, config) {
  const place = String(query || "").trim();
  if (place.length < 2 || place.length > 160) return null;
  const key = `f:${place.toLocaleLowerCase("fr")}`;
  const hit = cached(key);
  if (hit) return hit;
  const results = await nominatim(`/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`, config);
  if (!Array.isArray(results) || results.length === 0) return null;
  const first = results[0];
  const city = cityFromAddress(first.address) || first.display_name?.split(",")[0] || place;
  return save(key, { lat: Number(first.lat), lng: Number(first.lon), city, district: first.address?.suburb || first.address?.city_district || city });
}

async function reverseGeocode(lat, lng, config) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  const key = `r:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
  const hit = cached(key);
  if (hit) return hit;
  const result = await nominatim(`/reverse?format=jsonv2&addressdetails=1&zoom=14&lat=${latitude}&lon=${longitude}`, config);
  const city = cityFromAddress(result.address);
  if (!city) return null;
  return save(key, { lat: latitude, lng: longitude, city, district: result.address?.suburb || result.address?.city_district || city });
}

module.exports = { forwardGeocode, reverseGeocode };
