// server/api/index.js
const serverless = require("serverless-http");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("../config/db");
const authRoute = require("../routes/auth");
const snippetRoute = require("../routes/snippets");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

connectDB();

const app = express();

// --- Security & core ---
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cookieParser());
app.use(express.json());

// --- CORS ---
const allowlist = [
  process.env.CLIENT_URL,                               // e.g. https://ai-code-documenter.vercel.app
];
if (process.env.CLIENT_URL_PREVIEW) {
  // allow all vercel preview domains if you want
  allowlist.push(/\.vercel\.app$/);
}

const corsOptions = (req, cb) => {
  const origin = req.headers.origin;
  const ok = allowlist.some((o) =>
    typeof o === "string" ? o === origin : o.test(origin || "")
  );

  // Always vary on Origin so caches don't mix responses
  // (Vercel’s CDN will respect this)
  // This header must be set before sending the response
  // We'll add it via a tiny middleware:
  cb(null, ok
    ? {
        origin,                             // reflect allowed origin
        credentials: true,                  // allow cookies
        methods: "GET,POST,PATCH,DELETE,OPTIONS",
        allowedHeaders: "Content-Type, Authorization",
      }
    : { origin: false });
};

// ensure caches split by Origin
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

// Must handle preflight
app.options("*", cors(corsOptions));
app.use(cors(corsOptions));

// --- Routes ---
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

module.exports = app;
module.exports.handler = serverless(app);
