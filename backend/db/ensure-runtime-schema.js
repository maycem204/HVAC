"use strict";

async function ensureRuntimeSchema(pool) {
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS country_code VARCHAR(2), ADD COLUMN IF NOT EXISTS currency VARCHAR(3)`);
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
