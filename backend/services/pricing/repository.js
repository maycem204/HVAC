"use strict";

function vectorLiteral(vector) {
  if (!Array.isArray(vector) || vector.length !== 1024 || vector.some((value) => !Number.isFinite(value))) {
    throw new Error("Expected a 1024-dimensional embedding");
  }
  return `[${vector.join(",")}]`;
}

function comparable(value) {
  const text = String(value || "");
  const repaired = /[ÃÂ]/.test(text) ? Buffer.from(text, "latin1").toString("utf8") : text;
  return repaired.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function matchingRow(result, field, expected) {
  const target = comparable(expected);
  return result.rows.find((row) => comparable(row[field]) === target);
}

class PricingRepository {
  constructor(pool) { this.pool = pool; }

  async findCandidates(vector, filters, limit = 5, embeddingModel = null) {
    if (filters.code_hint) {
      const exact = await this.pool.query(
        `SELECT f.*, 0.99::float AS semantic_score
         FROM pricing_faults f
         WHERE f.active = true AND upper(f.code) = upper($1)
         LIMIT 1`,
        [filters.code_hint]
      );
      if (exact.rows.length) return exact.rows;
    }
    const result = await this.pool.query(
      `SELECT f.*, 1 - (f.embedding <=> $1::vector) AS semantic_score
       FROM pricing_faults f
       WHERE f.active = true
         AND f.embedding IS NOT NULL
         AND ($2::text IS NULL OR f.intervention_type = $2)
         AND ($4::text IS NULL OR f.embedding_model = $4)
       ORDER BY f.embedding <=> $1::vector
       LIMIT $3`,
      [vectorLiteral(vector), filters.intervention_type || null, limit, embeddingModel]
    );
    return result.rows;
  }

  async findTextCandidates(filters, limit = 5) {
    const description = String(filters.description || "").trim();
    if (!description) return [];
    const result = await this.pool.query(
      `WITH query_tokens AS (
         SELECT DISTINCT token
         FROM regexp_split_to_table(unaccent(lower($1)), '[^a-z0-9]+') AS token
         WHERE length(token) >= 3
       ), scored AS (
         SELECT f.*,
           COUNT(*) FILTER (
             WHERE unaccent(lower(concat_ws(' ', f.code, f.category, f.subcategory, f.name, f.notes)))
               LIKE '%' || q.token || '%'
           )::float / GREATEST(COUNT(*)::float, 1) AS token_coverage
         FROM pricing_faults f
         CROSS JOIN query_tokens q
         WHERE f.active = true
           AND ($2::text IS NULL OR f.intervention_type = $2)
         GROUP BY f.id
       )
       SELECT scored.*, LEAST(0.95, 0.55 + token_coverage * 0.4)::float AS semantic_score
       FROM scored
       WHERE token_coverage > 0
       ORDER BY token_coverage DESC, code ASC
       LIMIT $3`,
      [description, filters.intervention_type || null, limit]
    );
    return result.rows;
  }

  async getFactors({ country, urgency, complexity, season, interventionType }) {
    const [region, urgencyRow, complexityRow, seasonRow, margin, serviceMinimum] = await Promise.all([
      this.pool.query("SELECT * FROM pricing_regions WHERE unaccent(lower(country)) = unaccent(lower($1)) AND active = true LIMIT 1", [country]),
      this.pool.query("SELECT level, multiplier FROM pricing_urgency_multipliers"),
      this.pool.query("SELECT level, multiplier FROM pricing_complexity_multipliers"),
      this.pool.query("SELECT period, multiplier FROM pricing_season_multipliers"),
      this.pool.query("SELECT intervention_type, margin_usd FROM pricing_fixed_margins WHERE lower(intervention_type) = lower($1)", [interventionType]),
      this.pool.query("SELECT amount, currency_code, source FROM pricing_service_minimums WHERE unaccent(lower(country)) = unaccent(lower($1)) LIMIT 1", [country]),
    ]);
    const urgencyFactor = matchingRow(urgencyRow, "level", urgency);
    const complexityFactor = matchingRow(complexityRow, "level", complexity);
    const seasonFactor = matchingRow(seasonRow, "period", season);
    const required = { region: region.rows[0], urgency: urgencyFactor, complexity: complexityFactor, season: seasonFactor, margin: margin.rows[0] };
    const missing = Object.entries(required).filter(([, value]) => !value).map(([name]) => name);
    if (missing.length) {
      const error = new Error(`Missing pricing factor in PostgreSQL: ${missing.join(", ")}`);
      error.code = "pricing_factor_missing";
      throw error;
    }
    const regionData = region.rows[0];
    if (serviceMinimum.rows[0]?.currency_code === regionData.currency_code) {
      regionData.minimum_service_price = Math.max(Number(regionData.minimum_service_price || 0), Number(serviceMinimum.rows[0].amount || 0));
      regionData.minimum_service_source = serviceMinimum.rows[0].source;
    }
    return {
      region: regionData, urgency: urgencyFactor, complexity: complexityFactor,
      season: seasonFactor, margin: margin.rows[0],
    };
  }

  async getThresholds() {
    const result = await this.pool.query("SELECT key, value FROM pricing_system_config WHERE key IN ('confidence_automatic', 'confidence_uncertain')");
    const values = Object.fromEntries(result.rows.map((row) => [row.key, Number(row.value)]));
    return { automatic: values.confidence_automatic ?? 0.7, uncertain: values.confidence_uncertain ?? 0.5 };
  }

  async saveAudit(entry) {
    await this.pool.query(
      `INSERT INTO pricing_quote_audits
       (client_id, request_text, extraction, confidence, decision, calculation, rendered_quote, judge_result, failure_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [entry.clientId || null, entry.requestText, entry.extraction || null, entry.confidence || null,
        entry.decision, entry.calculation || null, entry.renderedQuote || null, entry.judgeResult || null, entry.failureCode || null]
    );
  }

  async queueFallback(entry) {
    await this.pool.query(
      `INSERT INTO pricing_fallback_requests
       (client_id, request_text, extraction, failure_code, confidence, last_error)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [entry.clientId || null, entry.requestText, entry.extraction || null, entry.failureCode,
        entry.confidence ?? null, entry.lastError || null]
    );
  }
}

module.exports = { PricingRepository, vectorLiteral };
