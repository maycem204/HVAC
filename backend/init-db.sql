-- Users table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK (role IN ('client', 'technician')),
  city VARCHAR(255),
  phone VARCHAR(50),
  address TEXT,
  avatar TEXT,
  lat DECIMAL(10, 8),
  lng DECIMAL(11, 8),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Technician profiles table
CREATE TABLE IF NOT EXISTS technician_profiles (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  specializations TEXT[],
  radius_km INTEGER DEFAULT 10,
  rating DECIMAL(3, 2) DEFAULT 0,
  reviews_count INTEGER DEFAULT 0,
  available BOOLEAN DEFAULT true,
  response_time VARCHAR(50)
);

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  technician_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  time VARCHAR(50) NOT NULL,
  service VARCHAR(255) NOT NULL,
  fault_type VARCHAR(255),
  estimated_price DECIMAL(10, 2),
  actual_price DECIMAL(10, 2),
  address TEXT,
  case_description TEXT,
  status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'completed', 'cancelled')),
  client_confirmed_price BOOLEAN DEFAULT false,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Leads table
CREATE TABLE IF NOT EXISTS leads (
  id SERIAL PRIMARY KEY,
  technician_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  client_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  client_name VARCHAR(255),
  problem TEXT,
  price DECIMAL(10, 2),
  confidence INTEGER CHECK (confidence >= 0 AND confidence <= 100),
  status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'done')),
  city VARCHAR(255),
  fault_type VARCHAR(255),
  offered_price DECIMAL(10, 2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Price rules table
CREATE TABLE IF NOT EXISTS price_rules (
  id SERIAL PRIMARY KEY,
  technician_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  service VARCHAR(255) NOT NULL,
  unit VARCHAR(100),
  price DECIMAL(10, 2) NOT NULL,
  category VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL CHECK (type IN ('lead', 'rdv', 'price', 'rating', 'system', 'reassign')),
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id);
CREATE INDEX IF NOT EXISTS idx_appointments_technician ON appointments(technician_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_leads_technician ON leads(technician_id);
CREATE INDEX IF NOT EXISTS idx_leads_client ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_price_rules_technician ON price_rules(technician_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
