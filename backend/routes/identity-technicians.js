"use strict";

const express = require("express");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const auth = require("../middleware/auth");
const { signToken, requireRole } = require("../middleware/auth");
const { geocodingBaseUrl, geocodingUserAgent } = require("../env");
const { hashPassword, verifyPassword, validatePassword } = require("../utils/password");
const { forwardGeocode, reverseGeocode } = require("../services/geocoding");
const { parseTariffFile } = require("../services/tariff-file-parser");
const {
  CITY_COORDS, createApplicationSupport, haversineKm, saveTechnicianRating,
  specialtyMatches, sqlDate,
} = require("../services/application-support");
const pool = require("../db");
const { emitToUser } = require("../realtime");

const router = express.Router();
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const geocodeLimiter = rateLimit({ windowMs: 1000, limit: 1, standardHeaders: "draft-8", legacyHeaders: false });
const tariffUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
const { isTechnicianAvailable, technicianMarket } = createApplicationSupport(pool);

router.get("/test", (req, res) => {
  res.json({ message: "Backend OK" });
});
router.get("/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});

/* ===================== REGISTER ===================== */
router.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, city, phone, address } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 100) return res.status(400).json({ error: "Nom invalide" });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Email invalide" });
    const passwordError = validatePassword(password, { name, email });
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (!['client', 'technician'].includes(role)) return res.status(400).json({ error: "Rôle invalide" });
    if (role === "technician" && (typeof city !== "string" || city.trim().length < 2 || city.length > 120)) {
      return res.status(400).json({ error: "La ville ou la localisation du local professionnel est obligatoire" });
    }

    const hashedPassword = await hashPassword(password);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role, city, phone, address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, email, role, city, phone, address, avatar`,
      [name, email, hashedPassword, role, city || null, phone || null, address || null]
    );

    const user = result.rows[0];
    if (role === "technician") {
      await pool.query(
        `INSERT INTO technician_profiles (user_id, specializations, radius_km, response_time, available)
         VALUES ($1, '{}', 10, '30 min', true)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id]
      );
    }
    const token = signToken(user);
    res.json({ token, user });
  } catch (err) {
    if (err.code === "23505") return res.status(409).json({ error: "Un compte existe déjà avec cet email" });
    console.error(err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ===================== LOGIN ===================== */
router.post("/login", authLimiter, async (req, res) => {
  try {
    const { email, password, role } = req.body || {};
    if (typeof email !== "string" || typeof password !== "string") return res.status(400).json({ error: "Identifiants invalides" });

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const user = userResult.rows[0];

    // Vérifier si le rôle correspond
    if (role && user.role !== role) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const valid = await verifyPassword(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Email ou mot de passe incorrect" });
    }

    const token = signToken(user);

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur interne" });
  }
});

/* ===================== TECHNICIANS ===================== */
router.get("/technicians", auth, async (req, res) => {
  try {
    const clientLat = req.query.lat != null ? Number(req.query.lat) : null;
    const clientLng = req.query.lng != null ? Number(req.query.lng) : null;
    if ((clientLat != null || clientLng != null) && (!Number.isFinite(clientLat) || !Number.isFinite(clientLng) || Math.abs(clientLat) > 90 || Math.abs(clientLng) > 180)) {
      return res.status(400).json({ error: "Coordonnées invalides" });
    }
    const wantedSpecs = String(req.query.specializations || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.city, u.lat, u.lng, u.avatar,
        t.specializations, t.rating, t.reviews_count,
        t.available, t.response_time, t.radius_km,
        EXISTS (
          SELECT 1 FROM appointments a
          WHERE a.client_id = $1 AND a.technician_id = u.id AND a.status = 'completed'
        ) OR EXISTS (
          SELECT 1 FROM conversations c
          WHERE c.client_id = $1 AND c.technician_id = u.id
        ) AS can_rate,
        (SELECT r.rating FROM technician_ratings r
         WHERE r.client_id = $1 AND r.technician_id = u.id LIMIT 1) AS my_rating,
        (SELECT r.comment FROM technician_ratings r
         WHERE r.client_id = $1 AND r.technician_id = u.id LIMIT 1) AS my_rating_comment,
        EXISTS (SELECT 1 FROM client_blocked_technicians b
                WHERE b.client_id = $1 AND b.technician_id = u.id) AS is_blocked
      FROM users u
      JOIN technician_profiles t ON u.id = t.user_id
      WHERE u.role = 'technician'
    `, [req.user.id]);

    const technicians = result.rows
      .map((row) => {
        const distance = haversineKm(clientLat, clientLng, row.lat, row.lng);
        return {
          ...row,
          distance_km: distance == null ? null : Number(distance.toFixed(1)),
          price_label: "Sur devis",
          tags: row.specializations || [],
          color: "bg-emerald-500",
        };
      })
      .filter((row) => {
        const specOk = wantedSpecs.length === 0 || (row.specializations || []).some((s) => wantedSpecs.includes(s));
        const radiusOk = clientLat == null || clientLng == null || row.distance_km <= Number(row.radius_km || 10);
        return specOk && radiusOk;
      })
      .sort((a, b) => a.distance_km - b.distance_km);

    res.json(technicians);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/technicians/me/stats", auth, requireRole("technician"), async (req, res) => {
  try {
    const jobs = await pool.query(
      `SELECT COUNT(*)::int AS jobs, COALESCE(SUM(actual_price), 0)::float AS revenue
       FROM appointments
       WHERE technician_id = $1
         AND status = 'completed'
         AND date >= date_trunc('month', current_date)`,
      [req.user.id]
    );
    const rating = await pool.query(
      `SELECT COALESCE(AVG(rating), 0)::float AS avg_rating
       FROM technician_ratings
       WHERE technician_id = $1`,
      [req.user.id]
    );
    res.json({
      jobsThisMonth: jobs.rows[0].jobs,
      revenue: Math.round(Number(jobs.rows[0].revenue || 0)),
      avgRating: Number(Number(rating.rows[0].avg_rating || 0).toFixed(1)),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/technicians/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.name, u.city, u.lat, u.lng,
              t.specializations, t.radius_km, t.rating, t.reviews_count, t.available, t.response_time
       FROM users u
       LEFT JOIN technician_profiles t ON t.user_id = u.id
       WHERE u.id = $1 AND u.role = 'technician'`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Technician not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/technicians/:id", auth, requireRole("technician"), async (req, res) => {
  try {
    if (Number(req.params.id) !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    const { specializations = [], radius_km = 10, available = true } = req.body;
    const result = await pool.query(
      `INSERT INTO technician_profiles (user_id, specializations, radius_km, available, response_time)
       VALUES ($1, $2, $3, $4, '30 min')
       ON CONFLICT (user_id) DO UPDATE SET
         specializations = EXCLUDED.specializations,
         radius_km = EXCLUDED.radius_km,
         available = EXCLUDED.available
       RETURNING *`,
      [req.user.id, specializations, radius_km, available]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET CURRENT USER
router.get("/me", auth, async (req, res) => {

  try {

    const result = await pool.query(
      `
      SELECT 
        id,
        name,
        email,
        phone,
        address,
        city,
        role,
        avatar,
        lat,
        lng
      FROM users
      WHERE id = $1
      `,
      [req.user.id]
    );


    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User not found"
      });
    }


    const user = result.rows[0];
    const token = signToken(user);
    res.json({ token, user });


  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

router.patch("/users/:id", auth, async (req, res) => {
  try {
    if (Number(req.params.id) !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    const { name, email, phone, address, city, lat, lng, avatar } = req.body;
    if (avatar != null && (typeof avatar !== "string" || avatar.length > 500000
      || (!/^data:image\/(?:jpeg|png|webp);base64,/i.test(avatar) && !/^[A-Za-zÀ-ÿ]{1,4}$/.test(avatar)))) {
      return res.status(400).json({ error: "Photo de profil invalide ou trop volumineuse" });
    }
    let detected = null;
    if (city) {
      try {
        const place = await forwardGeocode(city, { baseUrl: geocodingBaseUrl, userAgent: geocodingUserAgent });
        if (place?.countryCode && countryToCurrency[place.countryCode]) detected = { ...place, currency: countryToCurrency[place.countryCode] };
      } catch {}
    }
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           city = COALESCE($5, city),
           lat = COALESCE($6, lat),
           lng = COALESCE($7, lng),
           avatar = COALESCE($8, avatar),
           country_code = COALESCE($9, country_code),
           currency = COALESCE($10, currency)
       WHERE id = $11
       RETURNING id, name, email, phone, address, city, role, avatar, lat, lng, country_code, currency`,
      [name, email, phone, address, city, detected?.lat ?? lat, detected?.lng ?? lng, avatar, detected?.countryCode, detected?.currency, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/geocode/forward", auth, geocodeLimiter, async (req, res) => {
  try {
    const place = await forwardGeocode(req.query.city, { baseUrl: geocodingBaseUrl, userAgent: geocodingUserAgent });
    if (!place) return res.status(404).json({ error: "Lieu introuvable" });
    res.json(place);
  } catch (error) {
    const fallback = CITY_COORDS[String(req.query.city || "").trim().toLowerCase()];
    if (fallback) return res.json({ ...fallback, district: fallback.city, fallback: true });
    res.status(503).json({ error: "Service de localisation temporairement indisponible" });
  }
});

router.post("/technicians/:id/block", auth, requireRole("client"), async (req, res) => {
  try {
    const technicianId = Number(req.params.id);
    const technician = await pool.query("SELECT id FROM users WHERE id=$1 AND role='technician'", [technicianId]);
    if (!technician.rows.length) return res.status(404).json({ error:"Technicien introuvable" });
    await pool.query(
      `INSERT INTO client_blocked_technicians (client_id, technician_id) VALUES ($1,$2)
       ON CONFLICT (client_id, technician_id) DO NOTHING`,
      [req.user.id, technicianId]
    );
    res.json({ blocked:true, technician_id:technicianId });
  } catch (error) { res.status(500).json({ error:error.message }); }
});

router.delete("/technicians/:id/block", auth, requireRole("client"), async (req, res) => {
  try {
    await pool.query("DELETE FROM client_blocked_technicians WHERE client_id=$1 AND technician_id=$2", [req.user.id, req.params.id]);
    res.json({ blocked:false, technician_id:Number(req.params.id) });
  } catch (error) { res.status(500).json({ error:error.message }); }
});

router.get("/geocode/reverse", auth, geocodeLimiter, async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  try {
    const place = await reverseGeocode(lat, lng, { baseUrl: geocodingBaseUrl, userAgent: geocodingUserAgent });
    if (!place) return res.status(404).json({ error: "Lieu introuvable" });
    res.json(place);
  } catch (error) {
    let nearest = null;
    let best = Infinity;
    for (const place of Object.values(CITY_COORDS)) {
      const dist = haversineKm(lat, lng, place.lat, place.lng);
      if (dist != null && dist < best) { best = dist; nearest = place; }
    }
    if (nearest && best <= 50) return res.json({ ...nearest, district: nearest.city, fallback: true });
    res.status(503).json({ error: "Service de localisation temporairement indisponible" });
  }
});


module.exports = router;
