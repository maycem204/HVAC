"use strict";

const { calculateLine, calculateQuote } = require("./price-engine");
const { structuralScore, faultConfidence, caseConfidence, decision } = require("./confidence");

class PricingOrchestrator {
  constructor({ repository, llm, embeddings }) {
    this.repository = repository; this.llm = llm; this.embeddings = embeddings;
  }

  async quote({ text, history = [], clientCountry, clientId, requireResolvedCountry = false }) {
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      const error = new Error("A message is required"); error.status = 400; throw error;
    }
    const filterHelp = this.filterHelp(text, history);
    if (filterHelp) return filterHelp;
    const coolingClarification = this.clarifyCoolingFailure(text, history);
    if (coolingClarification) return coolingClarification;
    const vagueRequest = this.clarifyVagueBreakdown(text, history);
    if (vagueRequest) return vagueRequest;

    let extraction;
    try {
      extraction = await this.llm.extract({
        text,
        history: history.slice(-10),
        clientCountry,
        currentDate: new Date().toISOString().slice(0, 10),
      });
    } catch (error) {
      return this.human(text, null, clientId, "llm_unavailable", null, error);
    }
    if (clientCountry) extraction.country = clientCountry;
    else if (requireResolvedCountry) extraction.country = "";
    this.normalizeExtraction(extraction);
    this.enrichFilterQuote(extraction, text, history);
    this.enrichKnownInterventions(extraction, text, history);
    if (extraction.clarification_needed) {
      if (!extraction.clarification_question || typeof extraction.clarification_question !== "string") {
        throw new Error("DeepSeek clarification is incomplete");
      }
      return { status: "clarification", question: extraction.clarification_question, extraction };
    }
    if (!String(extraction.country || "").trim()) {
      return {
        status: "clarification",
        question: "Dans quel pays se trouve l’appareil ? Cette information est nécessaire pour appliquer la devise et le barème local.",
        extraction: { ...extraction, clarification_needed: true, reason: "country_missing" },
      };
    }
    this.validateExtraction(extraction);

    const matches = [];
    for (const fault of extraction.faults) {
      let vector;
      let candidates;
      let retrieval = "vector";
      try {
        vector = await this.embeddings.embed(fault.description, "query");
        candidates = await this.repository.findCandidates(vector, fault, 5, this.embeddings.storageModel);
      } catch (error) {
        if (typeof this.repository.findTextCandidates !== "function") {
          return this.human(text, extraction, clientId, "embedding_unavailable", null, error);
        }
        try {
          candidates = await this.repository.findTextCandidates(fault, 5);
          retrieval = "text";
        } catch (fallbackError) {
          return this.human(text, extraction, clientId, "vector_search_unavailable", null, fallbackError);
        }
      }
      if (!candidates.length) return this.human(text, extraction, clientId, "no_semantic_match", 0);
      const best = candidates.find((candidate)=>this.equipmentCompatible(candidate, fault));
      if (!best) {
        return { status:"clarification", question:"Le catalogue contient plusieurs types d’appareils incompatibles avec votre description. Pouvez-vous préciser s’il s’agit d’un split mural, d’un climatiseur mobile ou d’un système central ?", extraction };
      }
      const structural = structuralScore({
        countryMatch: Boolean(extraction.country),
        interventionTypeMatch: best.intervention_type === fault.intervention_type,
        equipmentTypeMatch: this.equipmentMatches(best, fault),
      });
      matches.push({
        fault: best,
        requestedComplexity: fault.complexity || extraction.complexity,
        complexityReason: fault.complexity_reason || null,
        confidence: faultConfidence(best.semantic_score, structural),
        retrieval,
      });
    }
    const confidence = caseConfidence(matches.map((match) => match.confidence));
    const thresholds = await this.repository.getThresholds();
    const routing = decision(confidence, thresholds);
    if (routing.route === "human") return this.human(text, extraction, clientId, "low_confidence", confidence);

    let factorSets;
    try {
      factorSets = await Promise.all(matches.map(({ fault, requestedComplexity }) => this.repository.getFactors({
        country: extraction.country, urgency: extraction.urgency, complexity: requestedComplexity,
        season: extraction.season, interventionType: fault.intervention_type,
      })));
    } catch (error) {
      return this.human(text, extraction, clientId, "pricing_factor_unavailable", confidence, error);
    }
    const lines = matches.map(({ fault }, index) => calculateLine({
      fault, ...factorSets[index],
      fixedMargin: index === 0 ? factorSets[index].margin : { margin_usd: 0 },
    }));
    const calculation = calculateQuote(lines, routing.band, factorSets[0]?.region?.minimum_service_price || 0);
    let rejectionReason = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let rendered;
      let judged;
      try {
        rendered = await this.llm.redact({
          extraction,
          calculation,
          confidence,
          uncertainty: routing.band === "medium",
          previousRejection: rejectionReason,
        });
        judged = await this.llm.judge({ quote: rendered.message, extraction, calculation });
      } catch (error) {
        return this.human(text, extraction, clientId, "llm_unavailable_after_calculation", confidence, error);
      }
      if (judged.valid === true) {
        const result = { status: "quote", message: rendered.message, extraction, matches: matches.map((m) => ({ code: m.fault.code, confidence: m.confidence, retrieval: m.retrieval })), confidence, confidence_band: routing.band, calculation };
        await this.repository.saveAudit({ clientId, requestText: text, extraction, confidence, decision: "automatic", calculation, renderedQuote: rendered.message, judgeResult: judged });
        return result;
      }
      rejectionReason = judged.reason || "Validation rejected";
    }
    const fallbackMessage = this.renderDeterministicQuote(extraction, calculation, routing.band);
    const result = { status: "quote", message: fallbackMessage, extraction, matches: matches.map((m) => ({ code: m.fault.code, confidence: m.confidence, retrieval: m.retrieval })), confidence, confidence_band: routing.band, calculation, rendering_fallback: true };
    await this.repository.saveAudit({ clientId, requestText: text, extraction, confidence, decision: "automatic", calculation, renderedQuote: fallbackMessage, judgeResult: { valid: true, reason: "Deterministic rendering used after writer validation failures" }, failureCode: "writer_validation_fallback" });
    return result;
  }

  conversationText(text, history) {
    return [...history.slice(-10).map((message) => message?.text || message?.content || ""), text].join(" ").toLocaleLowerCase("fr");
  }

  clarifyVagueBreakdown(text, history) {
    const conversation = this.conversationText(text, history);
    const current = String(text).toLocaleLowerCase("fr");
    const namesEquipment = /(clim(?:atiseur|atisation)?|chaudi[eè]re|chauffage|ventilation|pompe [aà] chaleur|split)/i.test(current);
    const onlyGenericFailure = /\b(en panne|panne|ne marche (?:plus|pas)|hors service|cass[eé])\b/i.test(current);
    const usefulSymptom = /(ne refroidit|ne chauffe|fuite|bruit|odeur|fum[eé]e|givre|glace|souffle|ventilateur|compresseur|filtre|code erreur|affiche|s['’]arr[eê]te|disjoncte|eau|gaz|pression)/i.test(conversation);
    if (!namesEquipment || !onlyGenericFailure || usefulSymptom) return null;
    return {
      status: "clarification",
      question: "Que fait exactement l’appareil : il ne démarre pas, ne refroidit plus, fuit, fait du bruit ou affiche un code d’erreur ? Depuis quand ?",
      extraction: { faults: [], clarification_needed: true, reason: "symptom_missing" },
    };
  }

  clarifyCoolingFailure(text, history) {
    const current = String(text).toLocaleLowerCase("fr");
    // Une nouvelle intervention formulée explicitement remplace le diagnostic
    // précédent au lieu de rester bloquée sur la dernière question du bot.
    if (/\b(?:installation|installer|pose|remplacement|remplacer|entretien|maintenance|nettoyage|recharge)\b/i.test(current)) return null;
    const userText = [...history.filter((message)=>message?.role === "user").map((message)=>message.text || message.content || ""), text].join(" ").toLocaleLowerCase("fr");
    if (!/(ne refroidit (?:plus|pas)|air (?:pas )?froid|pas de froid)/i.test(userText)) return null;
    const diagnosticDetail = /(air chaud(?:e)?|souffle[^.]{0,30}(?:air )?chaud(?:e)?|souffle (?:bien|faiblement|pas)|ventilateur|unit[eé] ext[eé]rieure|compresseur|givre|glace|fuit|fuite|bruit|odeur|code (?:d['’]erreur )?[a-z0-9]+|voyant|s['’]arr[eê]te|disjoncte|filtre|pression|gaz)/i.test(userText);
    if (diagnosticDetail) return null;
    return {
      status: "clarification",
      question: "Pour éviter un faux diagnostic : l’appareil souffle-t-il de l’air, l’unité extérieure démarre-t-elle, et voyez-vous du givre, une fuite ou un code d’erreur ?",
      extraction: { faults: [], clarification_needed: true, reason: "cooling_symptom_insufficient" },
    };
  }

  filterHelp(text, history) {
    const conversation = this.conversationText(text, history);
    const current = text.toLocaleLowerCase("fr");
    const mentionsFilter = /filtr(?:e|es|é|és)/i.test(conversation);
    const wantsQuote = /\b(prix|tarif|devis|co[uû]t|combien|technicien|intervention)\b/i.test(current);
    const asksHelp = /(acc[eé]der|ouvrir|retirer|enlever|nettoy|sale|poussi[eè]r)/i.test(conversation);
    if (!mentionsFilter || !asksHelp || wantsQuote) return null;

    const dirty = /(sale|poussi[eè]r|nettoy)/i.test(current);
    const message = dirty
      ? "S’il s’agit du filtre lavable d’un climatiseur split : coupez l’alimentation, ouvrez doucement le capot avant, faites glisser le filtre vers vous, aspirez-le puis rincez-le à l’eau tiède. Laissez-le sécher complètement à l’ombre avant de le remettre. Ne faites pas fonctionner la climatisation sans filtre. Si le filtre est jetable, abîmé ou très noir, remplacez-le. Donnez-moi la marque et le modèle si le capot ne s’ouvre pas ainsi."
      : "Coupez d’abord l’alimentation électrique. Sur la plupart des climatiseurs split muraux, le filtre se trouve derrière le grand capot avant : saisissez les encoches des deux côtés, soulevez doucement le capot, puis faites glisser les grilles filtrantes vers vous. Ne forcez pas : sur un modèle mobile, gainable ou cassette, l’accès est différent. Quelle est la marque et, si possible, le modèle de votre climatiseur ?";
    return { status: "guidance", message, topic: "air_filter", requires_quote: false };
  }

  enrichFilterQuote(extraction, text, history) {
    const conversation = this.conversationText(text, history);
    if (!/filtr(?:e|es|é|és)/i.test(conversation) || !/(sale|poussi[eè]r|nettoy)/i.test(conversation)) return;
    extraction.faults = [{
      code_hint: "MNT172",
      description: "Nettoyage d'un filtre lavable de climatiseur split",
      intervention_type: "Reparation",
      equipment_type: "climatiseur split",
    }];
    extraction.clarification_needed = false;
    extraction.clarification_question = null;
    extraction.urgency ||= "Standard";
    extraction.complexity ||= "Simple";
  }

  enrichKnownInterventions(extraction, text, history) {
    const current = String(text || "").toLocaleLowerCase("fr");
    if (/\b(?:installation|installer|pose)\b/i.test(current)
      && /(?:clim|climatiseur|climatisation).*split.*(?:mural)?.*12\s*000\s*btu|12\s*000\s*btu.*(?:clim|split)/i.test(current)) {
      extraction.faults = [{
        code_hint: "CLI043",
        description: "Installation climatiseur split mural 12000 BTU",
        equipment_type: "climatiseur split mural 12000 BTU",
        intervention_type: "Installation",
        complexity: extraction.complexity || "Modérée",
        complexity_reason: "Pose complète d’un climatiseur split mural avec raccordements.",
      }];
      extraction.clarification_needed = false;
      extraction.clarification_question = null;
      return;
    }
    const conversation = this.conversationText(text, history);
    if (/remplacement\s+(?:du\s+|d['’]un\s+)?compresseur/i.test(conversation)
      && /(?:clim|climatiseur|climatisation|split)/i.test(conversation)) {
      const fault = extraction.faults?.[0];
      if (!fault) return;
      fault.code_hint = /central|gainable|rooftop/i.test(conversation) ? "CLR008" : "CLR007";
      fault.description = /central|gainable|rooftop/i.test(conversation)
        ? "Remplacement compresseur climatiseur central"
        : "Remplacement compresseur climatiseur split";
      fault.equipment_type = /central|gainable|rooftop/i.test(conversation) ? "climatiseur central" : "climatiseur split";
      fault.intervention_type = "Reparation";
    }
  }

  renderDeterministicQuote(extraction, calculation, confidenceBand) {
    const amount = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
    const interventions = calculation.lines.map((line) => line.intervention).join(", ");
    const range = `${amount.format(calculation.range.min)} à ${amount.format(calculation.range.max)} ${calculation.currency}`;
    const minimumNote = calculation.service_minimum_adjustment > 0
      ? ` Le minimum de déplacement/intervention locale est inclus (${amount.format(calculation.service_minimum)} ${calculation.currency}).`
      : "";
    const uncertainty = confidenceBand === "medium" ? " Cette estimation reste à confirmer après diagnostic." : "";
    return `Estimation pour ${interventions} : ${amount.format(calculation.total)} ${calculation.currency} (fourchette ${range}).${minimumNote}${uncertainty}`;
  }

  validateExtraction(value) {
    const required = ["faults", "country", "urgency", "complexity", "season"];
    if (!value || required.some((key) => value[key] == null) || !Array.isArray(value.faults) || value.faults.length === 0) {
      throw new Error("DeepSeek extraction is incomplete");
    }
  }

  normalizeExtraction(extraction) {
    const normalized = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const mapComplexity = (value) => {
      const key = normalized(value);
      if (/exception/.test(key)) return "Exceptionnelle";
      if (/tres.*eleve|extreme/.test(key)) return "Très élevée";
      if (/eleve|complexe|difficile/.test(key)) return "Élevée";
      if (/modere|moyen|intermediaire/.test(key)) return "Modérée";
      if (/simple|faible|standard|facile/.test(key)) return "Simple";
      return value;
    };
    const mapUrgency = (value) => {
      const key = normalized(value);
      if (/nuit|week.?end|ferie/.test(key)) return "Nuit / Week-end / Jour férié";
      if (/immediat|critique|danger/.test(key)) return "Urgence immédiate";
      if (/urgent|jour meme/.test(key)) return "Urgent";
      if (/rapid|24|48/.test(key)) return "Rapide";
      if (/standard|normal|planif/.test(key)) return "Standard";
      return value;
    };
    const mapSeason = (value) => {
      const key = normalized(value);
      if (/canicule|vague de chaleur/.test(key)) return "Période de canicule / vague de chaleur";
      if (/haute.*ete|ete.*clim/.test(key)) return "Haute saison été (clim)";
      if (/haute.*hiver|hiver.*chauff/.test(key)) return "Haute saison hiver (chauffage)";
      if (/intermediaire|printemps|automne/.test(key)) return "Saison intermédiaire";
      if (/basse/.test(key)) return "Basse saison";
      return value;
    };
    extraction.complexity = mapComplexity(extraction.complexity);
    extraction.urgency = mapUrgency(extraction.urgency);
    extraction.season = mapSeason(extraction.season);
    for (const fault of extraction.faults || []) {
      fault.complexity = mapComplexity(fault.complexity || extraction.complexity);
      if (/repar|remplac|maintenance|diagnostic/.test(normalized(fault.intervention_type))) fault.intervention_type = "Reparation";
      else if (/install|pose/.test(normalized(fault.intervention_type))) fault.intervention_type = "Installation";
    }
  }

  equipmentMatches(row, fault) {
    const reference = `${row.category} ${row.subcategory} ${row.name}`.toLowerCase();
    const terms = String(fault.equipment_type || "").toLowerCase().split(/\s+/).filter((term) => term.length > 3);
    return terms.length === 0 || terms.some((term) => reference.includes(term));
  }

  equipmentCompatible(row, fault) {
    const reference = `${row.category} ${row.subcategory} ${row.name}`.toLowerCase();
    const requested = String(fault.equipment_type || "").toLowerCase();
    if (/split/.test(requested) && /central|gainable|rooftop/.test(reference)) return false;
    if (/central|gainable|rooftop/.test(requested) && /split|mobile/.test(reference)) return false;
    return true;
  }

  async human(text, extraction, clientId, failureCode, confidence, error = null) {
    const messages = {
      llm_unavailable: "Le service IA est temporairement indisponible. Votre demande est enregistrée pour traitement humain.",
      llm_unavailable_after_calculation: "Le devis n’a pas pu être validé par l’IA. Votre demande est enregistrée pour contrôle humain.",
      embedding_unavailable: "La recherche de cas similaires est temporairement indisponible. Votre demande est enregistrée pour traitement humain.",
      vector_search_unavailable: "La base de recherche sémantique est temporairement indisponible. Votre demande est enregistrée pour traitement humain.",
      pricing_factor_unavailable: "Le barème correspondant à votre pays, à la saison ou au niveau d’urgence est incomplet. Votre demande est enregistrée pour vérification.",
      no_semantic_match: "Aucun cas réellement similaire n’existe dans le catalogue. Un technicien doit analyser cette nouvelle situation.",
      low_confidence: "Des cas similaires ont été trouvés, mais leur fiabilité est insuffisante. Un technicien doit confirmer le diagnostic.",
      judge_validation_failed: "Le devis automatique n’a pas passé les contrôles de cohérence. Un technicien doit le vérifier.",
    };
    if (error) {
      console.error("Pricing handoff after upstream failure", {
        failureCode,
        service: error.service || null,
        code: error.code || error.name || null,
        message: error.message || null,
        cause: error.cause?.code || error.cause?.name || null,
        causeMessage: error.cause?.message || null,
      });
    }
    const assignTechnician = ["no_semantic_match", "low_confidence", "judge_validation_failed"].includes(failureCode);
    const entry = { clientId, requestText: text, extraction, confidence, failureCode, lastError: error?.code || error?.name || null, assignTechnician };
    const [, queued] = await Promise.allSettled([
      this.repository.saveAudit?.({ ...entry, decision: "human" }),
      this.repository.queueFallback?.(entry),
    ]);
    const assignment = assignTechnician && queued?.status === "fulfilled" ? queued.value?.assignment || null : null;
    const baseMessage = messages[failureCode] || "Votre cas nécessite l’avis d’un technicien. Votre demande a été enregistrée.";
    return {
      status: "human_handoff",
      failure_code: failureCode,
      retryable: ["llm_unavailable", "llm_unavailable_after_calculation", "embedding_unavailable", "vector_search_unavailable"].includes(failureCode),
      message: assignment
        ? `${baseMessage} Elle a été transmise à ${assignment.technicianName}, technicien disponible correspondant à cette panne.`
        : baseMessage,
      extraction,
      confidence,
      assignment,
    };
  }
}

module.exports = { PricingOrchestrator };
