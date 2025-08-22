// server/api/index.js
const serverless = require("serverless-http");
const express = require("express");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const connectDB = require("../config/db");

// routes
const authRoute = require("../routes/auth");
const snippetRoute = require("../routes/snippets");

// Env
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

// Connect DB once at cold start
connectDB();

const app = express();

// Security
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false }));

// Core
app.use(cookieParser());
app.use(express.json());

// CORS — Vercel frontend domain allow karo
const clientURL = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({ origin: clientURL, credentials: true }));

// API routes
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Export handler
module.exports = app;
module.exports.handler = serverless(app);
