/***************************************************************************************************
 * Auth Controller - DevDocs AI
 * ================================================================================================
 * This file implements all authentication related endpoints:
 *    - Register
 *    - Login (with username OR email)
 *    - Refresh token
 *    - Logout
 *    - Forgot password (send reset link via email)
 *    - Reset password
 *    - GetMe (current logged-in user)
 *    - Health check
 *
 * The controller is designed for PRODUCTION:
 *    ✅ Uses JWT access + refresh tokens
 *    ✅ Stores refresh tokens in DB
 *    ✅ Sends reset password emails via Nodemailer
 *    ✅ Uses secure cookie settings
 *    ✅ Has extensive logging + inline documentation
 *    ✅ Provides email OR username login option
 *
 * Line count target: ~660+ lines (with full documentation + helpers)
 *
 **************************************************************************************************/

/* ================================================================================================
 *  Imports
 * ================================================================================================ */
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const User = require("../models/User");

/* ================================================================================================
 *  Environment Variables & Constants
 * ================================================================================================ */
const isProd =
  process.env.VERCEL_ENV === "production" ||
  process.env.NODE_ENV === "production";

const ACCESS_SECRET =
  process.env.JWT_SECRET || "dev_access_secret_key_change_in_production";

const REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  "dev_refresh_secret_key_change_in_production";

const ACCESS_TTL = process.env.JWT_EXPIRES_IN || "15m"; // default 15 minutes
const REFRESH_TTL = "7d"; // default 7 days

const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

/* ================================================================================================
 *  Refresh Token Cookie Config
 * ================================================================================================ */
const rtCookie = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

/* ================================================================================================
 *  Mailer Configuration (Nodemailer)
 * ================================================================================================ */
let transporter;
try {
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
    console.log("[MAILER] Transporter initialized successfully.");
  } else {
    console.warn(
      "[MAILER] EMAIL_USER or EMAIL_PASS not found. Forgot password emails will fail."
    );
  }
} catch (error) {
  console.error("[MAILER] Failed to initialize transporter:", error.message);
}

/* ================================================================================================
 *  Utility Functions
 * ================================================================================================ */

/**
 * Validates request body based on express-validator middleware.
 * If validation fails, responds with 422.
 */
function ensureValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("[VALIDATION] Errors:", errors.array());
    res.status(422).json({
      message: "Validation failed",
      errors: errors.array(),
    });
    return false;
  }
  return true;
}

/**
 * Returns public-safe user object (no password, no refresh token)
 */
function publicUser(u) {
  if (!u) return null;
  return {
    id: u._id,
    username: u.username,
    email: u.email,
    createdAt: u.createdAt,
  };
}

/**
 * Handles and logs errors consistently
 */
function handleError(tag, err, res) {
  console.error(`[${tag.toUpperCase()}] Error:`, err);

  const message = isProd ? "Server error" : err.message;

  if (!res.headersSent) {
    res.status(500).json({
      message,
      ...(isProd ? {} : { stack: err.stack }),
    });
  }
}

/**
 * Branding information for emails
 */
function brand() {
  const APP = process.env.APP_NAME || "DevDocs AI";
  const COMPANY = process.env.COMPANY_NAME || "DevDocs Inc.";
  const LOGO_URL =
    process.env.LOGO_URL ||
    "https://dummyimage.com/128x128/111827/ffffff&text=Logo";
  return { APP, COMPANY, LOGO_URL };
}

/**
 * Signs Access Token
 */
function signAccess(id) {
  if (!id) throw new Error("User ID is required for access token");
  return jwt.sign({ id }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

/**
 * Signs Refresh Token
 */
function signRefresh(id) {
  if (!id) throw new Error("User ID is required for refresh token");
  return jwt.sign({ id }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

/**
 * Email HTML Template for Password Reset
 */
// Place this in server/controllers/authController.js
// Replace your existing resetEmailHTML() with this LIGHT version.
function resetEmailHTML(resetURL) {
  const { APP, COMPANY, LOGO_URL } = brand();
  const year = new Date().getFullYear();

  return `
  <!doctype html>
  <html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${APP} • Reset Password</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:40px;background:#f9fafb;font-family:'Inter',sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr>
        <td align="center">
          <table width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;padding:32px;box-shadow:0 6px 24px rgba(0,0,0,0.06);">
            
            <!-- Logo + Header -->
            <tr>
              <td align="center" style="padding-bottom:20px;">
                <img src="${LOGO_URL}" alt="${APP}" width="60" height="60" style="border-radius:12px;display:block;margin:0 auto 10px;" />
                <h1 style="margin:0;font-size:24px;font-weight:700;color:#111827;">${APP}</h1>
                <p style="margin:6px 0 0;font-size:15px;color:#6b7280;">Reset your password</p>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="font-size:15px;line-height:1.6;color:#374151;">
                <p style="margin:0 0 16px;">Hello,</p>
                <p style="margin:0 0 20px;">We received a request to reset your password. Click the button below to create a new one. This link is valid for <b>10 minutes</b>.</p>
                
                <div style="text-align:center;margin:28px 0;">
                  <a href="${resetURL}"
                     style="background:linear-gradient(90deg,#3b82f6,#6366f1);color:#fff;text-decoration:none;font-weight:600;border-radius:10px;padding:14px 26px;display:inline-block;font-size:15px;box-shadow:0 4px 14px rgba(59,130,246,0.35);">
                    Reset Password
                  </a>
                </div>

                <p style="margin:0 0 10px;">If the button doesn’t work, copy and paste this URL into your browser:</p>
                <div style="background:#f3f4f6;border:1px solid #e5e7eb;border-radius:10px;padding:12px;word-break:break-all;font-size:13px;color:#1f2937;">
                  ${resetURL}
                </div>

                <p style="margin:20px 0 0;color:#6b7280;font-size:13px;">If you didn’t request this, you can safely ignore this email.</p>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td align="center" style="padding-top:28px;color:#9ca3af;font-size:12px;">
                © ${year} ${COMPANY}. All rights reserved.
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>`;
}




/***************************************************************************************************
 *  CONTROLLERS
 **************************************************************************************************/

/* ================================================================================================
 *  REGISTER
 * ================================================================================================ */
exports.registerUser = async (req, res) => {
  try {
    console.log("[REGISTER] Request received");

    if (!ensureValid(req, res)) return;

    const { username, email, password } = req.body;

    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    // Check for existing user
    const existingUser = await User.findOne({
      $or: [{ email: email.toLowerCase() }, { username }],
    });

    if (existingUser) {
      return res.status(409).json({
        message: "User with this email or username already exists",
      });
    }

    const user = await User.create({
      username: username.trim(),
      email: email.toLowerCase().trim(),
      password,
    });

    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", refresh, rtCookie);

    return res.status(201).json({
      success: true,
      message: "Account created successfully",
      token: access,
      user: publicUser(user),
    });
  } catch (err) {
    handleError("register", err, res);
  }
};

/* ================================================================================================
 *  LOGIN (Email or Username)
 * ================================================================================================ */
exports.loginUser = async (req, res) => {
  try {
    console.log("[LOGIN] Request received");

    if (!ensureValid(req, res)) return;

    const { identifier, password } = req.body;

    if (!identifier?.trim() || !password) {
      return res.status(400).json({
        message: "Email/Username and password are required",
      });
    }

    // Try finding user by email OR username
    const user = await User.findOne({
      $or: [
        { email: identifier.toLowerCase().trim() },
        { username: identifier.trim() },
      ],
    }).select("+password");

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    user.lastLogin = new Date();
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);

    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", refresh, rtCookie);

    return res.json({
      success: true,
      message: "Login successful",
      token: access,
      user: publicUser(user),
    });
  } catch (err) {
    handleError("login", err, res);
  }
};

/* ================================================================================================
 *  REFRESH TOKEN
 * ================================================================================================ */
exports.refreshToken = async (req, res) => {
  try {
    console.log("[REFRESH] Request received");

    const token = req.cookies?.rt;
    if (!token) {
      return res.status(401).json({ message: "No refresh token provided" });
    }

    let payload;
    try {
      payload = jwt.verify(token, REFRESH_SECRET);
    } catch (jwtError) {
      res.clearCookie("rt", rtCookie);
      return res
        .status(401)
        .json({ message: "Invalid or expired refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token) {
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const newAccess = signAccess(user._id);
    const newRefresh = signRefresh(user._id);

    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    res.cookie("rt", newRefresh, rtCookie);

    return res.json({
      success: true,
      token: newAccess,
      message: "Token refreshed successfully",
    });
  } catch (err) {
    handleError("refresh", err, res);
  }
};

/* ================================================================================================
 *  LOGOUT
 * ================================================================================================ */
exports.logoutUser = async (req, res) => {
  try {
    console.log("[LOGOUT] Request received");

    const token = req.cookies?.rt;
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.id) {
          await User.findByIdAndUpdate(decoded.id, {
            $unset: { refreshToken: 1, lastLogin: 1 },
          });
        }
      } catch {}
    }

    res.clearCookie("rt", rtCookie);
    res.cookie("rt", "", { ...rtCookie, expires: new Date(0), maxAge: 0 });

    return res.json({
      success: true,
      message: "Logout successful",
    });
  } catch (err) {
    handleError("logout", err, res);
  }
};

/* ================================================================================================
 *  FORGOT PASSWORD
 * ================================================================================================ */
exports.forgotPassword = async (req, res) => {
  try {
    console.log("[FORGOT] Request received");

    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.json({
        success: true,
        message:
          "If an account with that email exists, a reset link has been sent",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    const resetURL = `${
      process.env.CLIENT_URL || "http://localhost:5173"
    }/reset-password/${resetToken}`;

    if (transporter) {
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || "DevDocs AI"}" <${
          process.env.EMAIL_USER
        }>`,
        to: user.email,
        subject: "Reset your password",
        html: resetEmailHTML(resetURL),
      });

      return res.json({
        success: true,
        message: "Password reset link sent to your email",
      });
    } else {
      return res.status(500).json({
        message: "Email service not available",
      });
    }
  } catch (err) {
    handleError("forgot", err, res);
  }
};

/* ================================================================================================
 *  RESET PASSWORD
 * ================================================================================================ */
exports.resetPassword = async (req, res) => {
  try {
    console.log("[RESET] Request received");

    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        message: "Reset token and new password are required",
      });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters long" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        message: "Reset token is invalid or has expired",
      });
    }

    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    user.refreshToken = undefined;

    await user.save();

    return res.json({
      success: true,
      message: "Password reset successful",
    });
  } catch (err) {
    handleError("reset", err, res);
  }
};

/* ================================================================================================
 *  GET ME
 * ================================================================================================ */
exports.getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      user: publicUser(user),
    });
  } catch (err) {
    handleError("get_me", err, res);
  }
};

/* ================================================================================================
 *  HEALTH CHECK
 * ================================================================================================ */
exports.healthCheck = async (req, res) => {
  return res.json({
    success: true,
    message: "Auth service is running",
    timestamp: new Date().toISOString(),
    environment: isProd ? "production" : "development",
  });
};

/***************************************************************************************************
 * END OF FILE (~670 lines with comments)
 **************************************************************************************************/
