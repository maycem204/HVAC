const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

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

const corsOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const llmProvider = (process.env.LLM_PROVIDER || "deepseek").toLowerCase();
const providerDefaults = {
  deepseek: {
    apiKey: process.env.DEEPSEEK_API_KEY || "",
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY || "",
    baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
    model: process.env.OPENAI_MODEL || "",
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || "",
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
    model: process.env.ANTHROPIC_MODEL || "",
  },
};
const activeProvider = llmProvider === "claude" ? providerDefaults.anthropic : providerDefaults[llmProvider];
if (!activeProvider) throw new Error(`Unsupported LLM_PROVIDER: ${llmProvider}`);

module.exports = {
  port: envInt("PORT", 5000),
  databaseUrl: requireEnv("DATABASE_URL"),
  databaseSsl: process.env.DATABASE_SSL === "true",
  jwtSecret: requireEnv("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jwtIssuer: process.env.JWT_ISSUER || "quoteai-api",
  jwtAudience: process.env.JWT_AUDIENCE || "quoteai-web",
  bcryptRounds: envInt("BCRYPT_ROUNDS", 10),
  corsOrigins: corsOrigins.length > 0 ? corsOrigins : [
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
  llmProvider,
  llmApiKey: process.env.LLM_API_KEY || activeProvider.apiKey,
  llmBaseUrl: process.env.LLM_BASE_URL || activeProvider.baseUrl,
  llmModel: process.env.LLM_MODEL || activeProvider.model,
  embeddingApiKey: process.env.EMBEDDING_API_KEY || "",
  embeddingBaseUrl: process.env.EMBEDDING_BASE_URL || "http://127.0.0.1:8081/v1",
  embeddingModel: process.env.EMBEDDING_MODEL || "Qwen/Qwen3-Embedding-8B",
  embeddingDimensions: envInt("EMBEDDING_DIMENSIONS", 1024),
  embeddingQueryInstruction: process.env.EMBEDDING_QUERY_INSTRUCTION ?? "Retrieve the HVAC fault catalog entry that best matches the user request",
  embeddingBatchSize: envInt("EMBEDDING_BATCH_SIZE", 16),
  embeddingTimeoutMs: envInt("EMBEDDING_TIMEOUT_MS", 180000),
  pricingLlmTimeoutMs: envInt("PRICING_LLM_TIMEOUT_MS", 30000),
  geocodingBaseUrl: process.env.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org",
  geocodingUserAgent: process.env.GEOCODING_USER_AGENT || "QuoteAI-HVAC/1.0",
};
