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

// DB
connectDB();

// Security
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Core
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true, // send refresh cookie
  })
);
app.use(express.json());

// Routes
app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

// Error handler (dev)
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(500).json({ message: "Server error", detail: err.message });
});

// Start
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
