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

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

connectDB();

const app = express();
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cookieParser());
app.use(express.json());

const clientURL = process.env.CLIENT_URL || "http://localhost:5173";
app.use(cors({ origin: clientURL, credentials: true }));

app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

module.exports = app;
module.exports.handler = serverless(app);
