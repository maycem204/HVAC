"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PricingOrchestrator } = require("../services/pricing/orchestrator");
const { technicianRelevance } = require("../services/pricing/repository");

test("applique une complexité différente à chaque panne extraite", async () => {
  const complexities = [];
  let candidateIndex = 0;
  const candidates = [
    { code: "A", name: "Nettoyage", semantic_score: 0.99, intervention_type: "Reparation", category: "Climatisation", subcategory: "Split", base_parts_cost_usd: 0, estimated_hours: 1 },
    { code: "B", name: "Compresseur", semantic_score: 0.99, intervention_type: "Reparation", category: "Climatisation", subcategory: "Split", base_parts_cost_usd: 20, estimated_hours: 2 },
  ];
  const repository = {
    async findCandidates() { return [candidates[candidateIndex++]]; },
    async getThresholds() { return { automatic: 0.7, uncertain: 0.5 }; },
    async getFactors(input) {
      complexities.push(input.complexity);
      return { region: { exchange_rate_per_usd: 3, local_hourly_rate: 20, labour_adjustment: 1, equipment_import_factor: 1, currency_code: "TND", minimum_service_price: 0 }, urgency: { multiplier: 1 }, complexity: { multiplier: input.complexity === "Élevée" ? 1.25 : 1 }, season: { multiplier: 1 }, margin: { margin_usd: 3 } };
    },
    async saveAudit() {},
  };
  const orchestrator = new PricingOrchestrator({
    repository,
    embeddings: { storageModel: "test", async embed() { return Array(1024).fill(0.01); } },
    llm: {
      async extract() { return { faults: [
        { description: "nettoyage filtre", intervention_type: "Reparation", equipment_type: "split", complexity: "Simple" },
        { description: "remplacement compresseur", intervention_type: "Reparation", equipment_type: "split", complexity: "Élevée" },
      ], country: "Tunisie", urgency: "Standard", complexity: "Élevée", season: "Haute saison été (clim)", clarification_needed: false }; },
      async redact() { return { message: "Devis" }; },
      async judge() { return { valid: true }; },
    },
  });

  const result = await orchestrator.quote({ text: "filtre et compresseur split en Tunisie" });
  assert.equal(result.status, "quote");
  assert.deepEqual(complexities, ["Simple", "Élevée"]);
});

test("classe un spécialiste climatisation devant un technicien sans rapport", () => {
  const extraction = { faults: [{ description: "remplacement compresseur split", equipment_type: "climatiseur split", intervention_type: "Reparation" }] };
  const specialist = technicianRelevance(["Climatisation", "Réfrigération"], extraction, "compresseur split");
  const unrelated = technicianRelevance(["Chauffage", "Installation"], extraction, "compresseur split");
  assert.ok(specialist > unrelated);
});

test("annonce le technicien réellement affecté lors du transfert humain", async () => {
  const orchestrator = new PricingOrchestrator({
    repository: {
      async saveAudit() {},
      async queueFallback() { return { assignment: { technicianId: 9, technicianName: "Sami", distanceKm: 2.4 } }; },
    },
    embeddings: {},
    llm: { async extract() { throw new Error("indisponible"); } },
  });
  const result = await orchestrator.quote({ text: "panne complexe", clientId: 2 });
  assert.equal(result.assignment.technicianId, 9);
  assert.match(result.message, /Sami/);
});
