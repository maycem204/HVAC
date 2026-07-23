"use strict";

const { GeminiEmbeddingProvider } = require("./gemini-provider");
const { OpenAiCompatibleEmbeddingProvider } = require("./openai-compatible-provider");

function createEmbeddingProvider(config) {
  if (config.provider === "gemini") return new GeminiEmbeddingProvider(config);
  if (["openai", "openai-compatible", "local"].includes(config.provider)) {
    return new OpenAiCompatibleEmbeddingProvider(config);
  }
  throw new Error(`Unsupported EMBEDDING_PROVIDER: ${config.provider}`);
}

module.exports = { createEmbeddingProvider };
