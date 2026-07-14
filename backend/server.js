const auth = require("./middleware/auth");
const { signToken, requireRole, verifyToken } = require("./middleware/auth");
const http = require("http");
const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const countryToCurrency = require("country-to-currency").default;
const { rateLimit } = require("express-rate-limit");
const { port, corsOrigins, geocodingBaseUrl, geocodingUserAgent } = require("./env");
const { hashPassword, verifyPassword, validatePassword } = require("./utils/password");
const { forwardGeocode, reverseGeocode } = require("./services/geocoding");
const { parseTariffFile } = require("./services/tariff-file-parser");

const pool = require("./db");
const pricingRouter = require("./routes/pricing");
const conversationsRouter = require("./routes/conversations");
const { setRealtimeServer, emitToUser } = require("./realtime");

const app = express();

app.disable("x-powered-by");
app.use(helmet({ referrerPolicy: { policy: "strict-origin-when-cross-origin" } }));
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : false,
  credentials: true
}));
app.use(express.json({ limit: "100kb" }));
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: "draft-8", legacyHeaders: false });
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
const geocodeLimiter = rateLimit({ windowMs: 1000, limit: 1, standardHeaders: "draft-8", legacyHeaders: false });
const tariffUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
app.use(publicLimiter);
app.use("/api/pricing", pricingRouter);
app.use("/conversations", conversationsRouter);

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

async function ensureSchedulingColumns() {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2), ADD COLUMN IF NOT EXISTS currency VARCHAR(3)`);
  await pool.query(`
    ALTER TABLE appointments ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR';
    UPDATE appointments a SET currency=u.currency FROM users u
    WHERE u.id=a.technician_id AND u.currency IS NOT NULL AND (a.currency IS NULL OR a.currency='EUR');
  `);
  await pool.query(`
    ALTER TABLE price_items
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'DZ',
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
      ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255),
      ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_price_items_country ON price_items(technician_id, country_code, category);
  `);
  await pool.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS requested_date DATE,
      ADD COLUMN IF NOT EXISTS requested_time TIME,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS appointment_id INT REFERENCES appointments(id)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_fallback_requests (
      id BIGSERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      request_text TEXT NOT NULL,
      extraction JSONB,
      failure_code VARCHAR(80) NOT NULL,
      confidence NUMERIC(6,5),
      status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'resolved', 'cancelled')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_pricing_fallback_pending
      ON pricing_fallback_requests(status, created_at) WHERE status = 'pending';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_appointment_unique
      ON leads(appointment_id) WHERE appointment_id IS NOT NULL;
    INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city, requested_date, requested_time, address, appointment_id)
    SELECT a.client_id, a.technician_id, COALESCE(a.service, 'Demande de rendez-vous'), a.fault_type,
           COALESCE(a.estimated_price, 0), 100,
           CASE WHEN a.status = 'completed' THEN 'done' WHEN a.status = 'cancelled' THEN 'done' ELSE 'accepted' END,
           u.city, a.date, a.time, a.address, a.id
    FROM appointments a
    LEFT JOIN users u ON u.id = a.client_id
    WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.appointment_id = a.id)
    ON CONFLICT DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id BIGSERIAL PRIMARY KEY,
      client_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(client_id, technician_id),
      CHECK (client_id <> technician_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(2000) NOT NULL CHECK (length(trim(body)) > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_order
      ON conversation_messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS technician_ratings (
      id BIGSERIAL PRIMARY KEY,
      client_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment VARCHAR(2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(client_id, technician_id),
      CHECK (client_id <> technician_id)
    );
    CREATE INDEX IF NOT EXISTS idx_technician_ratings_technician
      ON technician_ratings(technician_id);
    INSERT INTO technician_ratings(client_id, technician_id, rating, comment)
    SELECT DISTINCT ON (client_id, technician_id) client_id, technician_id, rating, feedback
    FROM appointments WHERE rating IS NOT NULL
    ORDER BY client_id, technician_id, date DESC, time DESC
    ON CONFLICT (client_id, technician_id) DO NOTHING;
    UPDATE technician_profiles t
    SET rating = COALESCE(stats.avg_rating, 0),
        reviews_count = COALESCE(stats.reviews_count, 0)
    FROM (
      SELECT u.id AS technician_id, AVG(r.rating)::numeric(2,1) AS avg_rating, COUNT(r.id)::int AS reviews_count
      FROM users u
      LEFT JOIN technician_ratings r ON r.technician_id = u.id
      WHERE u.role = 'technician'
      GROUP BY u.id
    ) stats
    WHERE t.user_id = stats.technician_id;
  `);
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

function normalizedSpecialty(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function specialtyMatches(specializations, requested) {
  const wanted = normalizedSpecialty(requested);
  const groups = { climatisation: ["climatisation", "reparation", "refrigeration", "multi-split", "remplacement"], chauffage: ["chauffage", "pompe a chaleur", "maintenance preventive"], ventilation: ["ventilation", "installation"], installation: ["installation", "multi-split"] };
  const expected = groups[wanted] || [wanted];
  return (specializations || []).some((value) => expected.some((item) => normalizedSpecialty(value).includes(item)));
}

function sqlDate(value) {
  if (!value) return value;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

/* ===================== TEST ===================== */
app.get("/test", (req, res) => {
  res.json({ message: "Backend OK" });
});
app.get("/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ status: "ok" }); }
  catch { res.status(503).json({ status: "unavailable" }); }
});

/* ===================== REGISTER ===================== */
app.post("/register", authLimiter, async (req, res) => {
  try {
    const { name, email, password, role, city, phone, address } = req.body || {};
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 100) return res.status(400).json({ error: "Nom invalide" });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Email invalide" });
    const passwordError = validatePassword(password, { name, email });
    if (passwordError) return res.status(400).json({ error: passwordError });
    if (!['client', 'technician'].includes(role)) return res.status(400).json({ error: "Rôle invalide" });

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
app.post("/login", authLimiter, async (req, res) => {
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
app.get("/technicians", auth, async (req, res) => {
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
        u.id, u.name, u.city, u.lat, u.lng,
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
         WHERE r.client_id = $1 AND r.technician_id = u.id LIMIT 1) AS my_rating
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

app.get("/technicians/me/stats", auth, requireRole("technician"), async (req, res) => {
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
       FROM appointments
       WHERE technician_id = $1 AND rating IS NOT NULL`,
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

app.get("/technicians/:id", auth, async (req, res) => {
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

app.patch("/technicians/:id", auth, requireRole("technician"), async (req, res) => {
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
app.get("/me", auth, async (req, res) => {

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

app.patch("/users/:id", auth, async (req, res) => {
  try {
    if (Number(req.params.id) !== req.user.id) return res.status(403).json({ error: "Forbidden" });
    const { name, email, phone, address, city, lat, lng, avatar } = req.body;
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

app.get("/geocode/forward", auth, geocodeLimiter, async (req, res) => {
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

app.get("/geocode/reverse", auth, geocodeLimiter, async (req, res) => {
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

app.get("/appointments", auth, async (req, res) => {
  try {
    const column = req.user.role === "technician" ? "technician_id" : "client_id";
    const result = await pool.query(
      `SELECT a.*,
              cu.name AS client_name,
              cu.phone AS client_phone,
              tu.name AS technician_name,
              tu.phone AS technician_phone
       FROM appointments a
       LEFT JOIN users cu ON cu.id = a.client_id
       LEFT JOIN users tu ON tu.id = a.technician_id
       WHERE a.${column} = $1
       ORDER BY a.date, a.time`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/availability/suggestions", auth, requireRole("client"), async (req, res) => {
  try {
    const specialty = String(req.query.specialty || "Climatisation");
    const urgency = ["critical", "urgent", "normal"].includes(String(req.query.urgency)) ? String(req.query.urgency) : "normal";
    const result = await pool.query(
      `SELECT u.id, u.name, t.specializations, t.rating, t.reviews_count, t.response_time
       FROM users u JOIN technician_profiles t ON t.user_id = u.id
       WHERE u.role = 'technician' AND t.available = true`
    );
    const specialists = result.rows.filter((row) => specialtyMatches(row.specializations, specialty));
    const generalists = result.rows.filter((row) => (row.specializations || []).some((value) => /reparation|maintenance|depannage|hvac/i.test(normalizedSpecialty(value))));
    const candidates = specialists.length ? specialists : generalists;
    const horizon = urgency === "critical" ? 2 : urgency === "urgent" ? 4 : 7;
    const slots = [];
    const now = new Date();
    for (let offset = urgency === "normal" ? 1 : 0; offset <= horizon && slots.length < 5; offset += 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const date = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      for (const hour of [8, 10, 12, 14, 16, 18]) {
        if (offset === 0 && hour <= now.getHours() + 1) continue;
        const time = `${String(hour).padStart(2, "0")}:00`;
        for (const technician of candidates) {
          if ((await isTechnicianAvailable(technician.id, date, time)).available) {
            slots.push({ date, time, technician_id: technician.id, technician_name: technician.name, rating: technician.rating, reviews_count: technician.reviews_count, response_time: technician.response_time, urgency });
            if (slots.length === 5) break;
          }
        }
        if (slots.length === 5) break;
      }
    }
    res.json({ specialty, urgency, matched_technicians: candidates.length, match_level: specialists.length ? "specialist" : "generalist", slots });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/appointments", auth, requireRole("client"), async (req, res) => {
  const client = await pool.connect();
  try {
    const { technicianId, date, time, service, faultType, estimatedPrice, address } = req.body;
    if (!Number.isInteger(Number(technicianId)) || !/^\d{4}-\d{2}-\d{2}$/.test(String(date || "")) || !/^\d{2}:\d{2}/.test(String(time || ""))) {
      return res.status(400).json({ error: "Technicien, date ou heure invalide" });
    }
    const technician = await client.query(
      "SELECT u.id, u.name, u.currency FROM users u JOIN technician_profiles t ON t.user_id=u.id WHERE u.id=$1 AND u.role='technician' AND t.available=true",
      [technicianId]
    );
    if (!technician.rows.length) return res.status(404).json({ error: "Technicien indisponible ou introuvable" });
    const availability = await isTechnicianAvailable(Number(technicianId), date, time);
    if (!availability.available) return res.status(409).json({ error: availability.reason });
    const clientProfile = await client.query("SELECT name, city, address FROM users WHERE id = $1", [req.user.id]);
    const bookingAddress = address || clientProfile.rows[0]?.address || null;
    await client.query("BEGIN");
    const result = await client.query(
      `INSERT INTO appointments (client_id, technician_id, date, time, service, fault_type, estimated_price, status, address, duration, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8, '2h', $9)
       RETURNING *`,
      [req.user.id, technicianId, date, time, service, faultType, estimatedPrice || 0, bookingAddress, String(req.body.currency || technician.rows[0].currency || "EUR").slice(0,3).toUpperCase()]
    );
    const lead = await client.query(
      `INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city, requested_date, requested_time, address, appointment_id)
       VALUES ($1,$2,$3,$4,$5,100,'new',$6,$7,$8,$9,$10)
       ON CONFLICT (appointment_id) WHERE appointment_id IS NOT NULL
       DO UPDATE SET status='new', requested_date=EXCLUDED.requested_date, requested_time=EXCLUDED.requested_time
       RETURNING *`,
      [req.user.id, technicianId, service || `Rendez-vous ${faultType || "HVAC"}`, faultType || "Climatisation", estimatedPrice || 0,
        clientProfile.rows[0]?.city || null, date, time, bookingAddress, result.rows[0].id]
    );
    const notification = await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'rdv', 'Nouvelle demande de rendez-vous', $2)
       RETURNING *`,
      [technicianId, `Rendez-vous ${service || ""} le ${date} à ${time}`]
    );
    await client.query("COMMIT");
    const payload = { ...result.rows[0], client_name: clientProfile.rows[0]?.name, client_city: clientProfile.rows[0]?.city, technician_name: technician.rows[0].name };
    emitToUser(technicianId, "appointment:new", payload);
    emitToUser(technicianId, "lead:new", { ...lead.rows[0], client_name: clientProfile.rows[0]?.name });
    emitToUser(technicianId, "notification:new", notification.rows[0]);
    res.status(201).json(payload);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.patch("/appointments/:id", auth, async (req, res) => {
  try {
    const isTechnician = req.user.role === "technician";
    const requestedStatus = req.body?.status;
    if (requestedStatus && !["pending", "confirmed", "completed", "cancelled"].includes(requestedStatus)) {
      return res.status(400).json({ error: "Statut invalide" });
    }
    if (!isTechnician && requestedStatus && requestedStatus !== "cancelled") {
      return res.status(403).json({ error: "Seul le technicien peut confirmer ou terminer une intervention" });
    }
    if (!isTechnician && (req.body?.actual_price != null || req.body?.case_description != null)) {
      return res.status(403).json({ error: "Seul le technicien peut renseigner le compte-rendu et le prix réel" });
    }
    const fields = {
      status: requestedStatus,
      actual_price: isTechnician ? req.body.actual_price : null,
      case_description: isTechnician ? req.body.case_description : null,
      client_confirmed_price: !isTechnician ? req.body.client_confirmed_price : null,
    };
    const result = await pool.query(
      `UPDATE appointments
       SET status = COALESCE($1, status),
           actual_price = COALESCE($2, actual_price),
           case_description = COALESCE($3, case_description),
           client_confirmed_price = COALESCE($4, client_confirmed_price)
       WHERE id = $5 AND (client_id = $6 OR technician_id = $6)
       RETURNING *`,
      [fields.status, fields.actual_price, fields.case_description, fields.client_confirmed_price, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/appointments/:id/feedback", auth, requireRole("client"), async (req, res) => {
  const client = await pool.connect();
  try {
    const rating = Number(req.body?.rating);
    const feedback = typeof req.body?.feedback === "string" ? req.body.feedback.trim().slice(0, 2000) : "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "La note doit être comprise entre 1 et 5" });
    await client.query("BEGIN");
    const result = await client.query(
      `UPDATE appointments
       SET rating = $1, feedback = $2
       WHERE id = $3 AND client_id = $4 AND status = 'completed'
       RETURNING *`,
      [rating, feedback, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({ error: "L’évaluation est disponible après une intervention terminée" });
    }
    await saveTechnicianRating(client, {
      clientId: req.user.id,
      technicianId: result.rows[0].technician_id,
      rating,
      comment: feedback,
    });
    await client.query("COMMIT");
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.get("/technicians/:id/ratings", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.rating, r.comment, r.updated_at, u.name AS client_name
       FROM technician_ratings r JOIN users u ON u.id=r.client_id
       WHERE r.technician_id=$1 ORDER BY r.updated_at DESC LIMIT 50`,
      [req.params.id]
    );
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post("/technicians/:id/ratings", auth, requireRole("client"), async (req, res) => {
  const client = await pool.connect();
  try {
    const technicianId = Number(req.params.id);
    const rating = Number(req.body.rating);
    const comment = req.body.comment || "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    const relationship = await client.query(
      `SELECT
         EXISTS (SELECT 1 FROM conversations WHERE client_id = $1 AND technician_id = $2)
         OR EXISTS (SELECT 1 FROM appointments WHERE client_id = $1 AND technician_id = $2 AND status = 'completed') AS allowed`,
      [req.user.id, technicianId]
    );
    if (!relationship.rows[0]?.allowed) return res.status(403).json({ error: "Contactez d’abord ce technicien avant de l’évaluer" });

    await client.query("BEGIN");
    const latestAppointment = await client.query(
      `SELECT id FROM appointments WHERE client_id = $1 AND technician_id = $2
       ORDER BY date DESC, time DESC LIMIT 1`,
      [req.user.id, technicianId]
    );
    if (latestAppointment.rows.length) {
      await client.query("UPDATE appointments SET rating = $1, feedback = $2 WHERE id = $3", [rating, comment.slice(0, 2000), latestAppointment.rows[0].id]);
    }
    const stats = await saveTechnicianRating(client, { clientId: req.user.id, technicianId, rating, comment: comment.slice(0, 2000) });

    await client.query("COMMIT");
    res.json(stats);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get("/blocked-slots", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM blocked_slots WHERE technician_id = $1 ORDER BY id DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/blocked-slots", auth, requireRole("technician"), async (req, res) => {
  try {
    const { type, date, weekDays, startTime, endTime, label } = req.body;
    const result = await pool.query(
      `INSERT INTO blocked_slots (technician_id, type, date, week_days, start_time, end_time, label)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, type, date || null, weekDays || null, startTime, endTime, label]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/blocked-slots/:id", auth, requireRole("technician"), async (req, res) => {
  try {
    await pool.query(`DELETE FROM blocked_slots WHERE id = $1 AND technician_id = $2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tarifs", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM price_items WHERE technician_id = $1 ORDER BY category, id`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/tarifs", auth, requireRole("technician"), async (req, res) => {
  try {
    const { service, unit, price, category } = req.body;
    const market = await technicianMarket(req.user.id);
    const result = await pool.query(
      `INSERT INTO price_items (technician_id, service, unit, price, category, country_code, currency)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [req.user.id, service, unit || "", price, category || "Base", market.countryCode, market.currency]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/tarifs/:id", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE price_items
       SET service = COALESCE($1, service),
           unit = COALESCE($2, unit),
           price = COALESCE($3, price),
           category = COALESCE($4, category)
       WHERE id = $5 AND technician_id = $6
       RETURNING *`,
      [req.body.service, req.body.unit, req.body.price, req.body.category, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Tarif not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function replaceTariffs(technicianId, items, context = {}) {
  const client = await pool.connect();
  try {
    if (!Array.isArray(items) || items.length === 0 || items.length > 1000
        || items.some((item) => typeof item.service !== "string" || item.service.length > 200 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
      throw Object.assign(new Error("Grille tarifaire invalide"), { status: 400 });
    }
    await client.query("BEGIN");
    const countryAliases = { ALGERIE:"DZ", ALGERIA:"DZ", TUNISIE:"TN", TUNISIA:"TN", MAROC:"MA", MOROCCO:"MA" };
    const normalizeCountry = (value) => {
      const raw = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
      return countryAliases[raw] || raw;
    };
    const countryCode = normalizeCountry(context.countryCode || "DZ");
    const currency = String(context.currency || ({ DZ:"DZD", TN:"TND", MA:"MAD" })[countryCode] || "EUR").toUpperCase();
    if (!/^[A-Z]{2}$/.test(countryCode) || !/^[A-Z]{3}$/.test(currency)) throw Object.assign(new Error("Pays ou devise invalide"), { status: 400 });
    await client.query(`DELETE FROM price_items WHERE technician_id = $1 AND country_code = $2`, [technicianId, countryCode]);
    for (const item of items) {
      await client.query(
        `INSERT INTO price_items (technician_id, service, unit, price, category, country_code, currency, source_filename, imported_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
        [technicianId, item.service, item.unit || "", item.price || 0, item.category || "Base", countryCode, currency, context.filename || null]
      );
    }
    const result = await client.query(`SELECT * FROM price_items WHERE technician_id = $1 ORDER BY country_code, category, id`, [technicianId]);
    await client.query("COMMIT");
    return result.rows;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

app.post("/tarifs/import", auth, requireRole("technician"), async (req, res, next) => {
  try { res.json(await replaceTariffs(req.user.id, req.body?.items, await technicianMarket(req.user.id))); } catch (error) { next(error); }
});

app.get("/tarifs/context", auth, requireRole("technician"), async (req, res, next) => {
  try { res.json(await technicianMarket(req.user.id)); } catch (error) { next(error); }
});

app.post("/tarifs/import-file", auth, requireRole("technician"), tariffUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });
    const items = await parseTariffFile(req.file);
    const market = await technicianMarket(req.user.id);
    const saved = await replaceTariffs(req.user.id, items, { ...market, filename: req.file.originalname });
    res.json({ items: saved, imported_count: items.length, filename: req.file.originalname, country_code: market.countryCode, currency: market.currency });
  } catch (error) { next(error); }
});

/* ===================== NOTIFICATIONS ===================== */
app.get("/notifications", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await pool.query(
      `SELECT * FROM notifications 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
      [userId]
    );

    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/notifications/:id/read", auth, async (req, res) => {
  try {
    const notifId = req.params.id;

    await pool.query(
      `UPDATE notifications 
       SET read = true 
       WHERE id = $1 AND user_id = $2`,
      [notifId, req.user.id]
    );

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/notifications/read-all", auth, async (req, res) => {
  try {
    await pool.query(
      `UPDATE notifications 
       SET read = true 
       WHERE user_id = $1`,
      [req.user.id]
    );

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/leads", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, cu.name AS client_name
       FROM leads l
       LEFT JOIN users cu ON cu.id = l.client_id
       WHERE l.technician_id = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/leads/:id", auth, requireRole("technician"), async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query(
      `WITH updated AS (
         UPDATE leads SET status = COALESCE($1, status)
         WHERE id = $2 AND technician_id = $3
         RETURNING *
       )
       SELECT updated.*, cu.name AS client_name FROM updated LEFT JOIN users cu ON cu.id=updated.client_id`,
      [req.body.status, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Lead not found" });
    }
    if (req.body.status === "accepted" && result.rows[0].appointment_id) {
      await client.query("UPDATE appointments SET status='confirmed' WHERE id=$1 AND technician_id=$2", [result.rows[0].appointment_id, req.user.id]);
    }
    await client.query("COMMIT");
    if (result.rows[0].appointment_id) emitToUser(result.rows[0].client_id, "appointment:updated", { id: result.rows[0].appointment_id, status: "confirmed" });
    res.json(result.rows[0]);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

app.post("/leads/:id/decline", auth, requireRole("technician"), async (req, res) => {
  try {
    const current = await pool.query(`SELECT * FROM leads WHERE id = $1 AND technician_id = $2`, [req.params.id, req.user.id]);
    if (current.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    await pool.query(`UPDATE leads SET status = 'done' WHERE id = $1`, [req.params.id]);

    const lead = current.rows[0];
    const candidates = await pool.query(
      `SELECT u.id, u.name
       FROM users u
       JOIN technician_profiles t ON t.user_id = u.id
       WHERE u.role = 'technician'
         AND u.id <> $1
         AND t.available = true
         AND ($2::text IS NULL OR $2 = ANY(t.specializations))
       LIMIT 1`,
      [req.user.id, lead.fault_type || null]
    );
    if (candidates.rows.length > 0) {
      const tech = candidates.rows[0];
      await pool.query(
        `INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city)
         VALUES ($1, $2, $3, $4, $5, $6, 'new', $7)`,
        [lead.client_id, tech.id, lead.problem, lead.fault_type, lead.price, lead.confidence, lead.city]
      );
      return res.json({ reassignedTo: tech.name });
    }
    res.json({ reassignedTo: null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat/quote", auth, (req, res) => res.status(410).json({
  error: "Endpoint remplacé par POST /api/pricing/quote",
}));

app.post("/chat/counter-offer", auth, requireRole("client"), async (req, res) => {
  res.json({ ok: true, amount: req.body.amount });
});

/* ===================== CONTACT TECHNICIAN ===================== */
app.post("/leads/contact", auth, requireRole("client"), async (req, res) => {
  try {
    const { technicianId, problem, faultType, price, confidence, city } = req.body;
    const clientId = req.user.id;

    // Check if lead already exists
    const existing = await pool.query(
      `SELECT * FROM leads 
       WHERE technician_id = $1 AND client_id = $2`,
      [technicianId, clientId]
    );

    if (existing.rows.length > 0) {
      return res.json(existing.rows[0]);
    }

    const client = await pool.query(`SELECT name, city FROM users WHERE id = $1`, [clientId]);
    const result = await pool.query(
      `INSERT INTO leads (technician_id, client_id, problem, fault_type, price, confidence, city, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'new')
       RETURNING *`,
      [
        technicianId,
        clientId,
        problem || "Demande de contact client",
        faultType || "Climatisation",
        price || 0,
        confidence || 70,
        city || client.rows[0]?.city || null,
      ]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'lead', 'Nouveau lead', $2)`,
      [technicianId, `${client.rows[0]?.name || "Un client"} vous a contacté`]
    );

    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist, { maxAge: "1d", index: false }));
  app.get(/^(?!\/(?:api|conversations|appointments|technicians|notifications|leads|tarifs|blocked-slots|availability|auth|register|login|health|test)).*/, (req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

app.use((error, req, res, next) => {
  console.error(error);
  const status = error instanceof multer.MulterError ? 400
    : Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Erreur interne" : error.message });
});

const server = http.createServer(app);
const io = new Server(server, corsOrigins.length ? { cors: { origin: corsOrigins, credentials: true } } : {});
io.use((socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
io.on("connection", (socket) => {
  socket.join(`user:${socket.user.id}`);
});
setRealtimeServer(io);

// START SERVER
ensureSchedulingColumns()
  .then(() => {
    server.listen(port, () => {
      console.log(`Serveur lancé sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Erreur initialisation planning:", err);
    process.exit(1);
  });
