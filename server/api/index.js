// server/api/index.js
const serverless = require("serverless-http");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const path = require("path");

const connectDB = require("../config/db");
const authRoute = require("../routes/auth");
const snippetRoute = require("../routes/snippets");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

connectDB();

const app = express();

// 1) Security & parsing
app.use(helmet({ crossOriginResourcePolicy: false })); // don't block cross-site assets
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cookieParser());
app.use(express.json());

// 2) Build allowlist for CORS
const allowlist = [];
if (process.env.CLIENT_URL) allowlist.push(process.env.CLIENT_URL); // prod FE
// allow preview *.vercel.app if you want previews to work
allowlist.push(/\.vercel\.app$/);

// 3) Set Vary so CDN doesn’t cache incorrectly per origin
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

// 4) CORS options & handlers (must come BEFORE routes)
const corsOptions = (req, cb) => {
  const origin = req.headers.origin || "";
  const ok = allowlist.some((rule) =>
    typeof rule === "string" ? rule === origin : rule.test(origin)
  );

  if (!ok) {
    // Not allowed → do not send CORS headers
    return cb(null, { origin: false });
  }

  cb(null, {
    origin, // reflect allowed origin
    credentials: true,
    methods: "GET,POST,PATCH,DELETE,OPTIONS",
    allowedHeaders: "Content-Type, Authorization",
    optionsSuccessStatus: 204,
  });
};

app.options("*", cors(corsOptions)); // respond to preflight
app.use(cors(corsOptions));

// 5) Routes
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

module.exports = app;
module.exports.handler = serverless(app);
