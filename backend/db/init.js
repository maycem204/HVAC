const fs = require("fs");
const pool = require("../db");

const sql = ["./db/init.sql", "./db/pricing.sql"]
  .map((file) => fs.readFileSync(file, "utf8"))
  .join("\n");

pool.query(sql)
  .then(() => {
    console.log("Database initialized");
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });
