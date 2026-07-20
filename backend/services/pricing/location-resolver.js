"use strict";

const PLACE_ALIASES = {
  "Tunisie": ["tunisie", "tunis", "sfax", "djerba", "jerba", "sousse", "monastir", "bizerte", "nabeul", "gabes", "kairouan", "ariana", "hammamet"],
  "Algérie": ["algerie", "alger", "alger centre", "oran", "constantine", "annaba", "setif", "tlemcen", "blida", "bejaia", "hydra", "kouba", "bab ezzouar"],
  "Maroc": ["maroc", "casablanca", "rabat", "marrakech", "fes", "tanger", "agadir", "meknes", "oujda"],
  "Libye": ["libye", "tripoli", "benghazi", "misrata"],
  "Égypte": ["egypte", "caire", "le caire", "alexandrie", "gizeh", "luxor"],
  "Arabie Saoudite": ["arabie saoudite", "riyad", "djeddah", "jeddah", "mecque", "medine"],
  "Émirats Arabes Unis": ["emirats arabes unis", "dubai", "abou dabi", "abu dhabi", "charjah", "sharjah"],
  "Qatar": ["qatar", "doha"],
  "Koweït": ["koweit", "kuwait"],
  "Bahreïn": ["bahrein", "manama"],
  "Oman": ["oman", "mascate", "muscat"],
  "Jordanie": ["jordanie", "amman", "aqaba"],
  "Liban": ["liban", "beyrouth", "beirut"],
  "Irak": ["irak", "bagdad", "baghdad", "bassora"],
};

const REFERENCE_POINTS = [
  [33.8076, 10.8451, "Tunisie"], [34.7406, 10.7603, "Tunisie"], [36.8065, 10.1815, "Tunisie"],
  [36.7538, 3.0588, "Algérie"], [35.6971, -0.6308, "Algérie"], [36.365, 6.6147, "Algérie"],
  [33.5731, -7.5898, "Maroc"], [34.0209, -6.8416, "Maroc"], [31.6295, -7.9811, "Maroc"],
  [32.8872, 13.1913, "Libye"], [30.0444, 31.2357, "Égypte"],
  [24.7136, 46.6753, "Arabie Saoudite"], [25.2048, 55.2708, "Émirats Arabes Unis"],
  [25.2854, 51.531, "Qatar"], [29.3759, 47.9774, "Koweït"], [26.2235, 50.5876, "Bahreïn"],
  [23.588, 58.3829, "Oman"], [31.9539, 35.9106, "Jordanie"], [33.8938, 35.5018, "Liban"], [33.3152, 44.3661, "Irak"],
];

const COUNTRY_CODE_ALIASES = {
  TN: "Tunisie", DZ: "Algérie", MA: "Maroc", LY: "Libye", EG: "Égypte",
  SA: "Arabie Saoudite", AE: "Émirats Arabes Unis", QA: "Qatar", KW: "Koweït",
  BH: "Bahreïn", OM: "Oman", JO: "Jordanie", LB: "Liban", IQ: "Irak",
};

function normalize(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function countryFromText(value) {
  const countryCode = String(value || "").trim().toUpperCase();
  if (COUNTRY_CODE_ALIASES[countryCode]) return COUNTRY_CODE_ALIASES[countryCode];
  const text = ` ${normalize(value)} `;
  if (text.trim().length === 0) return null;
  for (const [country, aliases] of Object.entries(PLACE_ALIASES)) {
    if (aliases.some((alias) => text.includes(` ${normalize(alias)} `))) return country;
  }
  return null;
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const toRad = (value) => value * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function countryFromCoordinates(lat, lng) {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  const nearest = REFERENCE_POINTS.reduce((best, [pointLat, pointLng, country]) => {
    const distance = distanceKm(latitude, longitude, pointLat, pointLng);
    return !best || distance < best.distance ? { country, distance } : best;
  }, null);
  return nearest && nearest.distance <= 350 ? nearest.country : null;
}

function resolvePricingCountry({ text, explicitCountry, instantLocation, profile }) {
  return countryFromText(text)
    || countryFromText(explicitCountry)
    || countryFromText(instantLocation?.city)
    || countryFromCoordinates(instantLocation?.lat, instantLocation?.lng)
    || countryFromText(profile?.country_code)
    || countryFromText(profile?.city)
    || countryFromText(profile?.address)
    || countryFromCoordinates(profile?.lat, profile?.lng)
    || null;
}

module.exports = { countryFromText, countryFromCoordinates, resolvePricingCountry };
