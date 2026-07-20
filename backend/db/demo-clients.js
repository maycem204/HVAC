const { hashPassword } = require("../utils/password");
const pool = require("../db");

const DEMO_PASSWORD = process.env.DEMO_CLIENT_PASSWORD || "DemoClient@2026!";
const clients = [
  ["Amira Ben Salem", "amira.djerba@quoteai.local", "+216 22 510 101", "Houmt Souk", "Rue de Bizerte, Houmt Souk, Djerba", 33.8772, 10.8594, "TN", "TND"],
  ["Mehdi Trabelsi", "mehdi.zarzis@quoteai.local", "+216 22 520 102", "Zarzis", "Avenue Habib Bourguiba, Zarzis", 33.5038, 11.1106, "TN", "TND"],
  ["Sara Bensaci", "sara.alger@quoteai.local", "+213 555 030 103", "Alger Centre", "24 rue Didouche Mourad, Alger", 36.7709, 3.0568, "DZ", "DZD"],
];

async function seedDemoClients() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    for (const [name,email,phone,city,address,lat,lng,countryCode,currency] of clients) {
      await db.query(
        `INSERT INTO users(name,email,password_hash,role,city,phone,address,lat,lng,avatar,country_code,currency)
         VALUES($1,$2,$3,'client',$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name,password_hash=EXCLUDED.password_hash,
           city=EXCLUDED.city,phone=EXCLUDED.phone,address=EXCLUDED.address,lat=EXCLUDED.lat,
           lng=EXCLUDED.lng,country_code=EXCLUDED.country_code,currency=EXCLUDED.currency`,
        [name,email,passwordHash,city,phone,address,lat,lng,name.split(" ").map((part)=>part[0]).join("").slice(0,2),countryCode,currency]
      );
    }
    await db.query("COMMIT");
    console.log(`Upserted ${clients.length} demo clients`);
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); await pool.end(); }
}

seedDemoClients().catch((error)=>{ console.error(error); process.exit(1); });
