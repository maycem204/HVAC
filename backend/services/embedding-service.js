"use strict";

const { createEmbeddingProvider } = require("../providers/embeddings/factory");

function normalizeAndResize(vector, dimensions) {
  if (!Array.isArray(vector) || vector.some((value) => !Number.isFinite(value))) throw new Error("Embedding server returned an invalid vector");
  if (vector.length < dimensions) throw new Error(`Embedding server returned ${vector.length} dimensions; expected at least ${dimensions}`);
  const resized = vector.slice(0, dimensions);
  const norm = Math.sqrt(resized.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) throw new Error("Embedding server returned a zero vector");
  return resized.map((value) => value / norm);
}

class EmbeddingService {
  constructor({ apiKey, baseUrl, model, dimensions = 1024, enabled = true, provider = "openai-compatible", requestDimensions = false, queryInstruction = "", timeoutMs }) {
    this.enabled = enabled;
    this.providerName = provider;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.model = model;
    this.dimensions = dimensions;
    this.queryInstruction = queryInstruction.trim();
    this.provider = createEmbeddingProvider({
      apiKey, baseUrl: this.baseUrl, model, dimensions, requestDimensions, timeoutMs, provider,
    });
  }

  get storageModel() { return `${this.providerName}:${this.model}:${this.dimensions}`; }

  async embed(input, inputType) {
    if (!this.enabled) throw Object.assign(new Error("Embedding service disabled"), { code: "embedding_disabled" });
    const values = Array.isArray(input) ? input : [input];
    const prepared = inputType === "query" && this.queryInstruction
      ? values.map((value) => `Instruct: ${this.queryInstruction}\nQuery: ${value}`)
      : values;
    const vectors = (await this.provider.embed(prepared)).map((vector) => normalizeAndResize(vector, this.dimensions));
    if (vectors.length !== prepared.length) throw new Error(`Embedding server returned ${vectors.length} vectors for ${prepared.length} inputs`);
    return Array.isArray(input) ? vectors : vectors[0];
  }
}

function createEmbeddingService(config) {
  return new EmbeddingService({
    apiKey: config.embeddingApiKey,
    enabled: config.embeddingEnabled,
    provider: config.embeddingProvider,
    baseUrl: config.embeddingBaseUrl,
    model: config.embeddingModel,
    dimensions: config.embeddingDimensions,
    requestDimensions: config.embeddingRequestDimensions,
    queryInstruction: config.embeddingQueryInstruction,
    timeoutMs: config.embeddingTimeoutMs,
  });
}

module.exports = { EmbeddingService, createEmbeddingService, normalizeAndResize };
