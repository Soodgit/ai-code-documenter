// server/routes/auth.js
const router = require("express").Router();
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");

// 15-min window: 10 auth attempts
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

// small validator helper
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res
      .status(422)
      .json({ errors: errors.array().map((e) => ({ field: e.path, msg: e.msg })) });
  }
  next();
}

/* --------------------------- ROUTES --------------------------- */

// Register
router.post(
  "/register",
  authLimiter,
  [
    body("username").trim().isLength({ min: 3 }).withMessage("Username required (min 3)"),
    body("email").isEmail().withMessage("Valid email required"),
    body("password").isLength({ min: 6 }).withMessage("Password min 6 chars"),
  ],
  validate,
  authController.registerUser
);

// Login (email OR username)
router.post(
  "/login",
  authLimiter,
  [
    body("identifier").trim().notEmpty().withMessage("Email or username is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
  validate,
  authController.loginUser
);

// Refresh access token
router.post("/refresh", authController.refreshToken);

// Logout
router.post("/logout", authController.logoutUser);

// Forgot password
router.post(
  "/forgot-password",
  authLimiter,
  [body("email").isEmail().withMessage("Valid email required")],
  validate,
  authController.forgotPassword
);

// Reset password
router.post(
  "/reset-password/:token",
  authLimiter,
  [body("password").isLength({ min: 6 }).withMessage("Password min 6 chars")],
  validate,
  authController.resetPassword
);

module.exports = router;
