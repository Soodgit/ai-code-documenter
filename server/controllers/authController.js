// server/controllers/authController.js
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { validationResult } = require("express-validator");

// 👉 nice branded emails
const {
  resetPasswordEmail,
  passwordChangedEmail,
} = require("../utils/emailTemplates");

// ---------------- Env helpers ----------------
const isProd = process.env.NODE_ENV === "production";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";
const APP_NAME = process.env.APP_NAME || "DevDocs AI";
const COMPANY_NAME = process.env.COMPANY_NAME || "DevDocs Inc.";
const SUPPORT_URL =
  process.env.SUPPORT_URL || `${CLIENT_URL.replace(/\/$/, "")}/support`;
const LOGO_URL = process.env.LOGO_URL || `${CLIENT_URL.replace(/\/$/, "")}/logo.png`;

// ---------------- JWT helpers ----------------
const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || "dev_access", { expiresIn: "15m" });

const signRefresh = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET || "dev_refresh", {
    expiresIn: "7d",
  });

// ---------------- Cookie options (auto‑secure in prod) ----------------
const rtCookie = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax", // "none" for cross‑site HTTPS
  secure: isProd,                    // true on HTTPS
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// ---------------- Mailer ----------------
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

// ---------------- Utilities ----------------
function send422IfInvalid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({
      errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })),
    });
    return true;
  }
  return false;
}

function jsonServerError(res, label, err) {
  console.error(`${label}:`, err);
  return res.status(500).json({ message: "Server error" });
}

/* =======================
   REGISTER
======================= */
const registerUser = async (req, res) => {
  try {
    if (send422IfInvalid(req, res)) return;

    const { username, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "User already exists" });

    const user = await User.create({ username, email, password });

    // issue tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    // rotate/store refresh on user record
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", refresh, rtCookie);
    return res.status(201).json({
      message: "Account created",
      token: access,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    return jsonServerError(res, "Register error", e);
  }
};

/* =======================
   LOGIN
======================= */
const loginUser = async (req, res) => {
  try {
    if (send422IfInvalid(req, res)) return;

    const { email, password } = req.body;

    const user = await User.findOne({ email }).select("+password");
    if (!user || !(await user.matchPassword(password)))
      return res.status(400).json({ message: "Invalid credentials" });

    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", refresh, rtCookie);
    return res.json({
      message: "Login successful",
      token: access,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    return jsonServerError(res, "Login error", e);
  }
};

/* =======================
   REFRESH (silent)
======================= */
const refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_REFRESH_SECRET || "dev_refresh");
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token)
      return res.status(401).json({ message: "Refresh token mismatch" });

    // rotate refresh
    const newRefresh = signRefresh(user._id);
    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    const access = signAccess(user._id);
    res.cookie("rt", newRefresh, rtCookie);
    return res.json({ token: access });
  } catch (e) {
    return jsonServerError(res, "Refresh error", e);
  }
};

/* =======================
   LOGOUT
======================= */
const logoutUser = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (token) {
      const payload = jwt.decode(token);
      if (payload?.id) {
        await User.findByIdAndUpdate(payload.id, { $set: { refreshToken: null } });
      }
    }
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  } catch (e) {
    // even if revoke fails, clear cookie
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  }
};

/* =======================
   FORGOT PASSWORD (HTML email)
======================= */
const forgotPassword = async (req, res) => {
  try {
    if (send422IfInvalid(req, res)) return;

    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No user with that email" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 min
    await user.save({ validateBeforeSave: false });

    const resetURL = `${CLIENT_URL.replace(/\/$/, "")}/reset-password/${resetToken}`;

    // Pretty email (HTML + TXT)
    const emailPkg = resetPasswordEmail({
      appName: APP_NAME,
      company: COMPANY_NAME,
      logoUrl: LOGO_URL,
      resetUrl: resetURL,
      supportUrl: SUPPORT_URL,
      username: user.username,
      expiryMinutes: 10,
    });

    try {
      await transporter.sendMail({
        from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: emailPkg.subject,
        html: emailPkg.html,
        text: emailPkg.text,
      });

      return res.json({ message: "Reset link sent" });
    } catch (mailErr) {
      console.error("Email send failed:", mailErr.message);
      // Dev fallback: share link to enable local testing
      return res.status(200).json({
        message: "Email send failed (dev). Use the reset link below.",
        devResetURL: resetURL,
      });
    }
  } catch (e) {
    return jsonServerError(res, "Forgot error", e);
  }
};

/* =======================
   RESET PASSWORD (+ confirmation email)
======================= */
const resetPassword = async (req, res) => {
  try {
    if (send422IfInvalid(req, res)) return;

    const { token } = req.params; // :token
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password is required" });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    // pre-save hook will hash
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    // also revoke current refresh token(s) for safety
    user.refreshToken = null;

    await user.save();

    // optional: send "password changed" confirmation email
    try {
      const confirmPkg = passwordChangedEmail({
        appName: APP_NAME,
        company: COMPANY_NAME,
        logoUrl: LOGO_URL,
        supportUrl: SUPPORT_URL,
        username: user.username,
      });
      await transporter.sendMail({
        from: `"${APP_NAME}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: confirmPkg.subject,
        html: confirmPkg.html,
        text: confirmPkg.text,
      });
    } catch (mailErr) {
      console.warn("Password changed email failed:", mailErr.message);
    }

    return res.json({ message: "Password reset successful" });
  } catch (e) {
    return jsonServerError(res, "Reset error", e);
  }
};

module.exports = {
  registerUser,
  loginUser,
  refreshToken,
  logoutUser,
  forgotPassword,
  resetPassword,
};
