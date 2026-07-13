"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { structuralScore, faultConfidence, caseConfidence, decision } = require("../services/pricing/confidence");

test("applique les poids 0.3/0.3/0.4 et le MIN multi-pannes", () => {
  assert.equal(structuralScore({ countryMatch: true, interventionTypeMatch: true, equipmentTypeMatch: false }), 0.6);
  assert.equal(faultConfidence(0.8, 0.6), 0.72);
  assert.equal(caseConfidence([0.83, 0.54, 0.91]), 0.54);
  assert.deepEqual(decision(0.54), { route: "automatic", band: "medium" });
});
