const { hashPassword } = require("../utils/password");
const { seedClientPassword, seedTechPassword } = require("../env");
const pool = require("../db");

const users = [
  {
    name: "Nadia Khelifi",
    email: "client@quoteai.local",
    password: seedClientPassword,
    role: "client",
    city: "Alger Centre",
    phone: "+213 555 010 200",
    address: "12 rue Didouche Mourad, Alger",
    lat: 36.7753,
    lng: 3.0602,
  },
  {
    name: "Ahmed Benali",
    email: "ahmed@quoteai.local",
    password: seedTechPassword,
    role: "technician",
    city: "Alger Centre",
    phone: "+213 555 010 101",
    address: "Atelier HVAC, Alger Centre",
    lat: 36.771,
    lng: 3.058,
    specializations: ["Climatisation", "Reparation", "Refrigeration"],
    radius_km: 18,
    rating: 0,
    reviews_count: 0,
    response_time: "30 min",
  },
  {
    name: "Karim Meziane",
    email: "karim@quoteai.local",
    password: seedTechPassword,
    role: "technician",
    city: "Hydra",
    phone: "+213 555 010 102",
    address: "Hydra, Alger",
    lat: 36.7472,
    lng: 3.0419,
    specializations: ["Chauffage", "Ventilation", "Installation"],
    radius_km: 22,
    rating: 0,
    reviews_count: 0,
    response_time: "45 min",
  },
  {
    name: "Sofiane Hadjadj",
    email: "sofiane@quoteai.local",
    password: seedTechPassword,
    role: "technician",
    city: "Kouba",
    phone: "+213 555 010 103",
    address: "Kouba, Alger",
    lat: 36.7333,
    lng: 3.0833,
    specializations: ["Installation", "Maintenance preventive", "Pompe a chaleur"],
    radius_km: 20,
    rating: 0,
    reviews_count: 0,
    response_time: "1 h",
  },
];

const tariffs = [
  ["Diagnostic + deplacement", "Forfait", 45, "Base"],
  ["Nettoyage clim split", "Par unite", 60, "Maintenance"],
  ["Recharge fluide R32", "Par kg", 35, "Reparation"],
  ["Detection fuite", "Forfait", 90, "Reparation"],
  ["Installation split 12000 BTU", "Pose incluse", 180, "Installation"],
];

async function upsertUser(client, user) {
  const passwordHash = await hashPassword(user.password);
  const result = await client.query(
    `INSERT INTO users (name, email, password_hash, role, city, phone, address, lat, lng, avatar)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (email) DO UPDATE SET
       name = EXCLUDED.name,
       role = EXCLUDED.role,
       city = EXCLUDED.city,
       phone = EXCLUDED.phone,
       address = EXCLUDED.address,
       lat = EXCLUDED.lat,
       lng = EXCLUDED.lng,
       avatar = EXCLUDED.avatar
     RETURNING id`,
    [
      user.name,
      user.email,
      passwordHash,
      user.role,
      user.city,
      user.phone,
      user.address,
      user.lat,
      user.lng,
      user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    ]
  );

  const id = result.rows[0].id;
  if (user.role === "technician") {
    await client.query(
      `INSERT INTO technician_profiles (user_id, specializations, radius_km, rating, reviews_count, response_time, available)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       ON CONFLICT (user_id) DO UPDATE SET
         specializations = EXCLUDED.specializations,
         radius_km = EXCLUDED.radius_km,
         response_time = EXCLUDED.response_time,
         available = true`,
      [id, user.specializations, user.radius_km, user.rating, user.reviews_count, user.response_time]
    );

    await client.query("DELETE FROM price_items WHERE technician_id = $1", [id]);
    for (const tariff of tariffs) {
      await client.query(
        `INSERT INTO price_items (technician_id, service, unit, price, category)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, ...tariff]
      );
    }
  }
  return id;
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = {};
    for (const user of users) {
      ids[user.email] = await upsertUser(client, user);
    }

    const clientId = ids["client@quoteai.local"];
    const ahmedId = ids["ahmed@quoteai.local"];
    const karimId = ids["karim@quoteai.local"];

    await client.query("DELETE FROM notifications WHERE user_id IN ($1, $2, $3)", [clientId, ahmedId, karimId]);
    await client.query("DELETE FROM leads WHERE client_id = $1 OR technician_id IN ($2, $3)", [clientId, ahmedId, karimId]);
    await client.query("DELETE FROM appointments WHERE client_id = $1 OR technician_id IN ($2, $3)", [clientId, ahmedId, karimId]);

    await client.query(
      `INSERT INTO appointments (client_id, technician_id, date, time, service, fault_type, estimated_price, actual_price, status, address, duration, case_description, client_confirmed_price, rating, feedback)
       VALUES
       ($1, $2, CURRENT_DATE, '14:00', 'Diagnostic clim Daikin', 'Climatisation', 185, NULL, 'confirmed', '12 rue Didouche Mourad, Alger', '2h', NULL, false, NULL, NULL),
       ($1, $3, CURRENT_DATE - INTERVAL '2 days', '10:30', 'Recharge fluide R32', 'Climatisation', 145, 160, 'completed', '12 rue Didouche Mourad, Alger', '1h30', 'Fuite detectee sur raccord exterieur, soudure et recharge R32.', true, 5, 'Service rapide et professionnel.')`,
      [clientId, ahmedId, karimId]
    );

    await client.query(
      `INSERT INTO leads (client_id, technician_id, problem, fault_type, price, confidence, status, city)
       VALUES
       ($1, $2, 'Climatiseur Daikin split ne refroidit plus', 'Climatisation', 185, 82, 'new', 'Alger Centre'),
       ($1, $3, 'Installation clim salon 12000 BTU', 'Installation', 520, 74, 'accepted', 'Hydra')`,
      [clientId, ahmedId, karimId]
    );

    await client.query(
      `INSERT INTO notifications (user_id, type, title, message)
       VALUES
       ($1, 'rdv', 'Rendez-vous confirme', 'Ahmed Benali confirme votre intervention aujourd''hui a 14:00.'),
       ($2, 'lead', 'Nouveau lead', 'Nadia Khelifi demande un diagnostic climatisation a Alger Centre.'),
       ($3, 'rating', 'Nouvel avis client', 'Nadia Khelifi a laisse une note de 5/5.')`,
      [clientId, ahmedId, karimId]
    );

    await client.query("COMMIT");
    console.log("Database seeded");
    console.log(`Client login: client@quoteai.local / ${seedClientPassword}`);
    console.log(`Technician login: ahmed@quoteai.local / ${seedTechPassword}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
