"use strict";

const { postJson } = require("./http-client");

function normalizeAndResize(vector, dimensions) {
  if (!Array.isArray(vector) || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Embedding server returned an invalid vector");
  }
  if (vector.length < dimensions) {
    throw new Error(`Embedding server returned ${vector.length} dimensions; expected at least ${dimensions}`);
  }

  const resized = vector.slice(0, dimensions);
  const norm = Math.sqrt(resized.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Embedding server returned a zero vector");
  return resized.map((value) => value / norm);
}

class EmbeddingClient {
  constructor({ apiKey, baseUrl, model, dimensions = 1024, enabled = true, provider = "openai-compatible", requestDimensions = false, queryInstruction = "", timeoutMs }) {
    this.apiKey = apiKey;
    this.enabled = enabled;
    this.provider = provider;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.dimensions = dimensions;
    this.requestDimensions = requestDimensions;
    this.queryInstruction = queryInstruction.trim();
    this.timeoutMs = timeoutMs;
  }

  get storageModel() {
    return `${this.provider}:${this.model}:${this.dimensions}`;
  }

  async embed(input, inputType) {
    if (!this.enabled) throw Object.assign(new Error("Embedding service disabled"), { code: "embedding_disabled" });
    const values = Array.isArray(input) ? input : [input];
    const prepared = inputType === "query" && this.queryInstruction
      ? values.map((value) => `Instruct: ${this.queryInstruction}\nQuery: ${value}`)
      : values;
    if (this.provider === "gemini") {
      if (!this.apiKey) throw Object.assign(new Error("Gemini embedding API key is missing"), { code: "embedding_not_configured" });
      const vectors = [];
      for (const value of prepared) {
        const payload = await postJson(`${this.baseUrl}/models/${this.model}:embedContent`, {
          service: "embedding",
          timeoutMs: this.timeoutMs,
          headers: { "x-goog-api-key": this.apiKey },
          body: {
            content: { parts: [{ text: value }] },
            output_dimensionality: this.dimensions,
          },
        });
        vectors.push(normalizeAndResize(payload?.embedding?.values, this.dimensions));
      }
      return Array.isArray(input) ? vectors : vectors[0];
    }

    const headers = this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {};
    const body = { input: prepared, model: this.model, encoding_format: "float" };
    if (this.requestDimensions) body.dimensions = this.dimensions;
    const payload = await postJson(`${this.baseUrl}/embeddings`, {
      service: "embedding",
      timeoutMs: this.timeoutMs,
      headers,
      body,
    });
    const vectors = (payload.data || [])
      .sort((a, b) => a.index - b.index)
      .map((item) => normalizeAndResize(item.embedding, this.dimensions));
    if (vectors.length !== prepared.length) {
      throw new Error(`Embedding server returned ${vectors.length} vectors for ${prepared.length} inputs`);
    }
    return Array.isArray(input) ? vectors : vectors[0];
  }
}

module.exports = { EmbeddingClient, normalizeAndResize };
