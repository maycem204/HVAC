"use strict";

async function ensureRuntimeSchema(pool) {
  await pool.query(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2),
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3),
      ADD COLUMN IF NOT EXISTS profile_lat DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS profile_lng DOUBLE PRECISION,
      ADD COLUMN IF NOT EXISTS live_location_active BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS live_location_updated_at TIMESTAMPTZ;
    UPDATE users SET profile_lat=lat, profile_lng=lng
    WHERE profile_lat IS NULL AND profile_lng IS NULL AND lat IS NOT NULL AND lng IS NOT NULL;
  `);
  await pool.query(`
    ALTER TABLE appointments
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
      ADD COLUMN IF NOT EXISTS diagnostic_details JSONB;
    UPDATE appointments a SET currency=u.currency FROM users u
    WHERE u.id=a.technician_id AND u.currency IS NOT NULL AND (a.currency IS NULL OR a.currency='EUR');
  `);
  await pool.query(`
    ALTER TABLE price_items
      ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) NOT NULL DEFAULT 'DZ',
      ADD COLUMN IF NOT EXISTS currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
      ADD COLUMN IF NOT EXISTS source_filename VARCHAR(255),
      ADD COLUMN IF NOT EXISTS imported_at TIMESTAMPTZ;
    CREATE INDEX IF NOT EXISTS idx_price_items_country ON price_items(technician_id, country_code, category);
  `);
  await pool.query(`
    ALTER TABLE leads
      ADD COLUMN IF NOT EXISTS requested_date DATE,
      ADD COLUMN IF NOT EXISTS requested_time TIME,
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS appointment_id INT REFERENCES appointments(id),
      ADD COLUMN IF NOT EXISTS diagnostic_details JSONB
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS technician_working_hours (
      technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      week_day SMALLINT NOT NULL CHECK (week_day BETWEEN 0 AND 6),
      enabled BOOLEAN NOT NULL DEFAULT true,
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      PRIMARY KEY (technician_id, week_day),
      CHECK (start_time < end_time)
    );
    INSERT INTO technician_working_hours (technician_id, week_day, enabled, start_time, end_time)
    SELECT u.id, day,
           day < 6,
           CASE WHEN day = 5 THEN '09:00'::time ELSE '08:00'::time END,
           CASE WHEN day = 5 THEN '14:00'::time ELSE '18:00'::time END
    FROM users u CROSS JOIN generate_series(0, 6) AS day
    WHERE u.role = 'technician'
    ON CONFLICT (technician_id, week_day) DO NOTHING;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS pricing_fallback_requests (
      id BIGSERIAL PRIMARY KEY,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      request_text TEXT NOT NULL,
      extraction JSONB,
      failure_code VARCHAR(80) NOT NULL,
      confidence NUMERIC(6,5),
      status VARCHAR(30) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'assigned', 'resolved', 'cancelled')),
      retry_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_pricing_fallback_pending
      ON pricing_fallback_requests(status, created_at) WHERE status = 'pending';
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_appointment_unique
      ON leads(appointment_id) WHERE appointment_id IS NOT NULL;
    INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city, requested_date, requested_time, address, appointment_id)
    SELECT a.client_id, a.technician_id, COALESCE(a.service, 'Demande de rendez-vous'), a.fault_type,
           COALESCE(a.estimated_price, 0), 100,
           CASE WHEN a.status = 'completed' THEN 'done' WHEN a.status = 'cancelled' THEN 'done' ELSE 'accepted' END,
           u.city, a.date, a.time, a.address, a.id
    FROM appointments a
    LEFT JOIN users u ON u.id = a.client_id
    WHERE NOT EXISTS (SELECT 1 FROM leads l WHERE l.appointment_id = a.id)
    ON CONFLICT DO NOTHING;
  `);
  // Reconstitue les anciens diagnostics à partir des audits de devis existants.
  // Le montant est prioritaire afin de ne pas rattacher une panne différente du même client.
  await pool.query(`
    WITH matches AS (
      SELECT DISTINCT ON (l.id)
        l.id AS lead_id,
        l.appointment_id,
        audit.extraction,
        audit.request_text
      FROM leads l
      JOIN pricing_quote_audits audit ON audit.client_id = l.client_id
        AND audit.extraction IS NOT NULL
        AND audit.created_at BETWEEN l.created_at - INTERVAL '24 hours' AND l.created_at + INTERVAL '2 hours'
      WHERE l.diagnostic_details IS NULL
      ORDER BY l.id,
        CASE WHEN ABS(COALESCE(NULLIF(audit.calculation->>'total','')::numeric, -1) - COALESCE(l.price, 0)) < 0.01 THEN 0 ELSE 1 END,
        ABS(EXTRACT(EPOCH FROM (l.created_at - audit.created_at)))
    )
    UPDATE leads l
    SET diagnostic_details = matches.extraction
    FROM matches
    WHERE l.id = matches.lead_id;

    WITH matches AS (
      SELECT DISTINCT ON (a.id)
        a.id AS appointment_id,
        audit.extraction,
        audit.request_text
      FROM appointments a
      JOIN leads l ON l.appointment_id = a.id
      JOIN pricing_quote_audits audit ON audit.client_id = a.client_id
        AND audit.extraction IS NOT NULL
        AND audit.created_at BETWEEN l.created_at - INTERVAL '24 hours' AND l.created_at + INTERVAL '2 hours'
      WHERE a.diagnostic_details IS NULL OR a.case_description IS NULL
      ORDER BY a.id,
        CASE WHEN ABS(COALESCE(NULLIF(audit.calculation->>'total','')::numeric, -1) - COALESCE(a.estimated_price, 0)) < 0.01 THEN 0 ELSE 1 END,
        ABS(EXTRACT(EPOCH FROM (l.created_at - audit.created_at)))
    )
    UPDATE appointments a
    SET diagnostic_details = COALESCE(a.diagnostic_details, matches.extraction),
        case_description = COALESCE(a.case_description, matches.request_text)
    FROM matches
    WHERE a.id = matches.appointment_id;

    UPDATE leads l
    SET diagnostic_details = jsonb_build_object(
      'faults', jsonb_build_array(jsonb_build_object(
        'description', COALESCE(NULLIF(l.problem, ''), 'Diagnostic à confirmer sur place'),
        'equipment_type', COALESCE(NULLIF(l.fault_type, ''), 'Équipement HVAC'),
        'intervention_type', 'Diagnostic à confirmer'
      )),
      'complexity', 'À confirmer sur place',
      'urgency', 'Non précisée'
    )
    WHERE l.diagnostic_details IS NULL;
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id BIGSERIAL PRIMARY KEY,
      client_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(client_id, technician_id),
      CHECK (client_id <> technician_id)
    );
    CREATE TABLE IF NOT EXISTS conversation_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      sender_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body VARCHAR(2000) NOT NULL CHECK (length(trim(body)) > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      read_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_messages_order
      ON conversation_messages(conversation_id, created_at);
    CREATE TABLE IF NOT EXISTS technician_ratings (
      id BIGSERIAL PRIMARY KEY,
      client_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment VARCHAR(2000),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(client_id, technician_id),
      CHECK (client_id <> technician_id)
    );
    CREATE INDEX IF NOT EXISTS idx_technician_ratings_technician
      ON technician_ratings(technician_id);
    INSERT INTO technician_ratings(client_id, technician_id, rating, comment)
    SELECT DISTINCT ON (client_id, technician_id) client_id, technician_id, rating, feedback
    FROM appointments WHERE rating IS NOT NULL
    ORDER BY client_id, technician_id, date DESC, time DESC
    ON CONFLICT (client_id, technician_id) DO NOTHING;
    UPDATE technician_profiles t
    SET rating = COALESCE(stats.avg_rating, 0),
        reviews_count = COALESCE(stats.reviews_count, 0)
    FROM (
      SELECT u.id AS technician_id, AVG(r.rating)::numeric(2,1) AS avg_rating, COUNT(r.id)::int AS reviews_count
      FROM users u
      LEFT JOIN technician_ratings r ON r.technician_id = u.id
      WHERE u.role = 'technician'
      GROUP BY u.id
    ) stats
    WHERE t.user_id = stats.technician_id;
  `);
}

module.exports = { ensureRuntimeSchema };
