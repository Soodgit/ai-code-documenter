// server/index.js
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");

const authRoute = require("./routes/auth");
const snippetRoute = require("./routes/snippets");

const app = express();
const PORT = process.env.PORT || 5000;

/* DB */
connectDB();

/* Vercel / proxies for secure cookies */
app.set("trust proxy", 1);

/* Security */
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.disable("x-powered-by");

/* Rate limit */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* Core */
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));

/* CORS (Express 5, no "*" patterns) */
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    const ok = ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin); // allow preview domains (optional)
    return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions)); // RegExp instead of "*"

/* Routes */
app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now(), env: process.env.VERCEL_ENV || "local" })
);

app.use("/api/auth", require("./routes/auth"));
app.use("/api/snippets", require("./routes/snippets"));

/* 404 for unknown API paths */
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

/* Error handler */
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ message: "Server error", detail: err.message });
});

/* Export the app for Vercel. Only listen in non-Vercel environments. */
if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}
