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

/* Trust proxy (Vercel/HTTPS -> secure cookies) */
app.set("trust proxy", 1);

/* Security headers */
app.use(
  helmet({
    crossOriginResourcePolicy: false, // let CORS decide
  })
);
app.disable("x-powered-by");

/* Rate limiting */
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

/* CORS */
const ALLOWED_ORIGINS = [
  process.env.CLIENT_URL, // e.g. https://your-frontend.vercel.app
  "http://localhost:5173",
].filter(Boolean);

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow curl/postman
    const ok =
      ALLOWED_ORIGINS.includes(origin) || /\.vercel\.app$/.test(origin); // optional previews
    return ok ? cb(null, true) : cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
// ⚠️ No "*" here. Use RegExp OR manual handler:
app.options(/.*/, cors(corsOptions)); // or remove this line and use the manual handler below

// If you prefer manual OPTIONS handling instead of the line above, use:
// app.use((req, res, next) => {
//   if (req.method === "OPTIONS") return res.sendStatus(204);
//   next();
// });

/* Routes */
app.get("/health", (_req, res) =>
  res.json({ ok: true, ts: Date.now(), env: process.env.VERCEL_ENV || "local" })
);

app.use("/api/auth", authRoute);
app.use("/api/snippets", snippetRoute);

/* 404 for unknown API paths */
app.use("/api", (_req, res) => res.status(404).json({ message: "Not found" }));

/* Error handler */
app.use((err, _req, res, _next) => {
  console.error("[unhandled]", err);
  res.status(err.status || 500).json({ message: "Server error", detail: err.message });
});

/* Start */
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
