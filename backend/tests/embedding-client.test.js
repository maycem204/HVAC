"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EmbeddingService: EmbeddingClient, normalizeAndResize } = require("../services/embedding-service");

test("réduit et normalise une sortie Qwen MRL à 1024 dimensions", () => {
  const vector = normalizeAndResize(Array(4096).fill(2), 1024);
  assert.equal(vector.length, 1024);
  assert.ok(Math.abs(Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) - 1) < 1e-12);
});

test("identifie le modèle et sa dimension pour forcer le ré-embedding", () => {
  const client = new EmbeddingClient({
    baseUrl: "http://127.0.0.1:8080/v1/",
    model: "Qwen/Qwen3-Embedding-8B",
    dimensions: 1024,
  });
  assert.equal(client.baseUrl, "http://127.0.0.1:8080/v1");
  assert.equal(client.storageModel, "openai-compatible:Qwen/Qwen3-Embedding-8B:1024");
});

test("envoie la dimension attendue aux fournisseurs compatibles", async (t) => {
  const originalFetch = global.fetch;
  let requestBody;
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: [{ index: 0, embedding: Array(1024).fill(1) }] }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const client = new EmbeddingClient({
    apiKey: "test-key",
    baseUrl: "https://api.openai.com/v1",
    model: "text-embedding-3-small",
    dimensions: 1024,
    requestDimensions: true,
  });
  const vector = await client.embed("code E7", "query");

  assert.equal(requestBody.dimensions, 1024);
  assert.equal(requestBody.model, "text-embedding-3-small");
  assert.equal(vector.length, 1024);
});

test("traduit les embeddings Gemini vers le format vectoriel interne", async (t) => {
  const originalFetch = global.fetch;
  let requestUrl;
  let requestHeaders;
  let requestBody;
  global.fetch = async (url, options) => {
    requestUrl = url;
    requestHeaders = options.headers;
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ embedding: { values: Array(1024).fill(2) } }) };
  };
  t.after(() => { global.fetch = originalFetch; });

  const client = new EmbeddingClient({
    apiKey: "gemini-test-key",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    provider: "gemini",
    model: "gemini-embedding-2",
    dimensions: 1024,
  });
  const vector = await client.embed("code E7 climatiseur LG", "query");

  assert.match(requestUrl, /gemini-embedding-2:embedContent$/);
  assert.equal(requestHeaders["x-goog-api-key"], "gemini-test-key");
  assert.equal(requestBody.output_dimensionality, 1024);
  assert.match(requestBody.content.parts[0].text, /code E7/i);
  assert.equal(vector.length, 1024);
  assert.equal(client.storageModel, "gemini:gemini-embedding-2:1024");
});
