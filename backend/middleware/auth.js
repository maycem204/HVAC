const jwt = require("jsonwebtoken");
const { jwtSecret, jwtIssuer, jwtAudience, jwtExpiresIn, authCookieMaxAgeMs } = require("../env");

const AUTH_COOKIE_NAME = "quoteai_session";

function tokenFromCookie(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    const name = item.slice(0, separator).trim();
    if (name !== AUTH_COOKIE_NAME) continue;
    try { return decodeURIComponent(item.slice(separator + 1).trim()); }
    catch { return null; }
  }
  return null;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: authCookieMaxAgeMs,
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE_NAME, token, cookieOptions());
}

function clearAuthCookie(res) {
  const { maxAge, ...options } = cookieOptions();
  res.clearCookie(AUTH_COOKIE_NAME, options);
}

function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  const match = typeof authHeader === "string" && authHeader.match(/^Bearer\s+([^\s]+)$/i);
  const token = tokenFromCookie(req.headers.cookie) || match?.[1];
  if (!token) {
    return res.status(401).json({
      error: "No token provided",
    });
  }

  try {
    const decoded = verifyToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({
      error: "Invalid token",
    });
  }
}

function verifyToken(token) {
  return jwt.verify(token, jwtSecret, { algorithms: ["HS256"], issuer: jwtIssuer, audience: jwtAudience });
}

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role }, jwtSecret, {
    algorithm: "HS256",
    expiresIn: jwtExpiresIn,
    issuer: jwtIssuer,
    audience: jwtAudience,
  });
}

function requireRole(...roles) {
  return (req, res, next) => roles.includes(req.user?.role)
    ? next()
    : res.status(403).json({ error: "Forbidden" });
}

module.exports = auth;
module.exports.signToken = signToken;
module.exports.requireRole = requireRole;
module.exports.verifyToken = verifyToken;
module.exports.setAuthCookie = setAuthCookie;
module.exports.clearAuthCookie = clearAuthCookie;
module.exports.tokenFromCookie = tokenFromCookie;
