"use strict";

const { OpenAiCompatibleClient } = require("./openai-compatible-client");
const { OpenAiClient } = require("./openai-client");
const { AnthropicClient } = require("./anthropic-client");

function createLlmClient(config) {
  const provider = String(config.llmProvider || "deepseek").toLowerCase();
  const shared = { apiKey: config.llmApiKey, baseUrl: config.llmBaseUrl, model: config.llmModel, timeoutMs: config.pricingLlmTimeoutMs };
  if (provider === "deepseek") return new OpenAiCompatibleClient({ ...shared, provider });
  if (provider === "openai") return new OpenAiClient(shared);
  if (provider === "anthropic" || provider === "claude") return new AnthropicClient(shared);
  throw new Error(`Unsupported LLM_PROVIDER: ${provider}`);
}

module.exports = { createLlmClient };
