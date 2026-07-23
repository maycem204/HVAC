"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseJsonContent } = require("../services/llm/json");

test("accepte un objet JSON entouré d'un bloc Markdown", () => {
  assert.deepEqual(parseJsonContent('```json\n{"valid":true}\n```'), { valid: true });
});

test("répare les retours à la ligne bruts dans une chaîne JSON", () => {
  assert.deepEqual(parseJsonContent('{"message":"Ligne 1\nLigne 2"}'), { message: "Ligne 1\nLigne 2" });
});
