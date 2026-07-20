"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { PricingOrchestrator } = require("../services/pricing/orchestrator");

test("une salutation retourne la clarification dynamique du LLM sans lancer les embeddings", async () => {
  let embeddingCalled = false;
  const orchestrator = new PricingOrchestrator({
    repository: {},
    embeddings: {
      async embed() { embeddingCalled = true; },
    },
    llm: {
      async extract() {
        return {
          faults: [],
          clarification_needed: true,
          clarification_question: "Bonjour ! Quel problème rencontrez-vous avec votre équipement HVAC ?",
        };
      },
    },
  });

  const result = await orchestrator.quote({ text: "salut", history: [] });

  assert.equal(result.status, "clarification");
  assert.match(result.question, /quel problème/i);
  assert.equal(embeddingCalled, false);
});

test("un message vide est rejeté avant l'appel au LLM", async () => {
  const orchestrator = new PricingOrchestrator({ repository: {}, embeddings: {}, llm: {} });
  await assert.rejects(() => orchestrator.quote({ text: "   " }), /message is required/i);
});

test("détecte l'arabe et revient au français lorsque le client change de langue", () => {
  const orchestrator = new PricingOrchestrator({ repository:{}, embeddings:{}, llm:{} });
  assert.equal(orchestrator.detectResponseLanguage("المكيف لا يبرد", []), "ar");
  assert.equal(orchestrator.detectResponseLanguage("la clim ne refroidit plus", [{ role:"user", text:"السلام" }]), "fr");
});

test("remplace une clarification française du LLM par une clarification arabe", async () => {
  const orchestrator = new PricingOrchestrator({
    repository:{}, embeddings:{},
    llm:{ async extract(){ return { faults:[], clarification_needed:true, clarification_question:"Pouvez-vous préciser ?" }; } },
  });
  const result = await orchestrator.quote({ text:"المكيف معطل", history:[] });
  assert.equal(result.status, "clarification");
  assert.match(result.question, /[\u0600-\u06ff]/);
  assert.equal(result.extraction.response_language, "ar");
});

test("une panne générique demande le symptôme et ne calcule jamais de prix", async () => {
  let llmCalled = false;
  const orchestrator = new PricingOrchestrator({ repository: {}, embeddings: {}, llm: { async extract() { llmCalled = true; } } });
  const result = await orchestrator.quote({ text: "Climatiseur LG en panne", history: [] });
  assert.equal(result.status, "clarification");
  assert.match(result.question, /refroidit|fuit|bruit|code/i);
  assert.equal(llmCalled, false);
});

test("un simple manque de froid exige des observations avant tout devis", async () => {
  let llmCalled=false;
  const orchestrator=new PricingOrchestrator({repository:{},embeddings:{},llm:{async extract(){llmCalled=true;}}});
  const result=await orchestrator.quote({text:"Ma clim Daikin split ne refroidit plus",history:[]});
  assert.equal(result.status,"clarification");
  assert.match(result.question,/souffle|extérieure|givre/i);
  assert.equal(llmCalled,false);
});

test("une installation explicite remplace la clarification de panne précédente", async () => {
  let llmCalled = false;
  const orchestrator = new PricingOrchestrator({
    repository: {}, embeddings: {},
    llm: { async extract() { llmCalled = true; throw new Error("test stop"); } },
  });
  const result = await orchestrator.quote({
    text: "Installation climatiseur split mural 12000 BTU",
    history: [{ role:"user", text:"Ma clim ne refroidit plus" }, { role:"bot", text:"L’appareil souffle-t-il ?" }],
  });
  assert.equal(llmCalled, true);
  assert.equal(result.status, "human_handoff");
});

test("la réponse air chaud poursuit le diagnostic sans retomber sur la clarification initiale", async () => {
  let llmCalled = false;
  const orchestrator = new PricingOrchestrator({
    repository: {}, embeddings: {},
    llm: { async extract() { llmCalled = true; throw new Error("test stop"); } },
  });
  const history = [
    { role: "user", text: "Ma clim Daikin split ne refroidit plus" },
    { role: "bot", text: "L’appareil souffle-t-il de l’air ?" },
  ];
  const result = await orchestrator.quote({ text: "air chaud", history });
  assert.equal(llmCalled, true);
  assert.equal(result.status, "human_handoff");
  assert.notEqual(result.failure_code, "pricing_factor_unavailable");
});

test("une réponse courte sur un filtre sale conserve le contexte et donne une aide sûre", async () => {
  let llmCalled = false;
  const orchestrator = new PricingOrchestrator({
    repository: {}, embeddings: {},
    llm: { async extract() { llmCalled = true; } },
  });
  const history = [
    { role: "user", text: "comment accéder au filtre de mon climatiseur" },
    { role: "bot", text: "Quel est le problème ?" },
  ];
  const result = await orchestrator.quote({ text: "il est sale", history });
  assert.equal(result.status, "guidance");
  assert.match(result.message, /coupez l.alimentation/i);
  assert.match(result.message, /laissez-le sécher complètement/i);
  assert.equal(llmCalled, false);
});

test("un devis filtre sale utilise le code catalogue précis", async () => {
  const extraction = validExtraction();
  const orchestrator = new PricingOrchestrator({ repository: {}, embeddings: {}, llm: {} });
  orchestrator.enrichFilterQuote(extraction, "combien coûte l'intervention ?", [
    { role: "user", text: "le filtre de mon climatiseur est sale" },
  ]);
  assert.equal(extraction.faults[0].code_hint, "MNT172");
  assert.match(extraction.faults[0].description, /filtre lavable/i);
});

test("un remplacement explicite de compresseur split force le code catalogue CLR007", () => {
  const extraction = validExtraction();
  const orchestrator = new PricingOrchestrator({ repository: {}, embeddings: {}, llm: {} });
  orchestrator.enrichKnownInterventions(extraction, "Remplacement compresseur climatiseur split urgent", []);
  assert.equal(extraction.faults[0].code_hint, "CLR007");
  assert.equal(extraction.faults[0].description, "Remplacement compresseur climatiseur split");
});

test("une installation explicite de split 12000 BTU force le code catalogue CLI043", () => {
  const extraction = validExtraction();
  const orchestrator = new PricingOrchestrator({ repository: {}, embeddings: {}, llm: {} });
  orchestrator.enrichKnownInterventions(extraction, "J'ai besoin d'une installation climatiseur split mural 12000 BTU", []);
  assert.equal(extraction.faults.length, 1);
  assert.equal(extraction.faults[0].code_hint, "CLI043");
  assert.equal(extraction.faults[0].intervention_type, "Installation");
});

test("un rejet du rédacteur utilise un devis déterministe au lieu d'un transfert humain", async () => {
  const repository = fallbackRepository({
    async findCandidates() {
      return [{ code: "CLR001", name: "Diagnostic climatisation", semantic_score: 0.99, intervention_type: "Reparation", category: "Climatisation", subcategory: "Split", base_parts_cost_usd: 0, estimated_hours: 1 }];
    },
    async getThresholds() { return { automatic: 0.7, uncertain: 0.5 }; },
    async getFactors() {
      return {
        region: { exchange_rate_per_usd: 134, local_hourly_rate: 850, labour_adjustment: 0.9, equipment_import_factor: 1.15, currency_code: "DZD", minimum_service_price: 2500 },
        urgency: { multiplier: 1 }, complexity: { multiplier: 1 }, season: { multiplier: 1 }, margin: { margin_usd: 3 },
      };
    },
  });
  const orchestrator = new PricingOrchestrator({
    repository,
    embeddings: { storageModel: "test", async embed() { return Array(1024).fill(0); } },
    llm: {
      async extract() { return validExtraction(); },
      async redact() { return { message: "mauvais devis" }; },
      async judge() { return { valid: false, reason: "chiffres absents" }; },
    },
  });
  const result = await orchestrator.quote({ text: "ma clim ne refroidit plus mais souffle de l'air chaud", clientId: 4 });
  assert.equal(result.status, "quote");
  assert.equal(result.rendering_fallback, true);
  assert.equal(result.calculation.total, 2500);
  assert.match(result.message, /2[\s ]500 DZD/);
});

function validExtraction() {
  return {
    faults: [{ description: "climatiseur ne refroidit plus", intervention_type: "Reparation", equipment_type: "climatiseur" }],
    country: "Tunisie",
    urgency: "Standard",
    complexity: "Simple",
    season: "Saison intermédiaire",
    clarification_needed: false,
  };
}

function fallbackRepository(overrides = {}) {
  const queued = [];
  return {
    queued,
    async saveAudit() {},
    async queueFallback(entry) { queued.push(entry); },
    ...overrides,
  };
}

test("une panne LLM est mise en file humaine avec un code explicite", async () => {
  const repository = fallbackRepository();
  const orchestrator = new PricingOrchestrator({
    repository,
    embeddings: {},
    llm: { async extract() { throw Object.assign(new Error("down"), { code: "llm_timeout" }); } },
  });
  const result = await orchestrator.quote({ text: "ma clim ne refroidit plus et fuit", clientId: 4 });
  assert.equal(result.status, "human_handoff");
  assert.equal(result.failure_code, "llm_unavailable");
  assert.equal(result.retryable, true);
  assert.equal(repository.queued[0].failureCode, "llm_unavailable");
});

test("une panne embeddings ne devient pas un faux zéro résultat", async () => {
  const repository = fallbackRepository();
  const orchestrator = new PricingOrchestrator({
    repository,
    embeddings: { storageModel: "BAAI/bge-m3:1024", async embed() { throw new Error("TEI down"); } },
    llm: { async extract() { return validExtraction(); } },
  });
  const result = await orchestrator.quote({ text: "ma clim ne refroidit plus et fuit", clientId: 4 });
  assert.equal(result.failure_code, "embedding_unavailable");
  assert.equal(repository.queued[0].failureCode, "embedding_unavailable");
});

test("zéro voisin pgvector est distinct d'une confiance faible", async () => {
  const noMatchRepository = fallbackRepository({ async findCandidates() { return []; } });
  const embeddings = { storageModel: "BAAI/bge-m3:1024", async embed() { return Array(1024).fill(0.01); } };
  const llm = { async extract() { return validExtraction(); } };
  const noMatch = await new PricingOrchestrator({ repository: noMatchRepository, embeddings, llm })
    .quote({ text: "panne inconnue", clientId: 4 });
  assert.equal(noMatch.failure_code, "no_semantic_match");

  const lowRepository = fallbackRepository({
    async findCandidates() {
      return [{ code: "X", semantic_score: 0.1, intervention_type: "Reparation", category: "Autre", subcategory: "", name: "Inconnu" }];
    },
    async getThresholds() { return { automatic: 0.99, uncertain: 0.98 }; },
  });
  const low = await new PricingOrchestrator({ repository: lowRepository, embeddings, llm })
    .quote({ text: "panne peu fiable", clientId: 4 });
  assert.equal(low.failure_code, "low_confidence");
  assert.notEqual(low.message, noMatch.message);
});
