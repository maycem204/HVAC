const jwt = require("jsonwebtoken");
const { jwtSecret, jwtIssuer, jwtAudience, jwtExpiresIn } = require("../env");

function auth(req, res, next) {
  const authHeader = req.headers.authorization;

  const match = typeof authHeader === "string" && authHeader.match(/^Bearer\s+([^\s]+)$/i);
  if (!match) {
    return res.status(401).json({
      error: "No token provided",
    });
  }

  const token = match[1];

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
