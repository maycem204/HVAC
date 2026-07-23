"use strict";

const { NominatimGeocodingProvider } = require("./nominatim-geocoding-provider");

function createGeocodingProvider(config) {
  const provider = String(config.provider || "nominatim").toLowerCase();
  if (provider === "nominatim") return new NominatimGeocodingProvider(config);
  throw new Error(`Unsupported GEOCODING_PROVIDER: ${provider}`);
}

module.exports = { createGeocodingProvider };
