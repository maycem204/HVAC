"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createApplicationSupport, normalizedSpecialty, specialtyMatches } = require("../services/application-support");

test("normalise les spécialités utilisées par la recherche de disponibilités", () => {
  assert.equal(normalizedSpecialty("Dépannage HVAC"), "depannage hvac");
  assert.equal(specialtyMatches(["Réparation", "Climatisation"], "Climatisation"), true);
  assert.equal(specialtyMatches(["Réparation de climatiseurs industriels"], "Climatisation"), true);
  assert.equal(specialtyMatches(["Réparation générale"], "Climatisation"), false);
});

function availabilityWith(schedule) {
  const pool = {
    async query(sql) {
      if (sql.includes("FROM appointments")) return { rows:[] };
      if (sql.includes("FROM blocked_slots")) return { rows:[] };
      if (sql.includes("FROM technician_working_hours")) return { rows:[schedule] };
      throw new Error(`Unexpected query: ${sql}`);
    },
  };
  return createApplicationSupport(pool).isTechnicianAvailable;
}

test("refuse une réservation pendant un jour non travaillé", async () => {
  const available = availabilityWith({ enabled:false, start_time:"08:00", end_time:"18:00" });
  const result = await available(4, "2026-07-20", "10:00");
  assert.equal(result.available, false);
  assert.match(result.reason, /horaires de travail/);
});

test("exige que les deux heures d'intervention tiennent dans les horaires", async () => {
  const available = availabilityWith({ enabled:true, start_time:"08:00", end_time:"18:00" });
  assert.equal((await available(4, "2026-07-20", "16:00")).available, true);
  assert.equal((await available(4, "2026-07-20", "17:00")).available, false);
});
