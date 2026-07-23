"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { OpenAiCompatibleClient } = require("../providers/ai/openai-compatible-provider");
const { OpenAiClient } = require("../providers/ai/openai-provider");
const { AnthropicClient } = require("../providers/ai/anthropic-provider");

function response(payload) {
  return { ok: true, status: 200, async json() { return payload; } };
}

test("DeepSeek traduit extract() vers Chat Completions", async () => {
  const original = global.fetch;
  let calledUrl;
  global.fetch = async (url) => { calledUrl = url; return response({ choices: [{ message: { content: '{"faults":[]}' } }] }); };
  try {
    const client = new OpenAiCompatibleClient({ provider: "deepseek", apiKey: "key", baseUrl: "https://deepseek.invalid", model: "model", timeoutMs: 1000 });
    assert.deepEqual(await client.extract({ text: "test" }), { faults: [] });
    assert.match(calledUrl, /chat\/completions$/);
  } finally { global.fetch = original; }
});

test("OpenAI traduit redact() vers Responses", async () => {
  const original = global.fetch;
  let calledUrl;
  global.fetch = async (url) => { calledUrl = url; return response({ output: [{ content: [{ type: "output_text", text: '{"message":"ok"}' }] }] }); };
  try {
    const client = new OpenAiClient({ apiKey: "key", baseUrl: "https://openai.invalid/v1", model: "model", timeoutMs: 1000 });
    assert.deepEqual(await client.redact({}), { message: "ok" });
    assert.match(calledUrl, /responses$/);
  } finally { global.fetch = original; }
});

test("Anthropic traduit judge() vers Messages", async () => {
  const original = global.fetch;
  let calledUrl;
  global.fetch = async (url) => { calledUrl = url; return response({ content: [{ type: "text", text: '{"valid":true}' }] }); };
  try {
    const client = new AnthropicClient({ apiKey: "key", baseUrl: "https://anthropic.invalid/v1", model: "model", timeoutMs: 1000 });
    assert.deepEqual(await client.judge({}), { valid: true });
    assert.match(calledUrl, /messages$/);
  } finally { global.fetch = original; }
});
