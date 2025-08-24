const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const User = require("../models/User");
// Environment variables & constants
const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
const ACCESS_SECRET = process.env.JWT_SECRET || "dev_access";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh";
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || "15m";  // Access token TTL (Time-to-Live)
const REFRESH_TTL = "7d";  // Refresh token TTL (7 days)
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;  // 7 days in milliseconds
// Cookie settings for refresh token
const rtCookie = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};
// Mailer configuration
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});
// Helper Functions
function ensureValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(422).json({ errors: errors.array() });
    return false;
  }
  return true;
}
function publicUser(u) {
  return { id: u._id, username: u.username, email: u.email };
}
function handleError(tag, err, res) {
  console.error(`[${tag}] error:`, err);
  res.status(500).json({ message: "Server error" });
}
function brand() {
  const APP = process.env.APP_NAME || "DevDocs AI";
  const COMPANY = process.env.COMPANY_NAME || "DevDocs Inc.";
  const LOGO_URL = process.env.LOGO_URL || "https://dummyimage.com/128x128/111827/ffffff&text=Logo";
  return { APP, COMPANY, LOGO_URL };
}

/**
 * POST /api/auth/reset-password/:token
 * Body: { password }
 * Resets the user's password using the token.
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ message: "Token and password are required" });
    }
    // Find user with valid token and expiry
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) {
      return res.status(400).json({ message: "Token is invalid or has expired" });
    }
    // Set new password and clear reset fields
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    return res.json({ message: "Password reset successful" });
  } catch (err) {
    handleError("reset", err, res);
  }
};
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

function signAccess(id) {
  return jwt.sign({ id }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(id) {
  return jwt.sign({ id }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
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
    // Input validation
    if (!username || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }
    // Check for existing user
    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "User already exists" });
    }
    
    console.log(`[register] Creating new user with email: ${email}`);
    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({ username, email, password });

    // Issue JWT tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);
    // Save refresh token and update user record
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });
    
    console.log(`[register] User created successfully: ${user._id}`);
    // Set the refresh token cookie
    res.cookie("rt", refresh, rtCookie);
    // Respond with success message and tokens
    return res.status(201).json({
      message: "Account created successfully",
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

    console.log(`[login] Attempting login for email: ${email}`);
    
    // Find user with email and include password field for comparison
    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      console.log(`[login] No user found with email: ${email}`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log(`[login] User found: ${user._id}, comparing password`);
    
    // Use bcrypt directly for password comparison
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log(`[login] Password mismatch for user: ${user._id}`);
      return res.status(400).json({ message: "Invalid credentials" });
    }

    console.log(`[login] Password matched for user: ${user._id}`);
    // Issue tokens and save refresh token
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    // Set the refresh token cookie
    res.cookie("rt", refresh, rtCookie);

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
 * Refreshes the access token using the refresh token in the cookie.
 */
exports.refreshToken = async (req, res) => {
  try {
    const token = req.cookies?.rt;
    if (!token) {
      return res.status(401).json({ message: "No refresh token" });
    }

    console.log(`[refresh] Verifying refresh token`);
    let payload;
    try {
      payload = jwt.verify(token, REFRESH_SECRET);
    } catch (error) {
      console.log(`[refresh] Invalid token: ${error.message}`);
      return res.status(401).json({ message: "Invalid refresh token" });
    }

    const user = await User.findById(payload.id);
    if (!user || user.refreshToken !== token) {
      console.log(`[refresh] Token mismatch or user not found: ${payload.id}`);
      return res.status(401).json({ message: "Refresh token mismatch" });
    }

    console.log(`[refresh] Issuing new tokens for user: ${user._id}`);
    // Issue new refresh and access tokens
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
 * Logs out the user by clearing the refresh token cookie.
 */
exports.logoutUser = async (req, res) => {
  try {
    // Log request headers for debugging
    console.log(`[logout] Request received from origin: ${req.headers.origin}`);
    console.log(`[logout] Request headers: ${JSON.stringify(req.headers)}`);
    const token = req.cookies?.rt;
    console.log(`[logout] Cookie present: ${!!token}`);
    if (token) {
      const decoded = jwt.decode(token);
      if (decoded?.id) {
        console.log(`[logout] Clearing refresh token for user: ${decoded.id}`);
        await User.findByIdAndUpdate(decoded.id, { $set: { refreshToken: null } });
      }
    }
    
    // Explicitly set headers to avoid CORS issues
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    }
    console.log(`[logout] Clearing cookie with SameSite=${isProd ? "none" : "lax"}, Secure=${isProd}`);
    
    // Method 1: Try the direct way first
    res.clearCookie("rt", { 
      path: "/",
      httpOnly: true, 
      sameSite: isProd ? "none" : "lax", 
      secure: isProd 
    });
    
    // Method 2: Also try with expired date as fallback
    res.cookie("rt", "", {
      path: "/",
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      expires: new Date(0)
    });
    
    console.log('[logout] Sending success response');
    
    // Set cache headers to prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Return success even if there's no token
    return res.status(200).json({ 
      ok: true,
      message: "Logout successful",
      timestamp: Date.now()
    });
  } catch (err) {
    console.log(`[logout] Error during logout: ${err.message}`);
    
    // Still try to clear the cookie even if there was an error
    res.clearCookie("rt", { 
      path: "/",
      httpOnly: true, 
      sameSite: isProd ? "none" : "lax", 
      secure: isProd 
    });
    
    // Also try with expired date
    res.cookie("rt", "", {
      path: "/",
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd,
      expires: new Date(0)
    });
    
    return res.status(200).json({ 
      ok: true,
      message: "Logged out despite errors",
      error: err.message,
      timestamp: Date.now()
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Sends password reset link to user's email.
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    console.log(`[forgot] Processing password reset for email: ${email}`);
    const user = await User.findOne({ email });
    if (!user) {
      console.log(`[forgot] No user found with email: ${email}`);
      return res.status(404).json({ message: "No user with that email" });
    }
    
    const resetToken = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save({ validateBeforeSave: false });

    const resetURL = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    console.log(`[forgot] Reset URL generated: ${resetURL}`);
    // Send email with the reset link
    try {
      await transporter.sendMail({
        from: `"${process.env.APP_NAME || "DevDocs AI"}" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: "Reset your password",
        html: resetEmailHTML(resetURL),
      });
    
      console.log(`[forgot] Reset email sent to: ${email}`);
      return res.json({ message: "Reset link sent" });
    } catch (emailError) {
      console.error(`[forgot] Email error:`, emailError);
      
      // Revert the changes if email sending fails
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
    
      return res.status(500).json({ message: "Error sending email" });
    }
  } catch (err) {
    handleError("forgot", err, res);
  }
};

