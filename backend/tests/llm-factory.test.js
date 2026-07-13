"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createLlmClient } = require("../services/llm/factory");

for (const provider of ["deepseek", "openai", "anthropic"]) {
  test(`${provider} expose l'interface LLM métier stable`, () => {
    const client = createLlmClient({
      llmProvider: provider,
      llmApiKey: "test-key",
      llmBaseUrl: "https://provider.invalid/v1",
      llmModel: "test-model",
      pricingLlmTimeoutMs: 1000,
    });
    assert.equal(typeof client.extract, "function");
    assert.equal(typeof client.redact, "function");
    assert.equal(typeof client.judge, "function");
  });
}

test("un fournisseur inconnu est rejeté au démarrage", () => {
  assert.throws(() => createLlmClient({ llmProvider: "unknown" }), /unsupported/i);
});
