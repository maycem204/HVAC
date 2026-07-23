"use strict";

const { OpenAiCompatibleClient } = require("./openai-compatible-provider");
const { OpenAiClient } = require("./openai-provider");
const { AnthropicClient } = require("./anthropic-provider");

function createAiProvider(config) {
  const provider = String(config.provider || "deepseek").toLowerCase();
  const shared = { apiKey: config.apiKey, baseUrl: config.baseUrl, model: config.model, timeoutMs: config.timeoutMs };
  if (provider === "deepseek") return new OpenAiCompatibleClient({ ...shared, provider });
  if (provider === "openai") return new OpenAiClient(shared);
  if (provider === "anthropic" || provider === "claude") return new AnthropicClient(shared);
  throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
}

module.exports = { createAiProvider };
