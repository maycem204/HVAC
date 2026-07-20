-- users (clients ET techniciens)
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(160) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(30),
  address TEXT,
  city VARCHAR(80),
  role VARCHAR(20) CHECK (role IN ('client','technician')) NOT NULL,
  avatar VARCHAR(4),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  country_code VARCHAR(2),
  currency VARCHAR(3),
  created_at TIMESTAMP DEFAULT now()
);

-- profil technicien (specialisations, rayon, tarifs liés)
CREATE TABLE IF NOT EXISTS technician_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specializations TEXT[] NOT NULL DEFAULT '{}',
  radius_km INT DEFAULT 10,
  rating NUMERIC(2,1) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  response_time VARCHAR(30),
  available BOOLEAN DEFAULT true
);

CREATE TABLE IF NOT EXISTS price_items (
  id SERIAL PRIMARY KEY,
  technician_id INT REFERENCES users(id) ON DELETE CASCADE,
  service VARCHAR(160) NOT NULL,
  unit VARCHAR(50),
  price NUMERIC(10,2) NOT NULL,
  category VARCHAR(50),
  country_code VARCHAR(2) NOT NULL DEFAULT 'DZ',
  currency VARCHAR(3) NOT NULL DEFAULT 'DZD',
  source_filename VARCHAR(255),
  imported_at TIMESTAMPTZ
);

ALTER TABLE users ALTER COLUMN avatar TYPE TEXT;

CREATE TABLE IF NOT EXISTS blocked_slots (
  id SERIAL PRIMARY KEY,
  technician_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('specific','daily','weekly')),
  date DATE,
  week_days INT[],
  start_time TIME,
  end_time TIME,
  label VARCHAR(160)
);

CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  client_id INT REFERENCES users(id),
  technician_id INT REFERENCES users(id),
  problem TEXT,
  fault_type VARCHAR(50),
  price NUMERIC(10,2),
  confidence INT,
  status VARCHAR(20) DEFAULT 'new', -- new, accepted, done
  city VARCHAR(80),
  created_at TIMESTAMP DEFAULT now()
);

-- Préserve l'ancienne table UUID du prototype avant de créer le schéma métier actuel.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'appointments'
      AND column_name = 'id' AND data_type = 'uuid'
  ) AND to_regclass('public.appointments_legacy') IS NULL THEN
    ALTER TABLE appointments RENAME TO appointments_legacy;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  client_id INT REFERENCES users(id),
  technician_id INT REFERENCES users(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  service VARCHAR(160),
  fault_type VARCHAR(50),
  estimated_price NUMERIC(10,2),
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  actual_price NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, completed, cancelled
  address TEXT,
  duration VARCHAR(20),
  case_description TEXT,
  client_confirmed_price BOOLEAN DEFAULT false,
  rating INT,
  feedback TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20),
  title VARCHAR(160),
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS client_blocked_technicians (
  client_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  technician_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (client_id, technician_id),
  CHECK (client_id <> technician_id)
);

INSERT INTO technician_ratings(client_id, technician_id, rating, comment)
SELECT DISTINCT ON (client_id, technician_id) client_id, technician_id, rating, feedback
FROM appointments
WHERE rating IS NOT NULL
ORDER BY client_id, technician_id, date DESC, time DESC
ON CONFLICT (client_id, technician_id) DO NOTHING;
