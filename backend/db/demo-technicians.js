const { hashPassword } = require("../utils/password");
const pool = require("../db");

const DEMO_PASSWORD = process.env.DEMO_TECH_PASSWORD || "DemoTech@2026!";
const technicians = [
  ["Hatem Gharbi", "hatem.djerba@quoteai.local", "+216 22 410 101", "Houmt Souk", "Avenue Habib-Bourguiba, Houmt Souk, Djerba", 33.8758, 10.8575, ["Climatisation", "Réparation", "Réfrigération"]],
  ["Sami Trabelsi", "sami.djerba@quoteai.local", "+216 22 410 102", "Midoun", "Route de Mahboubine, Midoun, Djerba", 33.8081, 10.9923, ["Climatisation", "Installation", "Maintenance préventive"]],
  ["Youssef Ben Amor", "youssef.djerba@quoteai.local", "+216 22 410 103", "Ajim", "Route du port, Ajim, Djerba", 33.7248, 10.7492, ["Chauffage", "Pompe à chaleur", "Réparation"]],
  ["Nader Kammoun", "nader.djerba@quoteai.local", "+216 22 410 104", "Aghir", "Route touristique, Aghir, Djerba", 33.7646, 11.0167, ["Climatisation", "Multi-split", "Installation"]],
  ["Walid Jaziri", "walid.djerba@quoteai.local", "+216 22 410 105", "Erriadh", "Rue de la Synagogue, Erriadh, Djerba", 33.8205, 10.8547, ["Ventilation", "Réfrigération", "Dépannage HVAC"]],
  ["Mohamed Chaabane", "mohamed.zarzis@quoteai.local", "+216 22 420 101", "Zarzis", "Avenue de la République, Zarzis", 33.5041, 11.1122, ["Climatisation", "Réparation", "Réfrigération"]],
  ["Fares Hadded", "fares.zarzis@quoteai.local", "+216 22 420 102", "Sangho", "Route touristique de Sangho, Zarzis", 33.5888, 11.0736, ["Climatisation", "Installation", "Pompe à chaleur"]],
  ["Amine Boudiaf", "amine.alger@quoteai.local", "+213 555 020 101", "Alger Centre", "18 rue Larbi-Ben-M'hidi, Alger", 36.7731, 3.0586, ["Climatisation", "Chauffage", "Réparation", "Installation"]],
];

async function seedDemoTechnicians() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [name, email, phone, city, address, lat, lng, specializations] of technicians) {
      const countryCode = email.includes("alger") ? "DZ" : "TN";
      const currency = countryCode === "DZ" ? "DZD" : "TND";
      const user = await client.query(
        `INSERT INTO users (name,email,password_hash,role,city,phone,address,lat,lng,avatar,country_code,currency)
         VALUES ($1,$2,$3,'technician',$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
           city=EXCLUDED.city,phone=EXCLUDED.phone,address=EXCLUDED.address,lat=EXCLUDED.lat,
           lng=EXCLUDED.lng,country_code=EXCLUDED.country_code,currency=EXCLUDED.currency RETURNING id`,
        [name,email,passwordHash,city,phone,address,lat,lng,name.split(" ").map((part)=>part[0]).join("").slice(0,2),countryCode,currency]
      );
      await client.query(
        `INSERT INTO technician_profiles (user_id,specializations,radius_km,response_time,available)
         VALUES ($1,$2,$3,'30 à 45 min',true)
         ON CONFLICT (user_id) DO UPDATE SET specializations=EXCLUDED.specializations,
           radius_km=EXCLUDED.radius_km,response_time=EXCLUDED.response_time,available=true`,
        [user.rows[0].id,specializations,countryCode === "TN" ? 45 : 25]
      );
    }
    await client.query("COMMIT");
    console.log(`Upserted ${technicians.length} demo technicians`);
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); await pool.end(); }
}

seedDemoTechnicians().catch((error)=>{ console.error(error); process.exit(1); });
