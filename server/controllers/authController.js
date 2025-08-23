// server/controllers/authController.js
/**
 * Authentication Controller
 * ---------------------------------------------------------------------------
 * This controller exposes the following endpoints:
 *   - POST   /api/auth/register
 *   - POST   /api/auth/login
 *   - POST   /api/auth/refresh
 *   - POST   /api/auth/logout
 *   - POST   /api/auth/forgot-password
 *   - POST   /api/auth/reset-password/:token
 *
 * Design goals:
 *   • Keep responses consistent and minimal (never leak internals).
 *   • Support refresh-token rotation with cookie storage.
 *   • Be resilient if the model method `matchPassword` is unavailable.
 *   • Clear separation of helpers vs. controllers.
 */

const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs"); // fallback compare if model has no method
const { validationResult } = require("express-validator");
const User = require("../models/User");

/* ────────────────────────────────────────────────────────────────────────── *
 *                          Environment & Constants
 * ────────────────────────────────────────────────────────────────────────── */

const isProd =
  process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

const ACCESS_SECRET = process.env.JWT_SECRET || "dev_access";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh";

/**
 * Access token TTL:
 * - Uses JWT_EXPIRES_IN if provided (e.g., "15m", "3d").
 * - Defaults to 15 minutes which is a reasonable interactive session window.
 */
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || "15m";

/**
 * Cookie options for the refresh token.
 * - httpOnly:   not accessible via JS to mitigate XSS.
 * - sameSite:   "none" for cross-site on production; "lax" for local dev.
 * - secure:     cookie over HTTPS only in production.
 * - path:       root so it's sent on all requests.
 * - maxAge:     7 days; we rotate on each refresh.
 */
const rtCookie = {
  httpOnly: true,
  sameSite: "none",  // Always use "none" for cross-site requests
  secure: true,      // Always true for cross-site "none"
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/* ────────────────────────────────────────────────────────────────────────── *
 *                                Mailer
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * A simple transporter using Gmail. For production, prefer a dedicated provider
 * with domain auth (SPF/DKIM/DMARC) or an SMTP relay.
 */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Returns branding info for email templates.
 */
function brand() {
  const APP = process.env.APP_NAME || "DevDocs AI";
  const COMPANY = process.env.COMPANY_NAME || "DevDocs Inc.";
  const LOGO_URL =
    process.env.LOGO_URL || "https://dummyimage.com/128x128/111827/ffffff&text=Logo";
  return { APP, COMPANY, LOGO_URL };
}

/**
 * Composes a minimal password-reset HTML email.
 */
function resetEmailHTML(resetURL) {
  const { APP, COMPANY, LOGO_URL } = brand();
  const year = new Date().getFullYear();
  return `
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0b1220;padding:24px 0;color:#e5edff;font-family:Inter,Segoe UI,Roboto,Arial,sans-serif">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#0f172a;border:1px solid #1e293b;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)">
          <tr>
            <td style="padding:24px 24px 0" align="center">
              <img src="${LOGO_URL}" alt="${APP}" width="60" height="60" style="border-radius:12px;display:block"/>
              <div style="font-size:22px;font-weight:800;margin-top:8px">${APP}</div>
              <div style="color:#94a3b8;margin-top:6px">Reset your password</div>
            </td>
          </tr>
          <tr>
            <td style="padding:18px 24px 0;line-height:1.6;color:#cbd5e1">
              We received a request to reset your password. Click the button below to set a new one. This link is valid for <b>10 minutes</b>.
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px" align="center">
              <a href="${resetURL}" style="display:inline-block;padding:12px 20px;background:#3b82f6;border-radius:10px;color:#fff;text-decoration:none;font-weight:700">Reset Password</a>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 6px;color:#94a3b8;font-size:13px">
              Or copy and paste this URL into your browser:
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 22px">
              <code style="display:block;background:#0b1220;border:1px solid #1f2937;border-radius:8px;padding:10px;color:#cbd5e1;word-break:break-all">
                ${resetURL}
              </code>
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 28px;color:#94a3b8;font-size:13px">
              If you didn't request this, you can safely ignore this email.
            </td>
          </tr>
        </table>
        <div style="color:#64748b;font-size:12px;margin-top:14px">${COMPANY} • © ${year}</div>
      </td>
    </tr>
  </table>`;
}

/* ────────────────────────────────────────────────────────────────────────── *
 *                                   JWT
 * ────────────────────────────────────────────────────────────────────────── */

/** Signs a short-lived access token. */
const signAccess = (id) => jwt.sign({ id }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });

/** Signs a 7-day refresh token. */
const signRefresh = (id) => jwt.sign({ id }, REFRESH_SECRET, { expiresIn: "7d" });

/* ────────────────────────────────────────────────────────────────────────── *
 *                                  Helpers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Standard validation failure handler. Use express-validator in routes and let
 * the controller respond consistently.
 */
function ensureValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return false;
  }
  return true;
}

/** Create a minimal public user object for client consumption. */
function publicUser(u) {
  return { id: u._id, username: u.username, email: u.email };
}

/**
 * Password comparator that's resilient to model implementation differences.
 * - Primary: use the instance method if present.
 * - Fallback: compare with bcrypt if password is a string.
 */
async function passwordsMatch(userDoc, candidate) {
  if (userDoc && typeof userDoc.matchPassword === "function") {
    return userDoc.matchPassword(candidate);
  }
  if (typeof userDoc?.password === "string" && userDoc.password.length > 0) {
    return bcrypt.compare(candidate, userDoc.password);
  }
  // No way to compare: treat as a mismatch
  return false;
}

/**
 * Centralized controller error handler: logs once, returns generic message.
 */
function handleError(tag, err, res) {
  // Log full detail on server
  console.error(`[${tag}] error:`, err);
  // Avoid leaking details to clients
  res.status(500).json({ message: "Server error" });
}

/* ────────────────────────────────────────────────────────────────────────── *
 *                                Controllers
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 */
exports.registerUser = async (req, res) => {
  try {
    if (!ensureValid(req, res)) return;

    const { username, email, password } = req.body;

    // Basic defensive checks in case validators were not attached
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // Uniqueness
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "User already exists" });
    }

    // Create user (password hashing handled by model hook)
    const user = await User.create({ username, email, password });

    // Issue tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    // Persist refresh token for rotation/invalidation tracking
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    // Set cookie
    res.cookie("rt", refresh, rtCookie);

    // Respond
    return res.status(201).json({
      message: "Account created",
      token: access,
      user: publicUser(user),
    });
  } catch (err) {
    handleError("register", err, res);
  }
};

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
exports.loginUser = async (req, res) => {
  try {
    if (!ensureValid(req, res)) return;

    const { email, password } = req.body;

    // Fetch with password for comparison; schema likely has select: false
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Compare password (supports model method fallback)
    const ok = await passwordsMatch(user, password);
    if (!ok) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    // Rotate/issue tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    // Cookie for refresh
    res.cookie("rt", refresh, rtCookie);

    // Emit public profile
    return res.json({
      message: "Login successful",
      token: access,
      user: publicUser(user),
    });
  } catch (err) {
    handleError("login", err, res);
  }
};

/**
 * POST /api/auth/refresh
 * Silent refresh using the httpOnly cookie.
 */
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (!token) {
      return res.status(401).json({ message: "No refresh token" });
    }

    let payload;
    try {
      payload = jwt.verify(token, REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token) {
      // Concurrent logouts or token theft → reject
      return res.status(401).json({ message: "Refresh token mismatch" });
    }

    // Rotate refresh token and issue new access token
    const newRefresh = signRefresh(user._id);
    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    const access = signAccess(user._id);

    res.cookie("rt", newRefresh, rtCookie);
    return res.json({ token: access });
  } catch (err) {
    handleError("refresh", err, res);
  }
};

/**
 * POST /api/auth/logout
 * Clears refresh token server-side and cookie client-side.
 */
exports.logoutUser = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.id) {
        await User.findByIdAndUpdate(decoded.id, {
          $set: { refreshToken: null },
        });
      }
    }
    // Clear cookie regardless of DB result
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  } catch (_err) {
    // Always end the client session even if DB fails
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Sends a reset link valid for 10 minutes. In dev, if mail fails, returns the
 * reset URL for convenience.
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "No user with that email" });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    const clientURL = process.env.CLIENT_URL || "http://localhost:5173";
    const resetURL = `${clientURL}/reset-password/${resetToken}`;

    try {
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || "DevDocs AI"}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Reset your password",
        html: resetEmailHTML(resetURL),
      });
      return res.json({ message: "Reset link sent" });
    } catch (mailErr) {
      // In development it can be helpful to surface the link
      console.error("[forgot] email failed:", mailErr.message);
      return res.status(200).json({
        message: "Email send failed (dev). Use the link below.",
        devResetURL: resetURL,
      });
    }
  } catch (err) {
    handleError("forgot", err, res);
  }
};

/**
 * POST /api/auth/reset-password/:token
 * Body: { password }
 * Resets the password for a valid, non-expired token.
 */
exports.resetPassword = async (req, res) => {
