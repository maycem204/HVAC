"use strict";

const { createAiProvider } = require("../providers/ai/factory");

class AiService {
  constructor(provider) {
    this.provider = provider;
  }

  extract(input) { return this.provider.extract(input); }
  redact(input) { return this.provider.redact(input); }
  judge(input) { return this.provider.judge(input); }
}

function createAiService(config) {
  return new AiService(createAiProvider({
    provider: config.aiProvider || config.llmProvider,
    apiKey: config.aiApiKey || config.llmApiKey,
    baseUrl: config.aiBaseUrl || config.llmBaseUrl,
    model: config.aiModel || config.llmModel,
    timeoutMs: config.pricingLlmTimeoutMs,
  }));
}

module.exports = { AiService, createAiService };
