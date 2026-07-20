"use strict";

const express = require("express");
const { rateLimit } = require("express-rate-limit");
const auth = require("../middleware/auth");
const pool = require("../db");
const env = require("../env");
const { PricingRepository } = require("../services/pricing/repository");
const { createLlmClient } = require("../services/llm/factory");
const { EmbeddingClient } = require("../services/pricing/embedding-client");
const { PricingOrchestrator } = require("../services/pricing/orchestrator");
const { resolvePricingCountry } = require("../services/pricing/location-resolver");

const router = express.Router();
const orchestrator = new PricingOrchestrator({
  repository: new PricingRepository(pool),
  llm: createLlmClient(env),
  embeddings: new EmbeddingClient({
    apiKey: env.embeddingApiKey,
    enabled: env.embeddingEnabled,
    provider: env.embeddingProvider,
    baseUrl: env.embeddingBaseUrl,
    model: env.embeddingModel,
    dimensions: env.embeddingDimensions,
    requestDimensions: env.embeddingRequestDimensions,
    queryInstruction: env.embeddingQueryInstruction,
    timeoutMs: env.embeddingTimeoutMs,
  }),
});

const quoteLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 30, standardHeaders: "draft-8", legacyHeaders: false });

router.post("/quote", auth, quoteLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 4000) return res.status(400).json({ error: "Le message doit contenir entre 1 et 4000 caractères." });
    if (body.history != null && (!Array.isArray(body.history) || body.history.length > 30
      || body.history.some((message) => !message || !["user", "bot", "assistant"].includes(message.role)
        || typeof message.text !== "string" || message.text.length > 4000))) {
      return res.status(400).json({ error: "Historique invalide." });
    }
    const { lat, lng } = body.location || {};
    if (body.location && (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lng)) > 180)) {
      return res.status(400).json({ error: "Coordonnées invalides." });
    }
    const user = await pool.query("SELECT city, address, country_code, lat, lng FROM users WHERE id = $1", [req.user.id]);
    const clientCountry = resolvePricingCountry({
      text,
      explicitCountry: body.country,
      instantLocation: body.location,
      profile: user.rows[0],
    });
    const result = await orchestrator.quote({ text, history: body.history, clientCountry, clientId: req.user.id });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
