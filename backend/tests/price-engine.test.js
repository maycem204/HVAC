"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateLine, calculateQuote } = require("../services/pricing/price-engine");

test("reproduit l'exemple CLR007 Tunisie sans multiplier les pièces", () => {
  const line = calculateLine({
    fault: { code: "CLR007", name: "Compresseur", base_parts_cost_usd: 100, estimated_hours: 4 },
    region: { exchange_rate_per_usd: 3.1, local_hourly_rate: 35, labour_adjustment: 1, equipment_import_factor: 1.1, currency_code: "TND" },
    urgency: { multiplier: 1 }, complexity: { multiplier: 1 }, season: { multiplier: 1 },
    fixedMargin: { margin_usd: 3 },
  });
  assert.deepEqual(line.components, { parts: 310, labour: 140, fixed_margin: 9.3, equipment: 0 });
  assert.equal(line.total, 459.3);
});

test("une confiance moyenne produit une fourchette large", () => {
  const quote = calculateQuote([{ currency: "TND", total: 500 }], "medium");
  assert.deepEqual(quote.range, { min: 400, max: 600 });
});

test("le minimum d'intervention empêche un prix inférieur au déplacement", () => {
  const quote = calculateQuote([{ currency: "DZD", total: 700 }], "high", 2500);
  assert.equal(quote.subtotal, 700);
  assert.equal(quote.service_minimum_adjustment, 1800);
  assert.equal(quote.total, 2500);
  assert.deepEqual(quote.range, { min: 2300, max: 2700 });
});

test("la marge fixe peut être neutralisée sur les pannes suivantes", () => {
  const line = calculateLine({
    fault: { code: "X", name: "Panne", base_parts_cost_usd: 10, estimated_hours: 1 },
    region: { exchange_rate_per_usd: 2, local_hourly_rate: 20, labour_adjustment: 1, equipment_import_factor: 1, currency_code: "TND" },
    urgency: { multiplier: 1 }, complexity: { multiplier: 1 }, season: { multiplier: 1 }, fixedMargin: { margin_usd: 0 },
  });
  assert.equal(line.components.fixed_margin, 0);
  assert.equal(line.total, 40);
});
