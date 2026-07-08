const auth = require("./middleware/auth");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const pool = require("./db");

const app = express();

app.use(cors({
  origin: [
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
  ],
  credentials: true
}));
app.use(express.json());

const CITY_COORDS = {
  alger: { lat: 36.7538, lng: 3.0588, city: "Alger" },
  "alger centre": { lat: 36.7753, lng: 3.0602, city: "Alger Centre" },
  hydra: { lat: 36.7472, lng: 3.0419, city: "Hydra" },
  kouba: { lat: 36.7333, lng: 3.0833, city: "Kouba" },
  "bab ezzouar": { lat: 36.7133, lng: 3.2125, city: "Bab Ezzouar" },
  oran: { lat: 35.6971, lng: -0.6308, city: "Oran" },
  constantine: { lat: 36.365, lng: 6.6147, city: "Constantine" },
  tunis: { lat: 36.8065, lng: 10.1815, city: "Tunis" },
  casablanca: { lat: 33.5731, lng: -7.5898, city: "Casablanca" },
};

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

function cityLookup(city = "") {
  const key = String(city).trim().toLowerCase();
  return CITY_COORDS[key] || { lat: 36.7538, lng: 3.0588, city: city || "Alger" };
}

async function ensureSchedulingColumns() {
  await pool.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS requested_date DATE,
      ADD COLUMN IF NOT EXISTS requested_time TIME,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS appointment_id INT REFERENCES appointments(id)
  `);
}

function minutesOf(value) {
  if (!value) return null;
  const [h, m] = String(value).slice(0, 5).split(":").map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

async function isTechnicianAvailable(technicianId, date, time) {
  if (!date || !time) return { available: false, reason: "Choisissez une date et une heure." };

  const booked = await pool.query(
    `SELECT id FROM appointments
     WHERE technician_id = $1
       AND date = $2
       AND time = $3
       AND status IN ('pending', 'confirmed')
     LIMIT 1`,
    [technicianId, date, time]
  );
  if (booked.rows.length > 0) {
    return { available: false, reason: "Ce créneau est déjà réservé." };
  }

  const blocks = await pool.query(
    `SELECT * FROM blocked_slots WHERE technician_id = $1`,
    [technicianId]
  );
  const requested = new Date(`${date}T00:00:00`);
  const dow = (requested.getDay() + 6) % 7;
  const minute = minutesOf(time);
  const blocked = blocks.rows.some((slot) => {
    const sameDate = slot.type === "specific" && String(slot.date).slice(0, 10) === date;
    const weekly = slot.type === "weekly" && (slot.week_days || []).includes(dow);
    const daily = slot.type === "daily";
    if (!sameDate && !weekly && !daily) return false;
    const start = minutesOf(slot.start_time);
    const end = minutesOf(slot.end_time);
    return start == null || end == null || minute == null || (minute >= start && minute < end);
  });

  return blocked
    ? { available: false, reason: "Le technicien est indisponible sur ce créneau." }
    : { available: true };
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

/* ===================== REGISTER ===================== */
app.post("/register", async (req, res) => {
  try {
    const { name, email, password, role, city, phone, address } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

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
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===================== LOGIN ===================== */
app.post("/login", async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ error: "User not found" });
    }

    const user = userResult.rows[0];

    // Vérifier si le rôle correspond
    if (role && user.role !== role) {
      return res.status(400).json({ error: `Ce compte est un ${user.role}, pas un ${role}` });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(400).json({ error: "Wrong password" });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const { password_hash, ...userWithoutPassword } = user;
    res.json({ token, user: userWithoutPassword });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ===================== TECHNICIANS ===================== */
app.get("/technicians", async (req, res) => {
  try {
    const clientLat = req.query.lat != null ? Number(req.query.lat) : null;
    const clientLng = req.query.lng != null ? Number(req.query.lng) : null;
    const wantedSpecs = String(req.query.specializations || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const result = await pool.query(`
      SELECT 
        u.id, u.name, u.city, u.lat, u.lng,
        t.specializations, t.rating, t.reviews_count,
        t.available, t.response_time, t.radius_km
      FROM users u
      JOIN technician_profiles t ON u.id = t.user_id
      WHERE u.role = 'technician'
    `);

    const technicians = result.rows
      .map((row) => {
        const distance = haversineKm(clientLat, clientLng, row.lat, row.lng);
        return {
          ...row,
          distance_km: distance == null ? 999 : Number(distance.toFixed(1)),
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

app.get("/technicians/me/stats", auth, async (req, res) => {
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

app.patch("/technicians/:id", auth, async (req, res) => {
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


    const user = result.rows[0]; const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' }); res.json({ token, user });


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
    const result = await pool.query(
      `UPDATE users
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = COALESCE($3, phone),
           address = COALESCE($4, address),
           city = COALESCE($5, city),
           lat = COALESCE($6, lat),
           lng = COALESCE($7, lng),
           avatar = COALESCE($8, avatar)
       WHERE id = $9
       RETURNING id, name, email, phone, address, city, role, avatar, lat, lng`,
      [name, email, phone, address, city, lat, lng, avatar, req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/geocode/forward", (req, res) => {
  const place = cityLookup(req.query.city);
  res.json({ ...place, district: place.city });
});

app.get("/geocode/reverse", (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  let nearest = Object.values(CITY_COORDS)[0];
  let best = Infinity;
  for (const place of Object.values(CITY_COORDS)) {
    const dist = haversineKm(lat, lng, place.lat, place.lng);
    if (dist != null && dist < best) {
      best = dist;
      nearest = place;
    }
  }
  res.json({ city: nearest.city, district: nearest.city });
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

app.post("/appointments", auth, async (req, res) => {
  try {
    const { technicianId, date, time, service, faultType, estimatedPrice, address } = req.body;
    const result = await pool.query(
      `INSERT INTO appointments (client_id, technician_id, date, time, service, fault_type, estimated_price, status, address, duration)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmed', $8, '2h')
       RETURNING *`,
      [req.user.id, technicianId, date, time, service, faultType, estimatedPrice || 0, address || null]
    );
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'rdv', 'Nouveau rendez-vous', $2)`,
      [technicianId, `Rendez-vous ${service || ""} le ${date} à ${time}`]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/appointments/:id", auth, async (req, res) => {
  try {
    const fields = {
      status: req.body.status,
      actual_price: req.body.actual_price,
      case_description: req.body.case_description,
      client_confirmed_price: req.body.client_confirmed_price,
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

app.post("/appointments/:id/feedback", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE appointments
       SET rating = $1, feedback = $2
       WHERE id = $3 AND client_id = $4
       RETURNING *`,
      [req.body.rating, req.body.feedback, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/technicians/:id/ratings", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const technicianId = Number(req.params.id);
    const rating = Number(req.body.rating);
    const comment = req.body.comment || "";
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: "Rating must be between 1 and 5" });
    }

    await client.query("BEGIN");
    const appointment = await client.query(
      `SELECT id
       FROM appointments
       WHERE client_id = $1 AND technician_id = $2
       ORDER BY date DESC, time DESC
       LIMIT 1`,
      [req.user.id, technicianId]
    );

    if (appointment.rows.length > 0) {
      await client.query(
        `UPDATE appointments
         SET rating = $1, feedback = $2
         WHERE id = $3`,
        [rating, comment, appointment.rows[0].id]
      );
    }

    const stats = await client.query(
      `SELECT COALESCE(AVG(rating), 0)::float AS avg_rating,
              COUNT(rating)::int AS reviews_count
       FROM appointments
       WHERE technician_id = $1 AND rating IS NOT NULL`,
      [technicianId]
    );

    const avgRating = Number(Number(stats.rows[0].avg_rating || rating).toFixed(1));
    const reviewsCount = Number(stats.rows[0].reviews_count || 1);

    await client.query(
      `INSERT INTO technician_profiles (user_id, rating, reviews_count)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         rating = EXCLUDED.rating,
         reviews_count = EXCLUDED.reviews_count`,
      [technicianId, avgRating, reviewsCount]
    );

    await client.query("COMMIT");
    res.json({ rating: avgRating, reviews_count: reviewsCount });
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.get("/blocked-slots", auth, async (req, res) => {
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

app.post("/blocked-slots", auth, async (req, res) => {
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

app.delete("/blocked-slots/:id", auth, async (req, res) => {
  try {
    await pool.query(`DELETE FROM blocked_slots WHERE id = $1 AND technician_id = $2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/tarifs", auth, async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM price_items WHERE technician_id = $1 ORDER BY category, id`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/tarifs", auth, async (req, res) => {
  try {
    const { service, unit, price, category } = req.body;
    const result = await pool.query(
      `INSERT INTO price_items (technician_id, service, unit, price, category)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user.id, service, unit || "", price, category || "Base"]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/tarifs/:id", auth, async (req, res) => {
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

app.post("/tarifs/import", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM price_items WHERE technician_id = $1`, [req.user.id]);
    for (const item of req.body.items || []) {
      await client.query(
        `INSERT INTO price_items (technician_id, service, unit, price, category)
         VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, item.service, item.unit || "", item.price || 0, item.category || "Base"]
      );
    }
    const result = await client.query(`SELECT * FROM price_items WHERE technician_id = $1 ORDER BY category, id`, [req.user.id]);
    await client.query("COMMIT");
    res.json(result.rows);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
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

app.get("/leads", auth, async (req, res) => {
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

app.patch("/leads/:id", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE leads SET status = COALESCE($1, status)
       WHERE id = $2 AND technician_id = $3
       RETURNING *`,
      [req.body.status, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Lead not found" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/leads/:id/decline", auth, async (req, res) => {
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

app.post("/chat/quote", auth, async (req, res) => {
  const text = JSON.stringify(req.body.messages || "").toLowerCase();
  const base = text.includes("install") ? 520 : text.includes("chaudi") || text.includes("chauff") ? 210 : 185;
  res.json({ price: base, low: Math.round(base * 0.85), high: Math.round(base * 1.2), confidence: 78 });
});

app.post("/chat/counter-offer", auth, async (req, res) => {
  res.json({ ok: true, amount: req.body.amount });
});

/* ===================== CONTACT TECHNICIAN ===================== */
app.post("/leads/contact", auth, async (req, res) => {
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


// START SERVER
const PORT = 5000;

ensureSchedulingColumns()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur lancé sur http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error("Erreur initialisation planning:", err);
    process.exit(1);
  });
