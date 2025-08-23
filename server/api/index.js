// server/api/index.js
// Serverless entry for Vercel (Express 5 compatible)
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const express = require("express");
const serverless = require("serverless-http");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const connectDB = require("../config/db");
const authRoute = require("../routes/auth");
const snippetRoute = require("../routes/snippets");

/* -----------------------------------------------------------------------------
 * Boot & DB
 * ---------------------------------------------------------------------------*/
connectDB();
const app = express();

// Allow secure cookies behind Vercel proxy (SameSite=None requires Secure)
app.set("trust proxy", 1);

/* -----------------------------------------------------------------------------
 * Security
 *  - Disable CORP so CORS controls cross-origin policy
 * ---------------------------------------------------------------------------*/
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.disable("x-powered-by");

/* -----------------------------------------------------------------------------
 * Rate Limiting
 * ---------------------------------------------------------------------------*/
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

/* -----------------------------------------------------------------------------
 * Core
 * ---------------------------------------------------------------------------*/
app.use(cookieParser());
app.use(express.json({ limit: "1mb" })); // adjust if you upload larger payloads

/* -----------------------------------------------------------------------------
 * CORS (dynamic allowlist + credentials)
 *  Express 5 no longer accepts "*" path in routers; use RegExp (/.*/) for OPTIONS.
 * ---------------------------------------------------------------------------*/

// Exact FE(s) you trust
const ALLOWLIST = [
  process.env.CLIENT_URL,       // e.g. https://your-frontend.vercel.app
  "http://localhost:5173",
].filter(Boolean);

// Optional: allow any Vercel preview domain (remove this if you want strict lock)
const ALLOW_VERCEL_PREVIEWS = true;

// Delegate allows per-request options (origin reflection)
function corsDelegate(req, cb) {
  const origin = req.headers.origin || "";
  const ok =
    ALLOWLIST.includes(origin) ||
    (ALLOW_VERCEL_PREVIEWS && /\.vercel\.app$/.test(origin));

  const options = ok
    ? {
        origin, // reflect the allowed origin exactly (required for credentials)
        credentials: true,
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        optionsSuccessStatus: 204,
      }
    : { origin: false };

  cb(null, options);
}

// Help CDNs separate responses by Origin
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

// Apply CORS; handle preflight with a RegExp (no "*")
app.use(cors(corsDelegate));
app.options(/.*/, cors(corsDelegate));

/* -----------------------------------------------------------------------------
 * Routes
 * ---------------------------------------------------------------------------*/
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    ts: Date.now(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  })
);

app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

// 404 for unknown API paths
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

/* -----------------------------------------------------------------------------
 * Error Handler
 * ---------------------------------------------------------------------------*/
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res
    .status(err.status || 500)
    .json({ message: "Server error", detail: err.message || "Unknown error" });
});

/* -----------------------------------------------------------------------------
 * Export for Vercel
 *  - Vercel’s Node runtime expects (req, res) => {} or a serverless-http handler.
 *  - Export both for flexibility.
 * ---------------------------------------------------------------------------*/
module.exports = app;
module.exports.handler = serverless(app);
