"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { aiConfig, embeddingConfig, geocodingConfig } = require("../config/external-services");

test("AI_PROVIDER est prioritaire tout en gardant LLM_PROVIDER compatible", () => {
  assert.equal(aiConfig({ AI_PROVIDER:"openai", LLM_PROVIDER:"deepseek", OPENAI_MODEL:"gpt-test" }).provider, "openai");
  assert.equal(aiConfig({ LLM_PROVIDER:"claude" }).provider, "anthropic");
});

test("la configuration des embeddings et du géocodage est indépendante", () => {
  assert.equal(embeddingConfig({ EMBEDDING_PROVIDER:"gemini" }).provider, "gemini");
  assert.equal(geocodingConfig({ GEOCODING_PROVIDER:"nominatim" }).provider, "nominatim");
});
