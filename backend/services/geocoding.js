"use strict";

const { createGeocodingProvider } = require("../providers/maps/factory");

const providers = new Map();

function providerFor(config = {}) {
  const normalized = {
    provider: config.provider || process.env.GEOCODING_PROVIDER || "nominatim",
    baseUrl: config.baseUrl || "https://nominatim.openstreetmap.org",
    userAgent: config.userAgent || "QuoteAI-HVAC/1.0",
    apiKey: config.apiKey || process.env.GEOCODING_API_KEY || "",
  };
  const key = JSON.stringify(normalized);
  if (!providers.has(key)) providers.set(key, createGeocodingProvider(normalized));
  return providers.get(key);
}

class GeocodingService {
  constructor(config) { this.provider = providerFor(config); }
  forward(query) { return this.provider.forward(query); }
  reverse(lat, lng) { return this.provider.reverse(lat, lng); }
}

// Signatures historiques préservées pour toutes les routes API existantes.
function forwardGeocode(query, config) { return providerFor(config).forward(query); }
function reverseGeocode(lat, lng, config) { return providerFor(config).reverse(lat, lng); }

module.exports = { GeocodingService, forwardGeocode, reverseGeocode };
