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
  CITY_COORDS, createApplicationSupport, haversineKm, normalizedSpecialty,
  saveTechnicianRating, specialtyMatches, sqlDate,
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

router.get("/appointments", auth, async (req, res) => {
  try {
    const column = req.user.role === "technician" ? "technician_id" : "client_id";
    const result = await pool.query(
      `SELECT a.*,
              cu.name AS client_name,
              cu.phone AS client_phone,
              cu.city AS client_city,
              cu.address AS client_profile_address,
              cu.lat AS client_lat,
              cu.lng AS client_lng,
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

router.get("/availability/suggestions", auth, requireRole("client"), async (req, res) => {
  try {
    const specialty = String(req.query.specialty || "Climatisation");
    const urgency = ["critical", "urgent", "normal"].includes(String(req.query.urgency)) ? String(req.query.urgency) : "normal";
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || "")) ? String(req.query.date) : null;
    const requestedPeriod = ["morning", "afternoon", "evening", "any"].includes(String(req.query.period)) ? String(req.query.period) : "any";
    const requester = await pool.query("SELECT lat, lng FROM users WHERE id = $1", [req.user.id]);
    const clientLat = requester.rows[0]?.lat == null ? null : Number(requester.rows[0].lat);
    const clientLng = requester.rows[0]?.lng == null ? null : Number(requester.rows[0].lng);
    const result = await pool.query(
      `SELECT u.id, u.name, u.lat, u.lng, t.radius_km, t.specializations, t.rating, t.reviews_count, t.response_time
       FROM users u JOIN technician_profiles t ON t.user_id = u.id
       WHERE u.role = 'technician' AND t.available = true
         AND NOT EXISTS (SELECT 1 FROM client_blocked_technicians b WHERE b.client_id=$1 AND b.technician_id=u.id)`,
      [req.user.id]
    );
    const nearby = result.rows.map((row) => ({
      ...row,
      distance_km: haversineKm(clientLat, clientLng, row.lat, row.lng),
    })).filter((row) => row.distance_km == null || row.distance_km <= Number(row.radius_km || 10));
    const specialists = nearby.filter((row) => specialtyMatches(row.specializations, specialty));
    const generalists = nearby.filter((row) => (row.specializations || []).some((value) => /reparation|maintenance|depannage|hvac/i.test(normalizedSpecialty(value))));
    const candidates = (specialists.length ? specialists : generalists)
      .sort((a, b) => (a.distance_km ?? Number.POSITIVE_INFINITY) - (b.distance_km ?? Number.POSITIVE_INFINITY));
    const horizon = urgency === "critical" ? 2 : urgency === "urgent" ? 4 : 7;
    const slots = [];
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    for (let offset = requestedDate ? 0 : urgency === "normal" ? 1 : 0; offset <= (requestedDate ? 0 : horizon); offset += 1) {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
      const date = requestedDate || `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      const hours = requestedPeriod === "morning" ? [8, 10, 12]
        : requestedPeriod === "afternoon" ? [14, 16]
          : requestedPeriod === "evening" ? [18] : [8, 10, 12, 14, 16, 18];
      for (const hour of hours) {
        if (date === today && hour <= now.getHours() + 1) continue;
        const time = `${String(hour).padStart(2, "0")}:00`;
        for (const technician of candidates) {
          if ((await isTechnicianAvailable(technician.id, date, time)).available) {
            slots.push({ date, time, technician_id: technician.id, technician_name: technician.name, distance_km: technician.distance_km == null ? null : Number(technician.distance_km.toFixed(1)), rating: technician.rating, reviews_count: technician.reviews_count, response_time: technician.response_time, urgency });
          }
        }
      }
    }
    res.json({ specialty, urgency, requested_date: requestedDate, requested_period: requestedPeriod, matched_technicians: candidates.length, match_level: specialists.length ? "specialist" : "generalist", slots: slots.slice(0, 24) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post("/appointments", auth, requireRole("client"), async (req, res) => {
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
    const clientProfile = await client.query("SELECT name, city, address, lat, lng FROM users WHERE id = $1", [req.user.id]);
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
    const payload = { ...result.rows[0], client_name: clientProfile.rows[0]?.name, client_city: clientProfile.rows[0]?.city, client_profile_address: clientProfile.rows[0]?.address, client_lat: clientProfile.rows[0]?.lat, client_lng: clientProfile.rows[0]?.lng, technician_name: technician.rows[0].name };
    emitToUser(technicianId, "appointment:new", payload);
    emitToUser(technicianId, "lead:new", { ...lead.rows[0], client_name: clientProfile.rows[0]?.name });
    emitToUser(technicianId, "notification:new", notification.rows[0]);
    res.status(201).json(payload);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    res.status(500).json({ error: err.message });
  } finally { client.release(); }
});

router.patch("/appointments/:id", auth, async (req, res) => {
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
         AND ($1 IS DISTINCT FROM 'cancelled' OR $7 = true OR status IN ('pending', 'confirmed'))
       RETURNING *`,
      [fields.status, fields.actual_price, fields.case_description, fields.client_confirmed_price, req.params.id, req.user.id, isTechnician]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: "Appointment not found" });
    if (isTechnician && requestedStatus === "confirmed") {
      await pool.query(
        `INSERT INTO conversations (client_id, technician_id)
         VALUES ($1, $2)
         ON CONFLICT (client_id, technician_id) DO UPDATE SET updated_at = now()`,
        [result.rows[0].client_id, result.rows[0].technician_id]
      );
    }
    if (!isTechnician && requestedStatus === "cancelled") {
      const notification = await pool.query(
        `INSERT INTO notifications (user_id, type, title, message)
         VALUES ($1, 'rdv', 'Rendez-vous annulé', $2) RETURNING *`,
        [result.rows[0].technician_id, `Le client a annulé le rendez-vous du ${sqlDate(result.rows[0].date)} à ${String(result.rows[0].time).slice(0, 5)}.`]
      );
      emitToUser(result.rows[0].technician_id, "appointment:updated", result.rows[0]);
      emitToUser(result.rows[0].technician_id, "notification:new", notification.rows[0]);
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/appointments/:id/feedback", auth, requireRole("client"), async (req, res) => {
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

router.get("/technicians/:id/ratings", auth, async (req, res) => {
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

router.post("/technicians/:id/ratings", auth, requireRole("client"), async (req, res) => {
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

router.get("/blocked-slots", auth, requireRole("technician"), async (req, res) => {
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

router.post("/blocked-slots", auth, requireRole("technician"), async (req, res) => {
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

router.delete("/blocked-slots/:id", auth, requireRole("technician"), async (req, res) => {
  try {
    await pool.query(`DELETE FROM blocked_slots WHERE id = $1 AND technician_id = $2`, [req.params.id, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
