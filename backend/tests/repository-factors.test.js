"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PricingRepository } = require("../services/pricing/repository");

test("accepte un libellé LLM sans le qualificatif saisonnier du catalogue", async () => {
  const results = [
    { rows: [{ country: "Tunisie", currency_code: "TND" }] },
    { rows: [{ level: "Standard", multiplier: 1 }] },
    { rows: [{ level: "Modérée", multiplier: 1.1 }] },
    { rows: [{ period: "Haute saison été (clim)", multiplier: 1.15 }] },
    { rows: [{ intervention_type: "Reparation", margin_usd: 3 }] },
    { rows: [] },
  ];
  const repository = new PricingRepository({
    query: async () => results.shift(),
  });

  const factors = await repository.getFactors({
    country: "Tunisie",
    urgency: "Standard",
    complexity: "Modérée",
    season: "Haute saison été",
    interventionType: "Reparation",
  });

  assert.equal(factors.season.period, "Haute saison été (clim)");
  assert.equal(factors.season.multiplier, 1.15);
});
