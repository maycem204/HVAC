"use strict";

const countryToCurrency = require("country-to-currency").default;
const { geocodingBaseUrl, geocodingUserAgent } = require("../env");
const { forwardGeocode } = require("./geocoding");

const CITY_COORDS = {
  alger: { lat: 36.7538, lng: 3.0588, city: "Alger" },
  "alger centre": { lat: 36.7753, lng: 3.0602, city: "Alger Centre" },
  hydra: { lat: 36.7472, lng: 3.0419, city: "Hydra" },
  kouba: { lat: 36.7333, lng: 3.0833, city: "Kouba" },
  "bab ezzouar": { lat: 36.7133, lng: 3.2125, city: "Bab Ezzouar" },
  oran: { lat: 35.6971, lng: -0.6308, city: "Oran" },
  constantine: { lat: 36.365, lng: 6.6147, city: "Constantine" },
  tunis: { lat: 36.8065, lng: 10.1815, city: "Tunis" },
  sfax: { lat: 34.7406, lng: 10.7603, city: "Sfax" },
  djerba: { lat: 33.8076, lng: 10.8451, city: "Djerba" },
  "houmt souk": { lat: 33.8758, lng: 10.8575, city: "Houmt Souk" },
  casablanca: { lat: 33.5731, lng: -7.5898, city: "Casablanca" },
};

function marketFromCity(city) {
  const value = String(city || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/(alger|oran|constantine|annaba|setif|blida|dzair)/.test(value)) return { countryCode: "DZ", currency: "DZD" };
  if (/(tunis|sfax|djerba|sousse|bizerte|gabes|kairouan|monastir)/.test(value)) return { countryCode: "TN", currency: "TND" };
  if (/(casablanca|rabat|marrakech|fes|tanger|agadir|meknes|oujda)/.test(value)) return { countryCode: "MA", currency: "MAD" };
  return null;
}

function haversineKm(aLat, aLng, bLat, bLng) {
  if ([aLat, aLng, bLat, bLng].some((n) => n == null || Number.isNaN(Number(n)))) return null;
  const toRad = (n) => Number(n) * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}

async function saveTechnicianRating(client, { clientId, technicianId, rating, comment }) {
  await client.query(
    `INSERT INTO technician_ratings (client_id, technician_id, rating, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, technician_id) DO UPDATE SET
       rating = EXCLUDED.rating, comment = EXCLUDED.comment, updated_at = now()`,
    [clientId, technicianId, rating, comment]
  );
  const stats = await client.query(
    `SELECT AVG(rating)::numeric(2,1) AS avg_rating, COUNT(*)::int AS reviews_count
     FROM technician_ratings WHERE technician_id = $1`,
    [technicianId]
  );
  await client.query(
    `UPDATE technician_profiles SET rating = $1, reviews_count = $2 WHERE user_id = $3`,
    [stats.rows[0].avg_rating || 0, stats.rows[0].reviews_count || 0, technicianId]
  );
  return { rating: Number(stats.rows[0].avg_rating || 0), reviews_count: Number(stats.rows[0].reviews_count || 0) };
}

function minutesOf(value) {
  if (!value) return null;
  const [h, m] = String(value).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function timeRangesOverlap(startA, endA, startB, endB) {
  const ranges = (start, end) => end > start ? [[start, end]] : [[start, 1440], [0, end]];
  return ranges(startA, endA).some(([a1, a2]) => ranges(startB, endB).some(([b1, b2]) => a1 < b2 && b1 < a2));
}

function normalizedSpecialty(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function specialtyMatches(specializations, requested) {
  const wanted = normalizedSpecialty(requested);
  const groups = { climatisation: ["climatis", "refriger", "multi split", "split"], chauffage: ["chauff", "chaudiere", "pompe a chaleur"], ventilation: ["ventil"], installation: ["installation", "pose"] };
  const expected = groups[wanted] || [wanted];
  return (specializations || []).some((value) => {
    const normalized = normalizedSpecialty(value).replace(/-/g, " ");
    return expected.some((item) => normalized.includes(item) || item.includes(normalized));
  });
}

function sqlDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function createApplicationSupport(pool) {
  async function technicianMarket(technicianId) {
    const result = await pool.query("SELECT city, country_code, currency FROM users WHERE id = $1", [technicianId]);
    const user = result.rows[0] || {};
    if (user.country_code && user.currency) return { countryCode: user.country_code, currency: user.currency };
    let place = null;
    try { place = await forwardGeocode(user.city, { baseUrl: geocodingBaseUrl, userAgent: geocodingUserAgent }); } catch {}
    const market = place?.countryCode && countryToCurrency[place.countryCode]
      ? { countryCode: place.countryCode, currency: countryToCurrency[place.countryCode] }
      : marketFromCity(user.city);
    if (!market) throw Object.assign(new Error("Ville introuvable. Précisez la ville et le pays dans votre profil, par exemple « Lyon, France »."), { status: 400 });
    await pool.query("UPDATE users SET country_code=$1, currency=$2 WHERE id=$3", [market.countryCode, market.currency, technicianId]);
    return market;
  }

  async function isTechnicianAvailable(technicianId, date, time) {
    if (!date || !time) return { available: false, reason: "Choisissez une date et une heure." };
    const requestedMinute = minutesOf(time);
    const booked = await pool.query(
      `SELECT id, time, duration FROM appointments
       WHERE technician_id = $1 AND date = $2 AND status IN ('pending', 'confirmed')`,
      [technicianId, date]
    );
    const appointmentConflict = booked.rows.some((appointment) => {
      const start = minutesOf(appointment.time);
      const duration = Number.parseFloat(String(appointment.duration || "2h")) || 2;
      return start != null && timeRangesOverlap(requestedMinute, requestedMinute + 120, start, start + duration * 60);
    });
    if (appointmentConflict) return { available: false, reason: "Ce créneau est déjà réservé." };

    const blocks = await pool.query(`SELECT * FROM blocked_slots WHERE technician_id = $1`, [technicianId]);
    const requested = new Date(`${date}T00:00:00`);
    const dow = (requested.getDay() + 6) % 7;
    const schedule = await pool.query(
      `SELECT enabled, start_time, end_time
       FROM technician_working_hours WHERE technician_id = $1 AND week_day = $2`,
      [technicianId, dow]
    );
    const workingHours = schedule.rows[0];
    if (workingHours) {
      const workStart = minutesOf(workingHours.start_time);
      const workEnd = minutesOf(workingHours.end_time);
      if (!workingHours.enabled || requestedMinute == null || workStart == null || workEnd == null
        || requestedMinute < workStart || requestedMinute + 120 > workEnd) {
        return { available: false, reason: "Ce créneau est en dehors des horaires de travail du technicien." };
      }
    }
    const blocked = blocks.rows.some((slot) => {
      const applies = (slot.type === "specific" && String(slot.date).slice(0, 10) === date)
        || (slot.type === "weekly" && (slot.week_days || []).includes(dow)) || slot.type === "daily";
      if (!applies) return false;
      const start = minutesOf(slot.start_time);
      const end = minutesOf(slot.end_time);
      return start == null || end == null || requestedMinute == null || timeRangesOverlap(requestedMinute, requestedMinute + 120, start, end);
    });
    return blocked ? { available: false, reason: "Le technicien est indisponible sur ce créneau." } : { available: true };
  }

  return { isTechnicianAvailable, technicianMarket };
}

module.exports = {
  CITY_COORDS,
  createApplicationSupport,
  haversineKm,
  normalizedSpecialty,
  saveTechnicianRating,
  specialtyMatches,
  sqlDate,
};
