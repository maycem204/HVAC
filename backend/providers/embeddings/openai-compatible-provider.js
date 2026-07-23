"use strict";

const { postJson } = require("../../services/pricing/http-client");

class OpenAiCompatibleEmbeddingProvider {
  constructor(config) { Object.assign(this, config); }

  async embed(values) {
    const headers = this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
    const body = { input: values, model: this.model, encoding_format: "float" };
    if (this.requestDimensions) body.dimensions = this.dimensions;
    const payload = await postJson(`${this.baseUrl}/embeddings`, {
      service: "embedding", timeoutMs: this.timeoutMs, headers, body,
    });
    return (payload.data || []).sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

module.exports = { OpenAiCompatibleEmbeddingProvider };
