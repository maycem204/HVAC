"use strict";

const { LlmClient } = require("./llm-client");
const { parseJsonContent } = require("./json");
const { postJson } = require("../pricing/http-client");

class AnthropicClient extends LlmClient {
  constructor({ apiKey, baseUrl, model, timeoutMs }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async generateJson({ operation, system, payload, temperature }) {
    if (!this.apiKey || !this.model) throw Object.assign(new Error("Anthropic is not configured"), { status: 503, code: "llm_not_configured" });
    const response = await postJson(`${this.baseUrl}/messages`, {
      service: "llm",
      timeoutMs: this.timeoutMs,
      headers: { "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: {
        model: this.model,
        max_tokens: 4096,
        system,
        messages: [{ role: "user", content: JSON.stringify(payload) }],
        temperature,
      },
    });
    const content = response?.content?.filter((item) => item.type === "text").map((item) => item.text).join("\n");
    try { return parseJsonContent(content); }
    catch (error) { throw Object.assign(new Error(`Anthropic returned invalid JSON for ${operation}`), { code: "llm_invalid_json", cause: error }); }
  }
}

module.exports = { AnthropicClient };
