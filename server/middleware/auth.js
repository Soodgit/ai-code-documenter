// server/middleware/auth.js
const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "No token" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "dev_access");
    req.userId = decoded.id;
    return next();
  } catch (e) {
    console.warn("[auth] invalid token:", e.message);
    return res.status(401).json({ message: "Invalid token" });
  }
}

module.exports = auth;
