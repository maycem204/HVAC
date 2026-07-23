const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const { aiConfig, embeddingConfig, geocodingConfig } = require("./config/external-services");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be an integer`);
  }
  return value;
}

function envBool(name, fallback = false) {
  const raw = process.env[name];
  if (raw == null || raw === "") return fallback;
  if (["true", "1", "yes"].includes(raw.toLowerCase())) return true;
  if (["false", "0", "no"].includes(raw.toLowerCase())) return false;
  throw new Error(`Environment variable ${name} must be a boolean`);
}

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const ai = aiConfig();
const embeddings = embeddingConfig();
const geocoding = geocodingConfig();

module.exports = {
  port: envInt("PORT", 5000),
  databaseUrl: requireEnv("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL === "true",
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jwtIssuer: process.env.JWT_ISSUER || "quoteai-api",
  jwtAudience: process.env.JWT_AUDIENCE || "quoteai-web",
  authCookieMaxAgeMs: envInt("AUTH_COOKIE_MAX_AGE_MS", 7 * 24 * 60 * 60 * 1000),
  bcryptRounds: envInt("BCRYPT_ROUNDS", 10),
  corsOrigins: corsOrigins.length > 0 ? corsOrigins : process.env.NODE_ENV === "production" ? [] : [
    "http://localhost:5174",
    "http://localhost:3000",
    "http://127.0.0.1:5174",
    "http://127.0.0.1:3000",
  ],
  seedClientPassword: process.env.SEED_CLIENT_PASSWORD || "Client@123",
  seedTechPassword: process.env.SEED_TECH_PASSWORD || "Tech@123",
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || "",
  deepseekBaseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  deepseekModel: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  aiProvider: ai.provider,
  aiApiKey: ai.apiKey,
  aiBaseUrl: ai.baseUrl,
  aiModel: ai.model,
  // Noms historiques conservés pour les modules et déploiements existants.
  llmProvider: ai.provider,
  llmApiKey: ai.apiKey,
  llmBaseUrl: ai.baseUrl,
  llmModel: ai.model,
  embeddingApiKey: embeddings.apiKey,
  embeddingEnabled: envBool("EMBEDDING_ENABLED", true),
  embeddingProvider: embeddings.provider,
  embeddingBaseUrl: embeddings.baseUrl,
  embeddingModel: embeddings.model,
  embeddingDimensions: envInt("EMBEDDING_DIMENSIONS", 1024),
  embeddingRequestDimensions: envBool("EMBEDDING_REQUEST_DIMENSIONS", false),
  embeddingQueryInstruction: process.env.EMBEDDING_QUERY_INSTRUCTION ?? "Retrieve the HVAC fault catalog entry that best matches the user request",
  embeddingBatchSize: envInt("EMBEDDING_BATCH_SIZE", 16),
  embeddingTimeoutMs: envInt("EMBEDDING_TIMEOUT_MS", 180000),
  embeddingQuotaRetryMs: envInt("EMBEDDING_QUOTA_RETRY_MS", 15 * 60 * 1000),
  pricingLlmTimeoutMs: envInt("PRICING_LLM_TIMEOUT_MS", 30000),
  geocodingProvider: geocoding.provider,
  geocodingBaseUrl: geocoding.baseUrl,
  geocodingUserAgent: geocoding.userAgent,
  geocodingApiKey: geocoding.apiKey,
  mapTileOrigins: (process.env.MAP_TILE_ORIGINS || "https://tile.openstreetmap.org").split(",").map((value) => value.trim()).filter(Boolean),
};
