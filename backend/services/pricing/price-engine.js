"use strict";

function number(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid numeric pricing value: ${name}`);
  return parsed;
}

function round(value, precision = 2) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function calculateLine({ fault, region, urgency, complexity, season, fixedMargin, equipmentCostUsd = 0 }) {
  if (!fault || !region || !urgency || !complexity || !season || !fixedMargin) {
    throw new Error("Incomplete pricing data");
  }

  const exchangeRate = number(region.exchange_rate_per_usd, "exchange_rate_per_usd");
  const parts = number(fault.base_parts_cost_usd, "base_parts_cost_usd") * exchangeRate;
  const labour = number(fault.estimated_hours, "estimated_hours")
    * number(region.local_hourly_rate, "local_hourly_rate")
    * number(region.labour_adjustment, "labour_adjustment")
    * number(urgency.multiplier, "urgency_multiplier")
    * number(complexity.multiplier, "complexity_multiplier")
    * number(season.multiplier, "season_multiplier");
  const margin = number(fixedMargin.margin_usd, "margin_usd") * exchangeRate;
  const equipment = number(equipmentCostUsd, "equipment_cost_usd")
    * exchangeRate
    * number(region.equipment_import_factor, "equipment_import_factor");

  return {
    fault_code: fault.code,
    intervention: fault.name,
    currency: region.currency_code,
    components: {
      parts: round(parts),
      labour: round(labour),
      fixed_margin: round(margin),
      equipment: round(equipment),
    },
    multipliers: {
      urgency: number(urgency.multiplier, "urgency_multiplier"),
      complexity: number(complexity.multiplier, "complexity_multiplier"),
      season: number(season.multiplier, "season_multiplier"),
      regional_labour: number(region.labour_adjustment, "labour_adjustment"),
    },
    total: round(parts + labour + margin + equipment),
  };
}

function calculateQuote(lines, confidenceBand = "high", serviceMinimum = 0) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error("At least one pricing line is required");
  const currency = lines[0].currency;
  if (lines.some((line) => line.currency !== currency)) throw new Error("All pricing lines must use the same currency");
  const subtotal = round(lines.reduce((sum, line) => sum + line.total, 0));
  const minimum = number(serviceMinimum, "service_minimum");
  const serviceMinimumAdjustment = round(Math.max(0, minimum - subtotal));
  const total = round(subtotal + serviceMinimumAdjustment);
  const spread = confidenceBand === "medium" ? 0.2 : 0.08;
  return {
    currency,
    lines,
    subtotal,
    service_minimum: minimum,
    service_minimum_adjustment: serviceMinimumAdjustment,
    total,
    range: { min: round(total * (1 - spread)), max: round(total * (1 + spread)) },
  };
}

module.exports = { calculateLine, calculateQuote };
