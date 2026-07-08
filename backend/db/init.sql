-- users (clients ET techniciens)
CREATE TABLE users (
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
  created_at TIMESTAMP DEFAULT now()
);

-- profil technicien (specialisations, rayon, tarifs liés)
CREATE TABLE technician_profiles (
  user_id INT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specializations TEXT[] NOT NULL DEFAULT '{}',
  radius_km INT DEFAULT 10,
  rating NUMERIC(2,1) DEFAULT 0,
  reviews_count INT DEFAULT 0,
  response_time VARCHAR(30),
  available BOOLEAN DEFAULT true
);

CREATE TABLE price_items (
  id SERIAL PRIMARY KEY,
  technician_id INT REFERENCES users(id) ON DELETE CASCADE,
  service VARCHAR(160) NOT NULL,
  unit VARCHAR(50),
  price NUMERIC(10,2) NOT NULL,
  category VARCHAR(50)
);

CREATE TABLE blocked_slots (
  id SERIAL PRIMARY KEY,
  technician_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) CHECK (type IN ('specific','daily','weekly')),
  date DATE,
  week_days INT[],
  start_time TIME,
  end_time TIME,
  label VARCHAR(160)
);

CREATE TABLE leads (
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

CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  client_id INT REFERENCES users(id),
  technician_id INT REFERENCES users(id),
  date DATE NOT NULL,
  time TIME NOT NULL,
  service VARCHAR(160),
  fault_type VARCHAR(50),
  estimated_price NUMERIC(10,2),
  actual_price NUMERIC(10,2),
  status VARCHAR(20) DEFAULT 'pending', -- pending, confirmed, completed, cancelled
  address TEXT,
  duration VARCHAR(20),
  case_description TEXT,
  client_confirmed_price BOOLEAN DEFAULT false,
  rating INT,
  feedback TEXT
);

CREATE TABLE notifications (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20),
  title VARCHAR(160),
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT now()
);