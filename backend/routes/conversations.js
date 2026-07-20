"use strict";

const express = require("express");
const { rateLimit } = require("express-rate-limit");
const auth = require("../middleware/auth");
const { requireRole } = require("../middleware/auth");
const pool = require("../db");
const { emitToUser } = require("../realtime");

const router = express.Router();
const messageLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

async function conversationForUser(id, userId) {
  const result = await pool.query(
    `SELECT c.* FROM conversations c
     WHERE c.id = $1 AND (c.client_id = $2 OR c.technician_id = $2)`,
    [id, userId]
  );
  return result.rows[0] || null;
}

async function hasAcceptedAppointment(clientId, technicianId) {
  const result = await pool.query(
    `SELECT 1 FROM appointments
     WHERE client_id = $1 AND technician_id = $2
       AND status IN ('confirmed', 'completed')
     LIMIT 1`,
    [clientId, technicianId]
  );
  return result.rows.length > 0;
}

function counterpartId(conversation, userId) {
  return Number(conversation.client_id) === Number(userId) ? conversation.technician_id : conversation.client_id;
}

router.get("/", auth, async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.client_id, c.technician_id, c.created_at, c.updated_at,
              other.id AS counterpart_id, other.name AS counterpart_name, other.phone AS counterpart_phone,
              other.avatar AS counterpart_avatar, other.role AS counterpart_role,
              last_message.body AS last_message, last_message.created_at AS last_message_at,
              COALESCE(unread.count, 0)::int AS unread_count
       FROM conversations c
       JOIN users client_user ON client_user.id = c.client_id AND client_user.role = 'client'
       JOIN users technician_user ON technician_user.id = c.technician_id AND technician_user.role = 'technician'
       JOIN users other ON other.id = CASE WHEN c.client_id = $1 THEN c.technician_id ELSE c.client_id END
       LEFT JOIN LATERAL (
         SELECT body, created_at FROM conversation_messages
         WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1
       ) last_message ON true
       LEFT JOIN LATERAL (
         SELECT COUNT(*) AS count FROM conversation_messages
         WHERE conversation_id = c.id AND sender_id <> $1 AND read_at IS NULL
       ) unread ON true
       WHERE (c.client_id = $1 OR c.technician_id = $1)
       ORDER BY COALESCE(last_message.created_at, c.updated_at) DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post("/", auth, requireRole("client"), async (req, res, next) => {
  try {
    const technicianId = Number(req.body?.technicianId);
    if (!Number.isInteger(technicianId)) return res.status(400).json({ error: "Technicien invalide" });
    const technician = await pool.query(
      `SELECT u.id, u.name, u.phone, u.avatar, u.role
       FROM users u JOIN technician_profiles t ON t.user_id = u.id
       WHERE u.id = $1 AND u.role = 'technician'`,
      [technicianId]
    );
    if (!technician.rows.length) return res.status(404).json({ error: "Technicien introuvable" });
    if (!(await hasAcceptedAppointment(req.user.id, technicianId))) {
      return res.status(403).json({ error: "La messagerie sera disponible après l’acceptation du créneau par le technicien." });
    }
    const result = await pool.query(
      `INSERT INTO conversations (client_id, technician_id)
       VALUES ($1, $2)
       ON CONFLICT (client_id, technician_id) DO UPDATE SET updated_at = now()
       RETURNING *`,
      [req.user.id, technicianId]
    );
    const conversation = result.rows[0];
    res.json({
      ...conversation,
      counterpart_id: technician.rows[0].id,
      counterpart_name: technician.rows[0].name,
      counterpart_phone: technician.rows[0].phone,
      counterpart_avatar: technician.rows[0].avatar,
      counterpart_role: technician.rows[0].role,
    });
  } catch (error) { next(error); }
});

router.get("/:id/messages", auth, async (req, res, next) => {
  try {
    const conversation = await conversationForUser(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable" });
    const result = await pool.query(
      `SELECT * FROM (
         SELECT m.id, m.conversation_id, m.sender_id, u.name AS sender_name, m.body, m.created_at, m.read_at
         FROM conversation_messages m JOIN users u ON u.id = m.sender_id
         WHERE m.conversation_id = $1 ORDER BY m.created_at DESC LIMIT 1000
       ) recent ORDER BY created_at ASC`,
      [conversation.id]
    );
    await pool.query(
      `UPDATE conversation_messages SET read_at = now()
       WHERE conversation_id = $1 AND sender_id <> $2 AND read_at IS NULL`,
      [conversation.id, req.user.id]
    );
    res.json(result.rows);
  } catch (error) { next(error); }
});

router.post("/:id/messages", auth, messageLimiter, async (req, res, next) => {
  try {
    const body = typeof req.body?.body === "string" ? req.body.body.trim() : "";
    if (!body || body.length > 2000) return res.status(400).json({ error: "Le message doit contenir entre 1 et 2000 caractères" });
    const conversation = await conversationForUser(req.params.id, req.user.id);
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable" });
    const result = await pool.query(
      `INSERT INTO conversation_messages (conversation_id, sender_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, conversation_id, sender_id, body, created_at, read_at`,
      [conversation.id, req.user.id, body]
    );
    await pool.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversation.id]);
    const recipientId = counterpartId(conversation, req.user.id);
    const sender = await pool.query("SELECT name FROM users WHERE id = $1", [req.user.id]);
    await pool.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES ($1, 'message', 'Nouveau message', $2)`,
      [recipientId, `${sender.rows[0]?.name || "Un utilisateur"} vous a envoyé un message`]
    );
    const message = { ...result.rows[0], sender_name: sender.rows[0]?.name };
    emitToUser(recipientId, "message:new", message);
    emitToUser(req.user.id, "message:new", message);
    res.status(201).json(message);
  } catch (error) { next(error); }
});

module.exports = router;
