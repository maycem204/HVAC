"use strict";

const { LlmClient } = require("./llm-client");
const { parseJsonContent } = require("./json");
const { postJson } = require("../pricing/http-client");

class OpenAiClient extends LlmClient {
  constructor({ apiKey, baseUrl, model, timeoutMs }) {
    super();
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.timeoutMs = timeoutMs;
  }

  async generateJson({ operation, system, payload }) {
    if (!this.apiKey || !this.model) throw Object.assign(new Error("OpenAI is not configured"), { status: 503, code: "llm_not_configured" });
    const response = await postJson(`${this.baseUrl}/responses`, {
      service: "llm",
      timeoutMs: this.timeoutMs,
      headers: { authorization: `Bearer ${this.apiKey}` },
      body: {
        model: this.model,
        instructions: system,
        input: JSON.stringify(payload),
        text: { format: { type: "json_object" } },
      },
    });
    const content = response?.output_text
      || response?.output?.flatMap((item) => item.content || []).find((item) => item.type === "output_text")?.text;
    try { return parseJsonContent(content); }
    catch (error) { throw Object.assign(new Error(`OpenAI returned invalid JSON for ${operation}`), { code: "llm_invalid_json", cause: error }); }
  }
}

module.exports = { OpenAiClient };
