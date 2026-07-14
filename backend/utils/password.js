const bcrypt = require("bcrypt");
const { bcryptRounds } = require("../env");

async function hashPassword(password) {
  return bcrypt.hash(password, bcryptRounds);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "123456789", "azertyui", "qwertyui",
  "motdepasse", "bienvenue", "admin123", "iloveyou", "technicien", "climatisation",
]);

function normalized(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function validatePassword(password, { name = "", email = "" } = {}) {
  if (typeof password !== "string" || password.length < 8) return "Utilisez au moins 8 caractères";
  if (Buffer.byteLength(password, "utf8") > 72) return "Le mot de passe est trop long";
  const compact = normalized(password);
  if (COMMON_PASSWORDS.has(compact) || /^(.)\1{7,}$/.test(compact) || /^(01234567|12345678|23456789|abcdefgh|azertyui|qwertyui)/.test(compact)) return "Choisissez un mot de passe moins courant";
  const personalTokens = [String(email).split("@")[0], ...String(name).split(/\s+/)]
    .map(normalized).filter((token) => token.length >= 3);
  if (personalTokens.some((token) => compact.includes(token))) return "Le mot de passe ne doit pas contenir votre nom ou votre e-mail";
  return null;
}

module.exports = {
  hashPassword,
  verifyPassword,
  validatePassword,
};
