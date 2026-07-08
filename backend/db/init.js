const fs = require("fs");
const pool = require("../db");

const sql = fs.readFileSync("./db/init.sql", "utf8");

pool.query(sql)
  .then(() => {
    console.log("Database initialized");
    process.exit();
  })
  .catch(err => {
    console.error(err);
    process.exit(1);
  });