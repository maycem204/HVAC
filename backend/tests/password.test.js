"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { validatePassword } = require("../utils/password");

test("accepte une phrase simple de huit caractères", () => {
  assert.equal(validatePassword("soleil bleu", { name: "Amine Ben", email: "amine@example.com" }), null);
});

test("refuse les données personnelles et les mots de passe courants", () => {
  assert.match(validatePassword("amine2026", { name: "Amine Ben", email: "amine@example.com" }), /nom|e-mail/);
  assert.match(validatePassword("password", {}), /courant/);
});
