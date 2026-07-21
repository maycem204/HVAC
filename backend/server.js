const { verifyToken } = require("./middleware/auth");
const http = require("http");
const { Server } = require("socket.io");
const express = require("express");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const multer = require("multer");
const { rateLimit } = require("express-rate-limit");
const { port, corsOrigins } = require("./env");

const pool = require("./db");
const { ensureRuntimeSchema } = require("./db/ensure-runtime-schema");
const pricingRouter = require("./routes/pricing");
const conversationsRouter = require("./routes/conversations");
const applicationRouter = require("./routes/application");
const { setRealtimeServer } = require("./realtime");

const app = express();

app.disable("x-powered-by");
// Render termine HTTPS devant Express et transmet l'adresse client via un proxy unique.
app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "https://tile.openstreetmap.org"],
    },
  },
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
}));
app.use(cors({
  origin: corsOrigins.length ? corsOrigins : false,
  credentials: true
}));
app.use(express.json({ limit: "750kb" }));
const publicLimiter = rateLimit({ windowMs: 60 * 1000, limit: 120, standardHeaders: "draft-8", legacyHeaders: false });
app.use(publicLimiter);
app.use("/api/pricing", pricingRouter);
app.use("/conversations", conversationsRouter);
app.use(applicationRouter);
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.resolve(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist, { maxAge: "1d", index: false }));
  app.get(/^(?!\/(?:api|conversations|appointments|technicians|notifications|leads|tarifs|blocked-slots|availability|auth|register|login|health|test)).*/, (req, res) => res.sendFile(path.join(frontendDist, "index.html")));
}

app.use((error, req, res, next) => {
  console.error(error);
  const status = error instanceof multer.MulterError ? 400
    : Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
  res.status(status).json({ error: status === 500 ? "Erreur interne" : error.message });
});

const server = http.createServer(app);
const io = new Server(server, corsOrigins.length ? { cors: { origin: corsOrigins, credentials: true } } : {});
io.use((socket, next) => {
  try {
    socket.user = verifyToken(socket.handshake.auth?.token);
    next();
  } catch {
    next(new Error("unauthorized"));
  }
});
io.on("connection", (socket) => {
  socket.join(`user:${socket.user.id}`);
});
setRealtimeServer(io);

// START SERVER
ensureRuntimeSchema(pool)
  .then(() => {
    server.listen(port, () => {
      console.log(`Serveur lancé sur http://localhost:${port}`);
    });
  })
  .catch((err) => {
    console.error("Erreur initialisation planning:", err);
    process.exit(1);
  });
