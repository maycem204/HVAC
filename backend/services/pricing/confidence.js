"use strict";

function structuralScore({ countryMatch, interventionTypeMatch, equipmentTypeMatch }) {
  return (Number(Boolean(countryMatch)) * 0.3)
    + (Number(Boolean(interventionTypeMatch)) * 0.3)
    + (Number(Boolean(equipmentTypeMatch)) * 0.4);
}

function faultConfidence(semantic, structural) {
  const semanticScore = Math.max(0, Math.min(1, Number(semantic)));
  const structuralValue = Math.max(0, Math.min(1, Number(structural)));
  return Number((semanticScore * 0.6 + structuralValue * 0.4).toFixed(4));
}

function caseConfidence(scores) {
  if (!Array.isArray(scores) || scores.length === 0) return 0;
  return Math.min(...scores.map(Number));
}

function decision(score, thresholds = { automatic: 0.7, uncertain: 0.5 }) {
  if (score >= thresholds.automatic) return { route: "automatic", band: "high" };
  if (score >= thresholds.uncertain) return { route: "automatic", band: "medium" };
  return { route: "human", band: "low" };
}

module.exports = { structuralScore, faultConfidence, caseConfidence, decision };
