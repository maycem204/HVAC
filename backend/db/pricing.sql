CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE TABLE IF NOT EXISTS pricing_faults (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(20) UNIQUE NOT NULL,
  category VARCHAR(120) NOT NULL,
  subcategory VARCHAR(180),
  name VARCHAR(255) NOT NULL,
  intervention_type VARCHAR(30) NOT NULL CHECK (intervention_type IN ('Reparation', 'Installation')),
  base_parts_cost_usd NUMERIC(12,2) NOT NULL CHECK (base_parts_cost_usd >= 0),
  estimated_hours NUMERIC(8,2) NOT NULL CHECK (estimated_hours >= 0),
  notes TEXT,
  embedding vector(1024),
  embedding_model VARCHAR(80),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pricing_urgency_multipliers (
  level VARCHAR(80) PRIMARY KEY, description TEXT, response_delay VARCHAR(80),
  multiplier NUMERIC(7,4) NOT NULL CHECK (multiplier > 0)
);
CREATE TABLE IF NOT EXISTS pricing_complexity_multipliers (
  level VARCHAR(80) PRIMARY KEY, description TEXT,
  multiplier NUMERIC(7,4) NOT NULL CHECK (multiplier > 0)
);
CREATE TABLE IF NOT EXISTS pricing_season_multipliers (
  period VARCHAR(100) PRIMARY KEY, months VARCHAR(100), description TEXT,
  multiplier NUMERIC(7,4) NOT NULL CHECK (multiplier > 0)
);
CREATE TABLE IF NOT EXISTS pricing_regions (
  country VARCHAR(100) PRIMARY KEY, currency_name VARCHAR(100) NOT NULL,
  currency_code VARCHAR(8) NOT NULL, exchange_rate_per_usd NUMERIC(14,6) NOT NULL CHECK (exchange_rate_per_usd > 0),
  local_hourly_rate NUMERIC(14,2) NOT NULL CHECK (local_hourly_rate >= 0),
  minimum_service_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (minimum_service_price >= 0),
  labour_adjustment NUMERIC(7,4) NOT NULL CHECK (labour_adjustment > 0),
  equipment_import_factor NUMERIC(7,4) NOT NULL CHECK (equipment_import_factor > 0),
  source TEXT, active BOOLEAN NOT NULL DEFAULT true, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pricing_fixed_margins (
  intervention_type VARCHAR(30) PRIMARY KEY, margin_usd NUMERIC(12,2) NOT NULL CHECK (margin_usd >= 0), description TEXT
);
CREATE TABLE IF NOT EXISTS pricing_equipment_costs (
  id BIGSERIAL PRIMARY KEY, category VARCHAR(150) NOT NULL, model_type VARCHAR(150), capacity VARCHAR(100),
  average_cost_usd NUMERIC(14,2) NOT NULL CHECK (average_cost_usd >= 0), notes TEXT
);
CREATE TABLE IF NOT EXISTS pricing_service_minimums (
  country VARCHAR(100) PRIMARY KEY,
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  currency_code VARCHAR(8) NOT NULL,
  source TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pricing_historical_cases (
  id BIGSERIAL PRIMARY KEY, fault_code VARCHAR(20) REFERENCES pricing_faults(code), country VARCHAR(100) REFERENCES pricing_regions(country),
  source_description TEXT NOT NULL, intervention_type VARCHAR(30) NOT NULL, equipment_type VARCHAR(160),
  estimated_price NUMERIC(14,2), actual_price NUMERIC(14,2), currency_code VARCHAR(8), initial_confidence NUMERIC(6,5),
  technician_validated BOOLEAN NOT NULL DEFAULT false, client_accepted BOOLEAN, embedding vector(1024), embedding_model VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pricing_system_config (
  key VARCHAR(100) PRIMARY KEY, value JSONB NOT NULL, description TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pricing_quote_audits (
  id BIGSERIAL PRIMARY KEY, client_id INTEGER REFERENCES users(id) ON DELETE SET NULL, request_text TEXT NOT NULL,
  extraction JSONB, confidence NUMERIC(6,5), decision VARCHAR(30) NOT NULL,
  calculation JSONB, rendered_quote TEXT, judge_result JSONB, failure_code VARCHAR(80), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

CREATE INDEX IF NOT EXISTS idx_pricing_faults_structure ON pricing_faults(intervention_type, category) WHERE active = true;
CREATE INDEX IF NOT EXISTS idx_pricing_faults_embedding ON pricing_faults USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_pricing_history_embedding ON pricing_historical_cases USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS idx_pricing_audits_created ON pricing_quote_audits(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_fallback_pending ON pricing_fallback_requests(status, created_at) WHERE status = 'pending';

ALTER TABLE pricing_regions ADD COLUMN IF NOT EXISTS minimum_service_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (minimum_service_price >= 0);

-- Petite maintenance calibrée séparément d'un remplacement de pièce.
INSERT INTO pricing_faults(code, category, subcategory, name, intervention_type, base_parts_cost_usd, estimated_hours, notes)
VALUES ('MNT172','Maintenance','Entretien préventif','Nettoyage filtre lavable climatiseur split','Reparation',0,0.35,'Filtre réutilisable : dépose, nettoyage, séchage et repose. Hors remplacement.')
ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name, base_parts_cost_usd=EXCLUDED.base_parts_cost_usd, estimated_hours=EXCLUDED.estimated_hours, notes=EXCLUDED.notes, active=true;

-- Planchers d'intervention observés en 2026. Ils évitent les devis inférieurs au déplacement.
UPDATE pricing_regions SET minimum_service_price = 2500, source = concat_ws(' | ', NULLIF(source, ''), 'Ouedkniss Alger, nettoyage climatisation, 2026 : à partir de 2 500 DZD') WHERE unaccent(lower(country)) = unaccent(lower('Algérie'));
UPDATE pricing_regions SET minimum_service_price = 45, source = concat_ws(' | ', NULLIF(source, ''), 'SM-Devis/Primini Tunisie, entretien split 2025-2026 : 40-65 TND') WHERE unaccent(lower(country)) = unaccent(lower('Tunisie'));

INSERT INTO pricing_service_minimums(country, amount, currency_code, source) VALUES
 ('Algérie',2500,'DZD','Ouedkniss Alger, nettoyage climatisation, annonce publiée en 2026 : à partir de 2 500 DZD'),
 ('Tunisie',45,'TND','SM-Devis et Primini Tunisie, entretien split 2025-2026 : 40 à 65 TND')
ON CONFLICT (country) DO UPDATE SET amount=EXCLUDED.amount, currency_code=EXCLUDED.currency_code, source=EXCLUDED.source, updated_at=now();

INSERT INTO pricing_urgency_multipliers(level, description, response_delay, multiplier) VALUES
 ('Standard','Intervention planifiée à l''avance','3 à 7 jours',1),
 ('Rapide','Intervention sous 24 à 48h','24-48 heures',1.1),
 ('Urgent','Intervention le jour même','Même jour',1.2),
 ('Urgence immédiate','Intervention sous 2 heures','< 2 heures',1.4),
 ('Nuit / Week-end / Jour férié','Hors heures ouvrées','Variable',1.3)
ON CONFLICT (level) DO UPDATE SET multiplier=EXCLUDED.multiplier, description=EXCLUDED.description, response_delay=EXCLUDED.response_delay;

INSERT INTO pricing_complexity_multipliers(level, description, multiplier) VALUES
 ('Simple','Intervention standard, accès facile, équipement courant',1),
 ('Modérée','Diagnostic approfondi ou accès partiellement difficile',1.1),
 ('Élevée','Système complexe ou accès difficile',1.25),
 ('Très élevée','Grande capacité, hauteur, toiture ou espace confiné',1.45),
 ('Exceptionnelle','Équipement spécialisé ou plusieurs techniciens',1.7)
ON CONFLICT (level) DO UPDATE SET multiplier=EXCLUDED.multiplier, description=EXCLUDED.description;

INSERT INTO pricing_season_multipliers(period, months, description, multiplier) VALUES
 ('Haute saison été (clim)','Juin - Septembre','Forte demande climatisation',1.15),
 ('Haute saison hiver (chauffage)','Décembre - Février','Forte demande chauffage',1.08),
 ('Saison intermédiaire','Mars - Mai','Demande modérée',1),
 ('Basse saison','Octobre - Novembre','Faible demande',0.92),
 ('Période de canicule / vague de chaleur','Variable','Pic exceptionnel de demande',1.25)
ON CONFLICT (period) DO UPDATE SET multiplier=EXCLUDED.multiplier, months=EXCLUDED.months, description=EXCLUDED.description;

INSERT INTO pricing_fixed_margins(intervention_type, margin_usd, description) VALUES
 ('Reparation',3,'Déplacement et frais administratifs'), ('Installation',6,'Déplacement, mise en service et suivi')
ON CONFLICT (intervention_type) DO UPDATE SET margin_usd=EXCLUDED.margin_usd, description=EXCLUDED.description;

INSERT INTO pricing_system_config(key, value, description) VALUES
 ('confidence_automatic','0.70','Seuil de réponse automatique complète'),
 ('confidence_uncertain','0.50','Seuil de réponse automatique avec incertitude'),
 ('judge_max_attempts','3','Nombre maximal de rédactions contrôlées')
ON CONFLICT (key) DO NOTHING;
