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

router.get("/leads", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT l.*, cu.name AS client_name,
              COALESCE(l.requested_date, a.date) AS requested_date,
              COALESCE(l.requested_time, a.time) AS requested_time,
              COALESCE(l.address, a.address, cu.address) AS address,
              COALESCE(l.appointment_id, a.id) AS appointment_id,
              COALESCE(a.currency, cu.currency, tu.currency, 'EUR') AS currency
       FROM leads l
       LEFT JOIN users cu ON cu.id = l.client_id
       LEFT JOIN users tu ON tu.id = l.technician_id
       LEFT JOIN LATERAL (
         SELECT candidate.id, candidate.date, candidate.time, candidate.address, candidate.currency
         FROM appointments candidate
         WHERE candidate.id = l.appointment_id
            OR (l.appointment_id IS NULL
                AND candidate.client_id = l.client_id
                AND candidate.technician_id = l.technician_id
                AND candidate.status IN ('pending', 'confirmed')
                AND (candidate.fault_type = l.fault_type OR candidate.service = l.problem))
         ORDER BY (candidate.id = l.appointment_id) DESC, candidate.date DESC, candidate.time DESC
         LIMIT 1
       ) a ON true
       WHERE l.technician_id = $1
       ORDER BY l.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch("/leads/:id", auth, requireRole("technician"), async (req, res) => {
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

router.post("/leads/:id/decline", auth, requireRole("technician"), async (req, res) => {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const current = await db.query(
      `SELECT l.*, COALESCE(a.date, l.requested_date) AS appointment_date,
              COALESCE(a.time, l.requested_time) AS appointment_time,
              a.id AS linked_appointment_id, COALESCE(a.address, l.address, cu.address) AS appointment_address,
              cu.name AS client_name, cu.lat AS client_lat, cu.lng AS client_lng
       FROM leads l
       LEFT JOIN LATERAL (
         SELECT candidate.* FROM appointments candidate
         WHERE candidate.id = l.appointment_id
            OR (l.appointment_id IS NULL
                AND candidate.client_id = l.client_id
                AND candidate.technician_id = l.technician_id
                AND candidate.status IN ('pending', 'confirmed')
                AND (candidate.fault_type = l.fault_type OR candidate.service = l.problem))
         ORDER BY (candidate.id = l.appointment_id) DESC, candidate.date DESC, candidate.time DESC
         LIMIT 1
       ) a ON true
       JOIN users cu ON cu.id=l.client_id
       WHERE l.id=$1 AND l.technician_id=$2 FOR UPDATE OF l`,
      [req.params.id, req.user.id]
    );
    if (!current.rows.length) { await db.query("ROLLBACK"); return res.status(404).json({ error:"Lead introuvable" }); }
    const lead = current.rows[0];
    const slotDate = sqlDate(lead.appointment_date);
    const slotTime = lead.appointment_time ? String(lead.appointment_time).slice(0, 5) : null;
    if (!slotDate || !slotTime) {
      await db.query("ROLLBACK");
      return res.status(409).json({
        error: "Cette demande ne possède pas de créneau. Le client doit choisir une date et une heure avant toute réaffectation.",
        code: "reassignment_slot_required",
      });
    }
    const result = await db.query(
      `SELECT u.id,u.name,u.lat,u.lng,t.radius_km,t.specializations,t.rating
       FROM users u JOIN technician_profiles t ON t.user_id=u.id
       WHERE u.role='technician' AND t.available=true AND u.id<>$1
         AND NOT EXISTS (SELECT 1 FROM client_blocked_technicians b WHERE b.client_id=$2 AND b.technician_id=u.id)`,
      [req.user.id, lead.client_id]
    );
    const ranked = result.rows.map((technician)=>({
      ...technician,
      distance_km:haversineKm(lead.client_lat, lead.client_lng, technician.lat, technician.lng),
      specialty_match:specialtyMatches(technician.specializations, lead.fault_type),
    })).filter((technician)=>technician.specialty_match
        && (technician.distance_km == null || technician.distance_km <= Number(technician.radius_km || 10)))
      .sort((a,b)=>Number(b.specialty_match)-Number(a.specialty_match)
        || (a.distance_km ?? Number.POSITIVE_INFINITY)-(b.distance_km ?? Number.POSITIVE_INFINITY)
        || Number(b.rating||0)-Number(a.rating||0));
    let replacement = null;
    for (const technician of ranked) {
      if ((await isTechnicianAvailable(technician.id, slotDate, slotTime)).available) {
        replacement = technician; break;
      }
    }
    if (!replacement) {
      await db.query("UPDATE leads SET status='done' WHERE id=$1", [lead.id]);
      const notice = await db.query(
        `INSERT INTO notifications(user_id,type,title,message) VALUES($1,'reassign','Aucun remplaçant disponible',$2) RETURNING *`,
        [lead.client_id, "Le technicien a refusé la demande et aucun autre professionnel compatible n’est libre sur le même créneau."]
      );
      await db.query("COMMIT");
      emitToUser(lead.client_id,"notification:new",notice.rows[0]);
      return res.json({ reassignedTo:null, clientNotified:true });
    }
    await db.query(
      `UPDATE leads SET technician_id=$1, status='new', appointment_id=COALESCE($2, appointment_id),
                        requested_date=$3, requested_time=$4, address=COALESCE($5, address)
       WHERE id=$6`,
      [replacement.id, lead.linked_appointment_id, slotDate, slotTime, lead.appointment_address, lead.id]
    );
    let appointment = null;
    if (lead.linked_appointment_id) {
      const updated = await db.query("UPDATE appointments SET technician_id=$1,status='pending' WHERE id=$2 RETURNING *", [replacement.id,lead.linked_appointment_id]);
      appointment = updated.rows[0];
    }
    const techNotice = await db.query(
      `INSERT INTO notifications(user_id,type,title,message) VALUES($1,'lead','Nouvelle demande disponible',$2) RETURNING *`,
      [replacement.id, `${lead.client_name} demande ${lead.problem} le ${slotDate} à ${slotTime}.`]
    );
    const clientNotice = await db.query(
      `INSERT INTO notifications(user_id,type,title,message) VALUES($1,'reassign','Nouveau technicien proposé',$2) RETURNING *`,
      [lead.client_id, `${replacement.name} remplace le technicien initial pour votre demande du ${slotDate} à ${slotTime}. Distance estimée : ${replacement.distance_km == null ? "indisponible" : `${replacement.distance_km.toFixed(1)} km`}.`]
    );
    await db.query("COMMIT");
    const reassignedLead = {
      ...lead,
      technician_id: replacement.id,
      status: "new",
      appointment_id: lead.linked_appointment_id || lead.appointment_id,
      requested_date: slotDate,
      requested_time: slotTime,
      address: lead.appointment_address,
    };
    emitToUser(replacement.id,"lead:new",reassignedLead);
    emitToUser(replacement.id,"notification:new",techNotice.rows[0]);
    emitToUser(lead.client_id,"notification:new",clientNotice.rows[0]);
    if (appointment) {
      emitToUser(replacement.id,"appointment:new",appointment);
      emitToUser(lead.client_id,"appointment:updated",appointment);
    }
    res.json({ reassignedTo:replacement.name, distanceKm:replacement.distance_km, sameSlot:true, date:slotDate, time:slotTime, clientNotified:true });
  } catch (err) {
    await db.query("ROLLBACK").catch(()=>{});
    res.status(500).json({ error: err.message });
  } finally { db.release(); }
});

router.post("/chat/quote", auth, (req, res) => res.status(410).json({
  error: "Endpoint remplacé par POST /api/pricing/quote",
}));

router.post("/chat/counter-offer", auth, requireRole("client"), async (req, res) => {
  res.json({ ok: true, amount: req.body.amount });
});

/* ===================== CONTACT TECHNICIAN ===================== */
router.post("/leads/contact", auth, requireRole("client"), async (req, res) => {
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

module.exports = router;
