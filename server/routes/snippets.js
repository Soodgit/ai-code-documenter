// server/routes/snippets.js
const router = require("express").Router();

// ✅ correct imports
const auth = require("../middleware/auth"); // <- aapke project me jaha bhi auth hai
const snippetController = require("../controllers/snippetController");

// CRUD routes
router.post("/", auth, snippetController.createSnippet);
router.get("/", auth, snippetController.getSnippets);
router.delete("/:id", auth, snippetController.deleteSnippet);

// ✅ rename / update title support (optional, but we added it in controller)
router.patch("/:id", auth, snippetController.updateSnippet);

module.exports = router;
