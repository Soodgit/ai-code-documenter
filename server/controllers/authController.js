const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const bcrypt = require("bcryptjs");
const { validationResult } = require("express-validator");
const User = require("../models/User");

// Environment variables & constants
const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
const ACCESS_SECRET = process.env.JWT_SECRET || "dev_access_secret_key_change_in_production";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev_refresh_secret_key_change_in_production";
const ACCESS_TTL = process.env.JWT_EXPIRES_IN || "15m";
const REFRESH_TTL = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// Cookie settings for refresh token
const rtCookie = {
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
  path: "/",
  maxAge: COOKIE_MAX_AGE,
};

// Mailer configuration - with better error handling
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
  }
} catch (error) {
  console.error("[MAILER] Failed to initialize transporter:", error.message);
}

// Helper Functions
function ensureValid(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.log("[VALIDATION] Errors:", errors.array());
    res.status(422).json({ 
      message: "Validation failed",
      errors: errors.array() 
    });
    return false;
  }
  return true;
}

function publicUser(u) {
  if (!u) return null;
  return { 
    id: u._id, 
    username: u.username, 
    email: u.email,
    createdAt: u.createdAt
  };
}

function handleError(tag, err, res) {
  console.error(`[${tag.toUpperCase()}] Error:`, err);
  
  // Don't expose internal errors in production
  const message = isProd ? "Server error" : err.message;
  
  if (!res.headersSent) {
    res.status(500).json({ 
      message,
      ...(isProd ? {} : { stack: err.stack })
    });
  }
}

function brand() {
  const APP = process.env.APP_NAME || "DevDocs AI";
  const COMPANY = process.env.COMPANY_NAME || "DevDocs Inc.";
  const LOGO_URL = process.env.LOGO_URL || "https://dummyimage.com/128x128/111827/ffffff&text=Logo";
  return { APP, COMPANY, LOGO_URL };
}

function signAccess(id) {
  if (!id) throw new Error("User ID is required for access token");
  return jwt.sign({ id }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

function signRefresh(id) {
  if (!id) throw new Error("User ID is required for refresh token");
  return jwt.sign({ id }, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
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
                If you didn't request this, you can safely ignore this email.
              </td>
            </tr>
          </table>
          <div style="color:#64748b;font-size:12px;margin-top:14px">${COMPANY} • © ${year}</div>
        </td>
      </tr>
    </table>`;
}

/* ────────────────────────────────────────────────────────────────────────── */
/*                                Controllers                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * POST /api/auth/register
 * Body: { username, email, password }
 */
exports.registerUser = async (req, res) => {
  try {
    console.log("[REGISTER] Request received:", { 
      body: { ...req.body, password: "[REDACTED]" },
      headers: req.headers 
    });

    if (!ensureValid(req, res)) return;

    const { username, email, password } = req.body;

    // Enhanced input validation
    if (!username?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ 
        message: "All fields are required",
        required: ["username", "email", "password"]
      });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    // Password strength validation
    if (password.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters long" 
      });
    }

    console.log(`[REGISTER] Checking if user exists with email: ${email}`);
    
    // Check for existing user
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username }] 
    });
    
    if (existingUser) {
      const field = existingUser.email === email ? "email" : "username";
      console.log(`[REGISTER] User already exists with ${field}: ${existingUser[field]}`);
      return res.status(409).json({ 
        message: `User with this ${field} already exists` 
      });
    }

    console.log(`[REGISTER] Creating new user with email: ${email}`);
    
    // Create user (password will be hashed by pre-save hook)
    const user = await User.create({ 
      username: username.trim(), 
      email: email.toLowerCase().trim(), 
      password 
    });

    console.log(`[REGISTER] User created successfully: ${user._id}`);

    // Issue JWT tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);
    
    // Save refresh token
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    // Set the refresh token cookie
    res.cookie("rt", refresh, rtCookie);

    // Respond with success
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

/**
 * POST /api/auth/login
 * Body: { email, password }
 */
exports.loginUser = async (req, res) => {
  try {
    console.log("[LOGIN] Request received:", { 
      body: { ...req.body, password: "[REDACTED]" },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    if (!ensureValid(req, res)) return;

    const { email, password } = req.body;

    // Input validation
    if (!email?.trim() || !password) {
      return res.status(400).json({ 
        message: "Email and password are required" 
      });
    }

    console.log(`[LOGIN] Attempting login for email: ${email}`);

    // Find user with email and include password field
    const user = await User.findOne({ 
      email: email.toLowerCase().trim() 
    }).select("+password");

    if (!user) {
      console.log(`[LOGIN] No user found with email: ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log(`[LOGIN] User found: ${user._id}, verifying password`);

    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    
    if (!isMatch) {
      console.log(`[LOGIN] Password verification failed for user: ${user._id}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    console.log(`[LOGIN] Password verified for user: ${user._id}`);

    // Update last login
    user.lastLogin = new Date();
    
    // Issue new tokens
    const access = signAccess(user._id);
    const refresh = signRefresh(user._id);
    
    user.refreshToken = refresh;
    await user.save({ validateBeforeSave: false });

    // Set refresh token cookie
    res.cookie("rt", refresh, rtCookie);

    console.log(`[LOGIN] Login successful for user: ${user._id}`);

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

/**
 * POST /api/auth/refresh
 * Refreshes the access token using the refresh token in the cookie
 */
exports.refreshToken = async (req, res) => {
  try {
    console.log("[REFRESH] Request received");
    
    const token = req.cookies?.rt;
    if (!token) {
      console.log("[REFRESH] No refresh token found in cookies");
      return res.status(401).json({ message: "No refresh token provided" });
    }

    console.log("[REFRESH] Verifying refresh token");
    
    let payload;
    try {
      payload = jwt.verify(token, REFRESH_SECRET);
    } catch (jwtError) {
      console.log(`[REFRESH] Token verification failed: ${jwtError.message}`);
      
      // Clear invalid cookie
      res.clearCookie("rt", { 
        path: "/", 
        httpOnly: true, 
        sameSite: isProd ? "none" : "lax", 
        secure: isProd 
      });
      
      return res.status(401).json({ message: "Invalid or expired refresh token" });
    }

    // Find user and verify token matches
    const user = await User.findById(payload.id);
    if (!user) {
      console.log(`[REFRESH] User not found: ${payload.id}`);
      return res.status(401).json({ message: "User not found" });
    }

    if (user.refreshToken !== token) {
      console.log(`[REFRESH] Token mismatch for user: ${user._id}`);
      return res.status(401).json({ message: "Token mismatch" });
    }

    console.log(`[REFRESH] Issuing new tokens for user: ${user._id}`);

    // Issue new tokens
    const newAccess = signAccess(user._id);
    const newRefresh = signRefresh(user._id);
    
    // Update user's refresh token
    user.refreshToken = newRefresh;
    await user.save({ validateBeforeSave: false });

    // Set new refresh token cookie
    res.cookie("rt", newRefresh, rtCookie);

    return res.json({
      success: true,
      token: newAccess,
      message: "Token refreshed successfully"
    });

  } catch (err) {
    handleError("refresh", err, res);
  }
};

/**
 * POST /api/auth/logout
 * Logs out the user by clearing tokens and cookies
 */
exports.logoutUser = async (req, res) => {
  try {
    console.log("[LOGOUT] Request received", {
      origin: req.headers.origin,
      userAgent: req.get('User-Agent')
    });

    const token = req.cookies?.rt;
    
    if (token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded?.id) {
          console.log(`[LOGOUT] Clearing refresh token for user: ${decoded.id}`);
          await User.findByIdAndUpdate(
            decoded.id, 
            { $unset: { refreshToken: 1, lastLogin: 1 } },
            { new: false }
          );
        }
      } catch (decodeError) {
        console.log(`[LOGOUT] Error decoding token: ${decodeError.message}`);
      }
    }

    // Set CORS headers
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    // Clear cookie multiple ways to ensure it's removed
    const clearCookieOptions = {
      path: "/",
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd
    };

    res.clearCookie("rt", clearCookieOptions);
    
    // Also set an expired cookie as fallback
    res.cookie("rt", "", {
      ...clearCookieOptions,
      expires: new Date(0),
      maxAge: 0
    });

    // Prevent caching
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    console.log("[LOGOUT] Logout successful");

    return res.json({
      success: true,
      message: "Logout successful"
    });

  } catch (err) {
    console.error(`[LOGOUT] Error during logout: ${err.message}`);
    
    // Still try to clear the cookie even on error
    res.clearCookie("rt", {
      path: "/",
      httpOnly: true,
      sameSite: isProd ? "none" : "lax",
      secure: isProd
    });

    return res.status(200).json({
      success: true,
      message: "Logout completed with errors",
      error: isProd ? undefined : err.message
    });
  }
};

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Sends password reset email
 */
exports.forgotPassword = async (req, res) => {
  try {
    console.log("[FORGOT] Request received");
    
    const { email } = req.body;

    if (!email?.trim()) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: "Invalid email format" });
    }

    console.log(`[FORGOT] Processing password reset for email: ${email}`);

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user) {
      console.log(`[FORGOT] No user found with email: ${email}`);
      // Return success anyway to prevent email enumeration
      return res.json({ 
        success: true,
        message: "If an account with that email exists, a reset link has been sent" 
      });
    }

    // Check if there's a recent reset request (rate limiting)
    if (user.resetPasswordExpires && user.resetPasswordExpires > Date.now()) {
      const timeLeft = Math.ceil((user.resetPasswordExpires - Date.now()) / 60000);
      return res.status(429).json({ 
        message: `Please wait ${timeLeft} minutes before requesting another reset` 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");
    
    // Save token and expiry (10 minutes)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // Create reset URL with plain token (not hashed)
    const resetURL = `${process.env.CLIENT_URL || "http://localhost:5173"}/reset-password/${resetToken}`;

    console.log(`[FORGOT] Reset URL generated for user: ${user._id}`);

    // Send email if transporter is available
    if (transporter) {
      try {
        await transporter.sendMail({
          from: `"${process.env.APP_NAME || "DevDocs AI"}" <${process.env.EMAIL_USER}>`,
          to: user.email,
          subject: "Reset your password",
          html: resetEmailHTML(resetURL),
        });

        console.log(`[FORGOT] Reset email sent to: ${email}`);
        
        return res.json({
          success: true,
          message: "Password reset link sent to your email"
        });

      } catch (emailError) {
        console.error(`[FORGOT] Email sending failed:`, emailError);
        
        // Clear the reset token since email failed
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save({ validateBeforeSave: false });

        return res.status(500).json({ 
          message: "Failed to send reset email. Please try again." 
        });
      }
    } else {
      console.error("[FORGOT] Email transporter not configured");
      
      // Clear the reset token
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({ 
        message: "Email service not available. Please try again later." 
      });
    }

  } catch (err) {
    handleError("forgot", err, res);
  }
};

/**
 * POST /api/auth/reset-password/:token
 * Body: { password }
 * Resets user password using the token
 */
exports.resetPassword = async (req, res) => {
  try {
    console.log("[RESET] Request received");
    
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ 
        message: "Reset token and new password are required" 
      });
    }

    // Password validation
    if (password.length < 6) {
      return res.status(400).json({ 
        message: "Password must be at least 6 characters long" 
      });
    }

    console.log(`[RESET] Processing reset for token: ${token.substring(0, 10)}...`);

    // Hash the token to compare with stored hash
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      console.log("[RESET] Invalid or expired token");
      return res.status(400).json({ 
        message: "Reset token is invalid or has expired" 
      });
    }

    console.log(`[RESET] Valid token found for user: ${user._id}`);

    // Update password and clear reset fields
    user.password = password;  // Will be hashed by pre-save hook
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    
    // Also clear any existing refresh tokens for security
    user.refreshToken = undefined;
    
    await user.save();

    console.log(`[RESET] Password reset successful for user: ${user._id}`);

    return res.json({
      success: true,
      message: "Password reset successful. You can now login with your new password."
    });

  } catch (err) {
    handleError("reset", err, res);
  }
};

/**
 * GET /api/auth/me
 * Returns current user information
 */
exports.getMe = async (req, res) => {
  try {
    console.log(`[GET_ME] Request for user: ${req.user?.id}`);
    
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    const user = await User.findById(req.user.id);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json({
      success: true,
      user: publicUser(user)
    });

  } catch (err) {
    handleError("get_me", err, res);
  }
};

/**
 * Health check endpoint
 */
exports.healthCheck = async (req, res) => {
  return res.json({
    success: true,
    message: "Auth service is running",
    timestamp: new Date().toISOString(),
    environment: isProd ? "production" : "development"
  });
};