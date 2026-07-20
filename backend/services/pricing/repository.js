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
  const exact = result.rows.find((row) => comparable(row[field]) === target);
  if (exact) return exact;
  // A provider can omit a harmless qualifier from a controlled label, such
  // as "Haute saison ete" instead of "Haute saison ete (clim)". Pricing
  // values still come exclusively from the matching database row.
  return result.rows.find((row) => {
    const candidate = comparable(row[field]);
    return target.length >= 5 && candidate.length >= 5
      && (candidate.includes(target) || target.includes(candidate));
  });
}

function distanceKm(lat1, lng1, lat2, lng2) {
  if (![lat1, lng1, lat2, lng2].every((value) => Number.isFinite(Number(value)))) return null;
  const toRad = (value) => Number(value) * Math.PI / 180;
  const dLat = toRad(Number(lat2) - Number(lat1));
  const dLng = toRad(Number(lng2) - Number(lng1));
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function technicianRelevance(specializations, extraction, requestText) {
  const requested = comparable([requestText, ...(extraction?.faults || []).flatMap((fault) => [fault.description, fault.equipment_type, fault.intervention_type])].join(" "));
  const groups = [];
  if (/clim|split|compresseur|froid|refriger/.test(requested)) groups.push("climatisation", "refrigeration", "multi split");
  if (/chauff|chaudiere|pompe a chaleur/.test(requested)) groups.push("chauffage", "pompe a chaleur");
  if (/ventil/.test(requested)) groups.push("ventilation");
  if (/install|pose/.test(requested)) groups.push("installation");
  if (/remplac/.test(requested)) groups.push("remplacement");
  if (/repar|panne|diagnostic|code/.test(requested)) groups.push("reparation", "depannage", "maintenance");
  return (specializations || []).reduce((score, specialization) => {
    const normalized = comparable(specialization);
    const direct = requested.includes(normalized) ? 4 : 0;
    const related = groups.some((group) => normalized.includes(group) || group.includes(normalized)) ? 3 : 0;
    const generic = /hvac|reparation|maintenance|depannage/.test(normalized) ? 1 : 0;
    return score + Math.max(direct, related, generic);
  }, 0);
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
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const clientResult = entry.clientId
        ? await client.query("SELECT id, name, city, lat, lng FROM users WHERE id=$1", [entry.clientId])
        : { rows: [] };
      const clientRow = clientResult.rows[0] || {};
      const technicians = await client.query(
        `SELECT u.id, u.name, u.lat, u.lng, t.specializations, t.radius_km, t.rating
         FROM users u JOIN technician_profiles t ON t.user_id=u.id
         WHERE u.role='technician' AND t.available=true`
      );
      const ranked = technicians.rows.map((technician) => {
        const distance = distanceKm(clientRow.lat, clientRow.lng, technician.lat, technician.lng);
        return { ...technician, distance, relevance: technicianRelevance(technician.specializations, entry.extraction, entry.requestText) };
      }).filter((technician) => technician.distance == null || technician.distance <= Number(technician.radius_km || 10))
        .sort((a, b) => b.relevance - a.relevance
          || (a.distance ?? Number.MAX_SAFE_INTEGER) - (b.distance ?? Number.MAX_SAFE_INTEGER)
          || Number(b.rating || 0) - Number(a.rating || 0));
      const assigned = ranked.find((technician) => technician.relevance > 0) || ranked[0] || null;
      const reason = assigned
        ? `specialty_score=${assigned.relevance};distance_km=${assigned.distance == null ? "unknown" : assigned.distance.toFixed(1)};rating=${Number(assigned.rating || 0)}`
        : null;
      const fallback = await client.query(
        `INSERT INTO pricing_fallback_requests
         (client_id, request_text, extraction, failure_code, confidence, last_error,
          assigned_technician_id, assignment_reason, assigned_at, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CASE WHEN $7::int IS NULL THEN NULL ELSE now() END,
                 CASE WHEN $7::int IS NULL THEN 'pending' ELSE 'assigned' END)
         RETURNING id`,
        [entry.clientId || null, entry.requestText, entry.extraction || null, entry.failureCode,
          entry.confidence ?? null, entry.lastError || null, assigned?.id || null, reason]
      );
      if (assigned && entry.clientId) {
        const firstFault = entry.extraction?.faults?.[0] || {};
        await client.query(
          `INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city)
           VALUES ($1,$2,$3,$4,0,$5,'new',$6)`,
          [entry.clientId, assigned.id, entry.requestText,
            String(firstFault.equipment_type || firstFault.intervention_type || "HVAC").slice(0, 50),
            Math.round(Number(entry.confidence || 0) * 100), clientRow.city || null]
        );
        await client.query(
          `INSERT INTO notifications (user_id, type, title, message)
           VALUES ($1,'lead','Diagnostic humain requis',$2)`,
          [assigned.id, `${clientRow.name || "Un client"} : ${String(entry.requestText).slice(0, 220)}`]
        );
      }
      await client.query("COMMIT");
      return { fallbackId: fallback.rows[0].id, assignment: assigned ? { technicianId: assigned.id, technicianName: assigned.name, distanceKm: assigned.distance } : null };
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }
}

module.exports = { PricingRepository, vectorLiteral, technicianRelevance };
