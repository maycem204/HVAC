"use strict";

const AI_DEFAULTS = {
  deepseek: { baseUrl: "https://api.deepseek.com", model: "deepseek-chat", keyName: "DEEPSEEK_API_KEY" },
  openai: { baseUrl: "https://api.openai.com/v1", model: "", keyName: "OPENAI_API_KEY" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", model: "", keyName: "ANTHROPIC_API_KEY" },
};

function normalizeAiProvider(value) {
  const provider = String(value || "deepseek").toLowerCase();
  return provider === "claude" ? "anthropic" : provider;
}

function aiConfig(source = process.env) {
  const provider = normalizeAiProvider(source.AI_PROVIDER || source.LLM_PROVIDER);
  const defaults = AI_DEFAULTS[provider];
  if (!defaults) throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  const prefix = provider === "anthropic" ? "ANTHROPIC" : provider.toUpperCase();
  return {
    provider,
    apiKey: source.AI_API_KEY || source.LLM_API_KEY || source[defaults.keyName] || "",
    baseUrl: source.AI_BASE_URL || source.LLM_BASE_URL || source[`${prefix}_BASE_URL`] || defaults.baseUrl,
    model: source.AI_MODEL || source.LLM_MODEL || source[`${prefix}_MODEL`] || defaults.model,
  };
}

function embeddingConfig(source = process.env) {
  return {
    provider: String(source.EMBEDDING_PROVIDER || "openai-compatible").toLowerCase(),
    apiKey: source.EMBEDDING_API_KEY || "",
    baseUrl: source.EMBEDDING_BASE_URL || "http://127.0.0.1:8081/v1",
    model: source.EMBEDDING_MODEL || "Qwen/Qwen3-Embedding-8B",
  };
}

function geocodingConfig(source = process.env) {
  return {
    provider: String(source.GEOCODING_PROVIDER || "nominatim").toLowerCase(),
    baseUrl: source.GEOCODING_BASE_URL || "https://nominatim.openstreetmap.org",
    userAgent: source.GEOCODING_USER_AGENT || "QuoteAI-HVAC/1.0",
    apiKey: source.GEOCODING_API_KEY || "",
  };
}

module.exports = { aiConfig, embeddingConfig, geocodingConfig, normalizeAiProvider };
