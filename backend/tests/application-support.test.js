"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizedSpecialty, specialtyMatches } = require("../services/application-support");

test("normalise les spécialités utilisées par la recherche de disponibilités", () => {
  assert.equal(normalizedSpecialty("Dépannage HVAC"), "depannage hvac");
  assert.equal(specialtyMatches(["Réparation", "Climatisation"], "Climatisation"), true);
});
