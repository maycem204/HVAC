const bcrypt = require("bcrypt");
const { bcryptRounds } = require("../env");

async function hashPassword(password) {
  return bcrypt.hash(password, bcryptRounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = {
  hashPassword,
  verifyPassword,
};
