const { Pool } = require("pg");
const { databaseUrl, databaseSsl } = require("./env");

const requiresSsl =
  databaseSsl ||
  (databaseUrl && !databaseUrl.includes("localhost") && !databaseUrl.includes("127.0.0.1"));

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: requiresSsl ? { rejectUnauthorized: false } : undefined,
});

module.exports = pool;
