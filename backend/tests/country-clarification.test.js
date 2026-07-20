"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PricingOrchestrator } = require("../services/pricing/orchestrator");

test("demande le pays avant la recherche et le calcul tarifaire", async () => {
  let embeddingCalled = false;
  const orchestrator = new PricingOrchestrator({
    repository: {},
    embeddings: { async embed() { embeddingCalled = true; } },
    llm: {
      async extract() {
        return {
          faults: [{ description: "remplacement compresseur climatiseur split", intervention_type: "Reparation", equipment_type: "climatiseur split" }],
          country: "",
          urgency: "Standard",
          complexity: "Modérée",
          season: "Haute saison été (clim)",
          clarification_needed: false,
        };
      },
    },
  });

  const result = await orchestrator.quote({ text: "remplacement compresseur climatiseur split" });
  assert.equal(result.status, "clarification");
  assert.match(result.question, /quel pays|dans quel pays/i);
  assert.equal(result.extraction.reason, "country_missing");
  assert.equal(embeddingCalled, false);
});
