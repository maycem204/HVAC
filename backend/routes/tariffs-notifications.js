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

router.get("/tarifs", auth, requireRole("technician"), async (req, res) => {
  try {
    const result = await pool.query(`SELECT * FROM price_items WHERE technician_id = $1 ORDER BY category, id`, [req.user.id]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/tarifs", auth, requireRole("technician"), async (req, res) => {
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

router.patch("/tarifs/:id", auth, requireRole("technician"), async (req, res) => {
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

router.post("/tarifs/import", auth, requireRole("technician"), async (req, res, next) => {
  try { res.json(await replaceTariffs(req.user.id, req.body?.items, await technicianMarket(req.user.id))); } catch (error) { next(error); }
});

router.get("/tarifs/context", auth, requireRole("technician"), async (req, res, next) => {
  try { res.json(await technicianMarket(req.user.id)); } catch (error) { next(error); }
});

router.post("/tarifs/import-file", auth, requireRole("technician"), tariffUpload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Fichier manquant" });
    const items = await parseTariffFile(req.file);
    const market = await technicianMarket(req.user.id);
    const saved = await replaceTariffs(req.user.id, items, { ...market, filename: req.file.originalname });
    res.json({ items: saved, imported_count: items.length, filename: req.file.originalname, country_code: market.countryCode, currency: market.currency });
  } catch (error) { next(error); }
});

/* ===================== NOTIFICATIONS ===================== */
router.get("/notifications", auth, async (req, res) => {
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

router.patch("/notifications/:id/read", auth, async (req, res) => {
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

router.patch("/notifications/read-all", auth, async (req, res) => {
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


module.exports = router;
