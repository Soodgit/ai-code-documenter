// server/index.js
require("dotenv").config();  // Load environment variables

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");  // MongoDB connection setup
const authRoute = require("./routes/auth");  // Authentication routes
const snippetRoute = require("./routes/snippets");  // Snippet routes
const path = require("path");

const app = express();

// CORS Setup (allow specific origins)
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,       // your production frontend URL
  "http://localhost:5173",      // your local dev frontend URL
].filter(Boolean);

// Add Vercel preview support (allow *.vercel.app origins)
const ALLOW_VERCEL_PREVIEWS = true;

const corsDelegate = (req, cb) => {
  const origin = req.headers.origin || "";
  const ok =
    ALLOWED_ORIGINS.includes(origin) || 
    (ALLOW_VERCEL_PREVIEWS && /\.vercel\.app$/.test(origin));

  cb(null, ok
    ? {
        origin,
        credentials: true, 
        methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        optionsSuccessStatus: 204,
      }
    : { origin: false });
};

// Ensure Vary header for CDN (separate caches for each origin)
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

// Trust proxy behind Vercel for secure cookies
app.set("trust proxy", 1);

// CORS setup
app.use(cors(corsDelegate));
app.options(/.*/, cors(corsDelegate)); // Handle preflight (OPTIONS)

/* Security headers */
app.use(helmet());  // Enables many security-related HTTP headers
app.disable("x-powered-by"); // Hide Express info from the response header

/* Rate Limiting */
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Max 100 requests in 15 minutes
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Core middlewares
app.use(cookieParser()); // Cookie parser to handle cookies
app.use(express.json({ limit: "1mb" })); // Limit request size to prevent overloading

// Connect to the database
connectDB();

/* Routes */
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    ts: Date.now(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  })
);

// API routes
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

// 404 for unknown routes
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

/* Error handler */
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res
    .status(err.status || 500)
    .json({ message: "Server error", detail: err.message || "Unknown error" });
});

// Export the app for serverless
module.exports = app;

if (!process.env.VERCEL) {
  // Local development: listen on the specified port
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}
