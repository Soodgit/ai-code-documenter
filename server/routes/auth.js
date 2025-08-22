// server/routes/auth.js
const router = require("express").Router();
const { body, validationResult } = require("express-validator");
const rateLimit = require("express-rate-limit");
const authController = require("../controllers/authController");

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10 });

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(422).json({ errors: errors.array().map(e => ({ field: e.path, msg: e.msg })) });
  next();
};

router.post(
  "/register",
  authLimiter,
  [body("username").notEmpty(), body("email").isEmail(), body("password").isLength({ min: 6 })],
  validate,
  authController.registerUser
);

router.post(
  "/login",
  authLimiter,
  [body("email").isEmail(), body("password").notEmpty()],
  validate,
  authController.loginUser
);

// NEW
router.post("/refresh", authController.refreshToken);
router.post("/logout", authController.logoutUser);

// Forgot / Reset (unchanged)
router.post("/forgot-password", authLimiter, body("email").isEmail(), validate, authController.forgotPassword);
router.post("/reset-password/:token", authLimiter, body("password").isLength({ min: 6 }), validate, authController.resetPassword);

module.exports = router;
