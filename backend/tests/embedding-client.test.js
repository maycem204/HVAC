"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { EmbeddingClient, normalizeAndResize } = require("../services/pricing/embedding-client");

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
  assert.equal(client.storageModel, "Qwen/Qwen3-Embedding-8B:1024");
});
