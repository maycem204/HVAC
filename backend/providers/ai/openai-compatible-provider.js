"use strict";

const { LlmClient } = require("../../services/llm/llm-client");
const { parseJsonContent } = require("../../services/llm/json");
const { postJson } = require("../../services/pricing/http-client");

class OpenAiCompatibleClient extends LlmClient {
  constructor({ provider, apiKey, baseUrl, model, timeoutMs }) {
    super();
    this.provider = provider; this.apiKey = apiKey; this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model; this.timeoutMs = timeoutMs;
  }

  async generateJson({ operation, system, payload, temperature }) {
    if (!this.apiKey || !this.model) throw Object.assign(new Error(`${this.provider} is not configured`), { status:503, code:"llm_not_configured" });
    const response = await postJson(`${this.baseUrl}/chat/completions`, {
      service:"llm", timeoutMs:this.timeoutMs, headers:{ authorization:`Bearer ${this.apiKey}` },
      body:{ model:this.model, messages:[{role:"system",content:system},{role:"user",content:JSON.stringify(payload)}], temperature, response_format:{type:"json_object"} },
    });
    try { return parseJsonContent(response?.choices?.[0]?.message?.content); }
    catch (error) { throw Object.assign(new Error(`${this.provider} returned invalid JSON for ${operation}`), { code:"llm_invalid_json", cause:error }); }
  }
}

module.exports = { OpenAiCompatibleClient };
