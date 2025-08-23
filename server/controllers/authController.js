const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const { validationResult } = require("express-validator");
const User = require("../models/User");

// ---------- helpers ----------
const isProd =
  process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

const ACCESS_SECRET = process.env.JWT_SECRET || "dev_access";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh";

const signAccess = (id) =>
  jwt.sign({ id }, ACCESS_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || "15m" });

const signRefresh = (id) =>
  jwt.sign({ id }, REFRESH_SECRET, { expiresIn: "7d" });

/** Cross-site cookie options (works when FE and BE are on different domains) */
const rtCookie = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

// Reusable mailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Minimal but nice-looking HTML templates (use your own if you already added them)
function brand() {
  const APP = process.env.APP_NAME || "DevDocs AI";
  const COMPANY = process.env.COMPANY_NAME || "DevDocs Inc.";
  const LOGO_URL =
    process.env.LOGO_URL ||
    "https://dummyimage.com/128x128/111827/ffffff&text=Logo";
  return { APP, COMPANY, LOGO_URL };
}

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
              If you didn’t request this, you can safely ignore this email.
            </td>
          </tr>
        </table>
        <div style="color:#64748b;font-size:12px;margin-top:14px">${COMPANY} • © ${year}</div>
      </td>
    </tr>
  </table>`;
}

// ---------- controllers ----------

/** POST /api/auth/register */
exports.registerUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

    const { username, email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: "User already exists" });

    const user = await User.create({ username, email, password });

    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    // Persist refresh token for rotation/invalidation
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", refresh, rtCookie);

    return res.status(201).json({
      message: "Account created",
      token: access,
      user: { id: user._id, username: user.username, email: user.email },
    });
  } catch (e) {
    console.error("[register] error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/** POST /api/auth/login */
exports.loginUser = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ errors: errors.array() });

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
    console.error("[login] error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/** POST /api/auth/refresh (silent) */
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (!token) return res.status(401).json({ message: "No refresh token" });

    let payload;
    try {
      payload = jwt.verify(token, REFRESH_SECRET);
    } catch {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token)
      return res.status(401).json({ message: "Refresh token mismatch" });

    // rotate
    const newRefresh = signRefresh(user._id);
    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    const access = signAccess(user._id);

    res.cookie("rt", newRefresh, rtCookie);
    return res.json({ token: access });
  } catch (e) {
    console.error("[refresh] error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/** POST /api/auth/logout */
exports.logoutUser = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.id) {
        await User.findByIdAndUpdate(decoded.id, { $set: { refreshToken: null } });
      }
    }
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  } catch (e) {
    res.clearCookie("rt", { ...rtCookie, maxAge: 0 });
    res.json({ ok: true });
  }
};

/** POST /api/auth/forgot */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "No user with that email" });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 min
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
      res.json({ message: "Reset link sent" });
    } catch (mailErr) {
      console.error("[forgot] email failed:", mailErr.message);
      // Still respond success in dev, include URL to test
      res.status(200).json({
        message: "Email send failed (dev). Use the link below.",
        devResetURL: resetURL,
      });
    }
  } catch (e) {
    console.error("[forgot] error:", e);
    res.status(500).json({ message: "Server error" });
  }
};

/** POST /api/auth/reset/:token */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!password) return res.status(400).json({ message: "Password is required" });

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    }).select("+password");

    if (!user) return res.status(400).json({ message: "Invalid or expired token" });

    user.password = password; // model hook hashes it
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({ message: "Password reset successful" });
  } catch (e) {
    console.error("[reset] error:", e);
    res.status(500).json({ message: "Server error" });
  }
};
