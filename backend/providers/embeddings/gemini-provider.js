"use strict";

const { postJson } = require("../../services/pricing/http-client");

class GeminiEmbeddingProvider {
  constructor(config) { Object.assign(this, config); }

  async embed(values) {
    if (!this.apiKey) throw Object.assign(new Error("Gemini embedding API key is missing"), { code: "embedding_not_configured" });
    const vectors = [];
    for (const value of values) {
      const payload = await postJson(`${this.baseUrl}/models/${this.model}:embedContent`, {
        service: "embedding",
        timeoutMs: this.timeoutMs,
        headers: { "x-goog-api-key": this.apiKey },
        body: { content: { parts: [{ text: value }] }, output_dimensionality: this.dimensions },
      });
      vectors.push(payload?.embedding?.values);
    }
    return vectors;
  }
}

module.exports = { GeminiEmbeddingProvider };
