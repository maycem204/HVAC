"use strict";

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function cityFromAddress(address = {}) {
  return address.city || address.town || address.village || address.municipality || address.county || address.state;
}

class NominatimGeocodingProvider {
  constructor({ baseUrl, userAgent }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.userAgent = userAgent;
    this.cache = new Map();
    this.requestChain = Promise.resolve();
    this.lastRequestAt = 0;
  }

  cached(key) {
    const value = this.cache.get(key);
    return !value || value.expiresAt < Date.now() ? null : value.data;
  }

  save(key, data) {
    this.cache.set(key, { data, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
    return data;
  }

  async request(path) {
    const run = async () => {
      const wait = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
      if (wait) await sleep(wait);
      this.lastRequestAt = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(`${this.baseUrl}${path}`, {
          headers: { "user-agent": this.userAgent, accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Geocoding HTTP ${response.status}`);
        return response.json();
      } finally {
        clearTimeout(timeout);
      }
    };
    const result = this.requestChain.then(run, run);
    this.requestChain = result.catch(() => undefined);
    return result;
  }

  async forward(query) {
    const place = String(query || "").trim();
    if (place.length < 2 || place.length > 160) return null;
    const key = `f:${place.toLocaleLowerCase("fr")}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const results = await this.request(`/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(place)}`);
    if (!Array.isArray(results) || results.length === 0) return null;
    const first = results[0];
    const city = cityFromAddress(first.address) || first.display_name?.split(",")[0] || place;
    return this.save(key, { lat: Number(first.lat), lng: Number(first.lon), city, district: first.address?.suburb || first.address?.city_district || city, countryCode: String(first.address?.country_code || "").toUpperCase(), country: first.address?.country || "" });
  }

  async reverse(lat, lng) {
    const latitude = Number(lat);
    const longitude = Number(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
    const key = `r:${latitude.toFixed(4)}:${longitude.toFixed(4)}`;
    const hit = this.cached(key);
    if (hit) return hit;
    const result = await this.request(`/reverse?format=jsonv2&addressdetails=1&zoom=14&lat=${latitude}&lon=${longitude}`);
    const city = cityFromAddress(result.address);
    if (!city) return null;
    return this.save(key, { lat: latitude, lng: longitude, city, district: result.address?.suburb || result.address?.city_district || city, countryCode: String(result.address?.country_code || "").toUpperCase(), country: result.address?.country || "" });
  }
}

module.exports = { NominatimGeocodingProvider };
