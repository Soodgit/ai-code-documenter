// server/index.js
require("dotenv").config();  // Ensure the environment variables are loaded

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db"); // Correct file path for DB connection

const authRoute = require("./routes/auth");  // Correct path for authentication routes
const snippetRoute = require("./routes/snippets");  // Correct path for snippet routes

const app = express();
const PORT = process.env.PORT || 5000;

// Database connection
connectDB();

// Security headers (using Helmet)
app.use(helmet());
app.disable("x-powered-by"); // Hide Express info for security

// Rate Limiting middleware
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,  // Limit each IP to 100 requests per window
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// CORS configuration (allow specific origins)
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL,
  "http://localhost:5173",
  "https://ai-code-documenter-fqhq9uila-soodgits-projects.vercel.app",
  "https://ai-code-documenter-issag96ur-soodgits-projects.vercel.app"
].filter(Boolean);

const corsDelegate = (req, cb) => {
  const origin = req.headers.origin || "";
  const ok = ALLOWED_ORIGINS.includes(origin); // Check if the origin is allowed
  cb(null, ok ? {
    origin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    optionsSuccessStatus: 204,
  } : { origin: false });
};

// Ensure Vary header for caching by origin
app.use((req, res, next) => {
  res.setHeader("Vary", "Origin");
  next();
});

// Enable CORS
app.use(cors(corsDelegate));
app.options(/.*/, cors(corsDelegate)); // Handle OPTIONS requests

// Core middlewares
app.use(cookieParser());  // Cookie parser
app.use(express.json({ limit: "1mb" }));  // Limit the size of incoming request body

// Routes
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    ts: Date.now(),
    env: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
  })
);

app.use("/api/auth", authRoute);  // Authentication route
app.use("/api/snippets", snippetRoute);  // Snippet route

// Handle 404 for unknown routes
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ message: "Server error", detail: err.message || "Unknown error" });
});

// Export the app for serverless
module.exports = app;

// For local dev, run the server locally
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running at http://localhost:${PORT}`);
  });
}
