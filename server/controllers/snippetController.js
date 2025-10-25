// controllers/snippetController.js
const Snippet = require("../models/Snippet");

// ---------------- Gemini (lazy ESM import, only if a key exists) ----------------
let geminiClient = null;

async function ensureGemini() {
  if (!process.env.GOOGLE_API_KEY) return null;
  if (!geminiClient) {
    const { GoogleGenerativeAI } = await import("@google/generative-ai");
    geminiClient = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
  }
  return geminiClient;
}

// Normalize language labels for prompt clarity
function normalizeLanguage(lang = "") {
  const l = String(lang).toLowerCase();
  const map = {
    ts: "TypeScript",
    typescript: "TypeScript",
    js: "JavaScript",
    javascript: "JavaScript",
    "c++": "C++",
    cpp: "C++",
    py: "Python",
    python: "Python",
    java: "Java",
    plaintext: "Plain text",
    text: "Plain text",
  };
  return map[l] || lang;
}

// Prompt builder
function buildPrompt(language, code) {
  const lang = normalizeLanguage(language);
  return `
You are an expert software developer who writes clear, concise, high‑quality technical documentation.

Return **GitHub‑flavored Markdown** only (no surrounding prose). Structure it as:

## Summary
A single, crisp sentence about what the code does.

## Parameters
- If the code defines a function/method with parameters, include a **table**:
| Parameter | Type | Description |
|---|---|---|
| ... | ... | ... |
- If there are no parameters, write “None”.

## Return Value
Describe the return type/value. If nothing is returned, say “None”.

## Example Usage
- Provide a short, copy‑pasteable usage example in \`\`\`${lang}\`\`\` fenced code.

Code to document (\`${lang}\`):
\`\`\`${lang}
${code}
\`\`\`
`.trim();
}

// Local/offline fallback — never throws
function localFallback(language, code) {
  const lang = normalizeLanguage(language);
  return `# ${lang} snippet

## Summary
Brief, auto‑generated fallback description.

## Parameters
None.

## Return Value
Depends on implementation.

## Example Usage
\`\`\`${lang}
${code}
\`\`\`
`;
}

// Generate with Gemini (with timeout + graceful fallback)
async function generateWithGemini(language, code) {
  const client = await ensureGemini();
  if (!client) return localFallback(language, code); // no key configured

  const modelName = process.env.GEMINI_MODEL || "gemini-pro";
  const model = client.getGenerativeModel({ model: modelName });
  const prompt = buildPrompt(language, code);

  const ac = new AbortController();
  const timeoutMs = Number(process.env.GEMINI_TIMEOUT_MS || 15000);
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const result = await model.generateContent(
      { contents: [{ role: "user", parts: [{ text: prompt }] }] },
      { signal: ac.signal }
    );

    // SDK shape: result.response.text()
    const text =
      (result?.response && typeof result.response.text === "function"
        ? result.response.text()
        : "") || "";

    return text.trim() || localFallback(language, code);
  } catch (err) {
    console.warn("[snippets] Gemini error — using fallback:", err?.message || err);
    return localFallback(language, code);
  } finally {
    clearTimeout(t);
  }
}

// ---------------- Route handlers ----------------

// POST /api/snippets
exports.createSnippet = async (req, res) => {
  try {
    const { language, code, title } = req.body || {};
    if (!req.userId) return res.status(401).json({ message: "Unauthorized" });
    if (!language || !code) {
      return res.status(400).json({ message: "language and code are required" });
    }

    let documentation;
    try {
      documentation = await generateWithGemini(language, code);
    } catch (e) {
      console.warn("[createSnippet] generation error, fallback:", e?.message || e);
      documentation = localFallback(language, code);
    }

    const doc = await Snippet.create({
      user: req.userId,
      language,
      code,
      title: title || "", // optional title support
      documentation,
    });

    return res.status(201).json(doc);
  } catch (e) {
    console.error("[createSnippet] error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// GET /api/snippets
exports.getSnippets = async (req, res) => {
  try {
    const list = await Snippet.find({ user: req.userId }).sort({ createdAt: -1 });
    return res.json(list);
  } catch (e) {
    console.error("[getSnippets] error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// DELETE /api/snippets/:id
exports.deleteSnippet = async (req, res) => {
  try {
    const { id } = req.params;
    const found = await Snippet.findOne({ _id: id, user: req.userId });
    if (!found) return res.status(404).json({ message: "Not found" });
    await found.deleteOne();
    return res.json({ ok: true });
  } catch (e) {
    console.error("[deleteSnippet] error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};

// PATCH /api/snippets/:id   (optional: rename/update title)
exports.updateSnippet = async (req, res) => {
  try {
    const { id } = req.params;
    const { title } = req.body || {};
    if (typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ message: "Valid title is required" });
    }

    const updated = await Snippet.findOneAndUpdate(
      { _id: id, user: req.userId },
      { $set: { title: title.trim() } },
      { new: true, projection: { _id: 1, title: 1 } }
    );

    if (!updated) return res.status(404).json({ message: "Not found" });
    return res.json(updated);
  } catch (e) {
    console.error("[updateSnippet] error:", e);
    return res.status(500).json({ message: "Server error" });
  }
};
