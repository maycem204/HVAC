"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PricingOrchestrator } = require("../services/pricing/orchestrator");

test("utilise la recherche textuelle gratuite lorsque les embeddings sont désactivés", async () => {
  const repository = {
    async findTextCandidates() {
      return [{ code: "CLR001", name: "Diagnostic climatisation", semantic_score: 0.9, intervention_type: "Reparation", category: "Climatisation", subcategory: "Split", base_parts_cost_usd: 0, estimated_hours: 1 }];
    },
    async getThresholds() { return { automatic: 0.7, uncertain: 0.5 }; },
    async getFactors() {
      return {
        region: { exchange_rate_per_usd: 3.1, local_hourly_rate: 25, labour_adjustment: 1, equipment_import_factor: 1, currency_code: "TND", minimum_service_price: 45 },
        urgency: { multiplier: 1 }, complexity: { multiplier: 1 }, season: { multiplier: 1 }, margin: { margin_usd: 3 },
      };
    },
    async saveAudit() {},
    async queueFallback() {},
  };
  const orchestrator = new PricingOrchestrator({
    repository,
    embeddings: { storageModel: "disabled", async embed() { throw new Error("disabled"); } },
    llm: {
      async extract() {
        return { faults: [{ description: "climatiseur ne refroidit plus", intervention_type: "Reparation", equipment_type: "climatiseur" }], country: "Tunisie", urgency: "Standard", complexity: "Simple", season: "Saison intermédiaire", clarification_needed: false };
      },
      async redact() { return { message: "Estimation contrôlée : 45 TND" }; },
      async judge() { return { valid: true }; },
    },
  });

  const result = await orchestrator.quote({ text: "ma clim ne refroidit plus et souffle chaud", clientId: 4 });
  assert.equal(result.status, "quote");
  assert.equal(result.matches[0].retrieval, "text");
  assert.equal(result.calculation.currency, "TND");
});
