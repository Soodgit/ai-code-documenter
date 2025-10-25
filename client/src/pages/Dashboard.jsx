// src/pages/Dashboard.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  createSnippet,
  fetchSnippets,
  deleteSnippet,
  updateSnippetTitle,
} from "../api/snippets";
import { doLogout } from "../utils/auth";

/* ──────────────────────────────────────────────────────────────
   Language presets & constants
────────────────────────────────────────────────────────────── */
const LANGS = ["auto", "typescript", "javascript", "python", "java", "c++", "plaintext"];

const STARTER = {
  typescript: `export function formatTimestamp(ts: number) {
  const d = new Date(ts);
  return d.toISOString();
}
`,
  javascript: `export function formatTimestamp(ts) {
  const d = new Date(ts);
  return d.toISOString();
}
`,
  python: `from datetime import datetime

def format_timestamp(ts: int) -> str:
    return datetime.fromtimestamp(ts/1000).isoformat()
`,
  java: `public class TimeUtil {
  public static String formatTimestamp(long ts) {
    return new java.util.Date(ts).toInstant().toString();
  }
}
`,
  "c++": `#include <chrono>
#include <string>
std::string formatTimestamp(long long ms) {
  return "TODO: format ISO 8601 from milliseconds";
}
`,
  plaintext: `# Paste any plain text here`,
};

// extension -> app language
const EXT_LANG_MAP = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  java: "java",
  cpp: "c++",
  cxx: "c++",
  cc: "c++",
  hpp: "c++",
  txt: "plaintext",
  md: "plaintext",
};
const ACCEPT_EXT = Object.keys(EXT_LANG_MAP);
const MAX_PER_FILE = 1 * 1024 * 1024; // 1 MB
const MAX_TOTAL = 2 * 1024 * 1024;    // 2 MB

const appLangToMonaco = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  "c++": "cpp",
  plaintext: "plaintext",
};

/* ──────────────────────────────────────────────────────────────
   Small helpers
────────────────────────────────────────────────────────────── */
function firstLine(str = "") {
  const line = str.split("\n")[0].trim();
  return line.length > 56 ? line.slice(0, 56) + "…" : line;
}
function label(lang) {
  const map = {
    auto: "Auto detect",
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    java: "Java",
    "c++": "C++",
    plaintext: "Plain text",
  };
  return map[lang] || lang;
}
function extToLang(filename = "") {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? EXT_LANG_MAP[m[1]] || "plaintext" : "plaintext";
}
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result || ""));
    r.onerror = reject;
    r.readAsText(file);
  });
}
function prettyBytes(n) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
}
function norm(s = "") {
  return String(s).toLowerCase().normalize("NFKD").replace(/\s+/g, " ").trim();
}

/* ──────────────────────────────────────────────────────────────
   Strong language detection (Java before C++ when close)
────────────────────────────────────────────────────────────── */
function guessLang(code = "") {
  const src = code.slice(0, 12000);
  const first = (src.split("\n")[0] || "").trim();

  // shebangs
  if (/^#!.*\bpython\b/i.test(first)) return "python";
  if (/^#!.*\bnode\b/i.test(first)) return "javascript";

  // Java signals
  const javaScore =
    0 +
    (/\bpackage\s+[a-zA-Z_][\w.]*\s*;/.test(src) ? 3 : 0) +
    (/\bimport\s+java\./.test(src) ? 3 : 0) +
    (/\bpublic\s+(class|interface|enum)\s+[A-Z]\w*/.test(src) ? 3 : 0) +
    (/\bclass\s+[A-Z]\w*/.test(src) ? 2 : 0) +
    (/\bpublic\s+static\s+void\s+main\s*\(\s*String\[\]\s+\w+\s*\)/.test(src) ? 4 : 0) +
    (/\bSystem\.out\.println\s*\(/.test(src) ? 2 : 0);

  // C++ signals
  const cppScore =
    0 +
    (/#\s*include\s*<[^>]+>/.test(src) ? 4 : 0) +
    (/\bstd::\w+/.test(src) ? 3 : 0) +
    (/\busing\s+namespace\s+std\s*;/.test(src) ? 2 : 0) +
    (/\btemplate\s*<[^>]+>/.test(src) ? 2 : 0) +
    (/\bint\s+main\s*\(\s*(void)?\s*\)/.test(src) ? 3 : 0) +
    (/\bcout\s*<</.test(src) ? 2 : 0);

  // TS / JS
  const tsScore =
    (/\binterface\s+\w+/.test(src) ? 2 : 0) +
    (/\btype\s+\w+\s*=/.test(src) ? 2 : 0) +
    (/:\s*[A-Z]\w+(\[\])?/.test(src) ? 2 : 0) +
    (/\bexport\s+(interface|type|class|function|const|let|var)\b/.test(src) ? 2 : 0);

  const jsScore =
    (/\b(function|const|let|var)\s+\w+/.test(src) ? 2 : 0) +
    (/\bmodule\.exports\b|\brequire\(['"]/.test(src) ? 2 : 0) +
    (/\bexport\s+(default\s+)?\w+/.test(src) ? 1 : 0);

  // Python
  const pyScore =
    (/\bdef\s+\w+\s*\(/.test(src) ? 3 : 0) +
    (/\bclass\s+[A-Z]\w*\s*:/.test(src) ? 2 : 0) +
    (/\bimport\s+\w+/.test(src) ? 1 : 0) +
    (/\bprint\s*\(/.test(src) ? 1 : 0);

  const scores = [
    ["java", javaScore],
    ["c++", cppScore],
    ["typescript", tsScore],
    ["javascript", jsScore],
    ["python", pyScore],
  ].sort((a, b) => b[1] - a[1]);

  const [topLang, topScore] = scores[0];

  // prefer Java if close to C++
  if (topLang === "c++") {
    if (javaScore > 0 && cppScore - javaScore <= 1) return "java";
  }

  if (topScore <= 0) return "plaintext";
  return topLang;
}

/* ──────────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  // Theme & layout
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const raw = localStorage.getItem("nxSidebarOpen");
    return raw === null ? true : raw === "true";
  });

  // Snippet state
  const [language, setLanguage] = useState(() => localStorage.getItem("lang") || "auto");
  const [detected, setDetected] = useState("plaintext");
  const [code, setCode] = useState(() => {
    const savedLang = localStorage.getItem("lang");
    const base = STARTER[savedLang] || STARTER.typescript;
    return base;
  });
  const [docs, setDocs] = useState("");
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [uploaded, setUploaded] = useState([]); // {name, size}[]

  // Refs
  const fileInputRef = useRef(null);
  const docsRef = useRef(null);
  const monacoEditorRef = useRef(null);
  const detectTimer = useRef(null);

  /* Effects */
  useEffect(() => {
    document.documentElement.setAttribute("data-nx-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("lang", language);
  }, [language]);

  useEffect(() => {
    localStorage.setItem("nxSidebarOpen", String(isSidebarOpen));
  }, [isSidebarOpen]);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchSnippets();
        list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setHistory(list);
        if (list[0]) {
          setActiveId(list[0]._id);
          const l = list[0].language || "plaintext";
          setLanguage((prev) => (prev === "auto" ? "auto" : l));
          setDetected(l);
          setCode(list[0].code || STARTER[l] || "");
          setDocs(list[0].documentation || "");
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  // Auto-detect language when user types (debounced)
  useEffect(() => {
    if (language !== "auto") return;
    if (detectTimer.current) clearTimeout(detectTimer.current);
    detectTimer.current = setTimeout(() => {
      setDetected(guessLang(code));
    }, 200);
    return () => detectTimer.current && clearTimeout(detectTimer.current);
  }, [code, language]);

  /* Derived */
  const effectiveLang = language === "auto" ? detected : language;
  const disabled = useMemo(() => loading || !code.trim(), [loading, code]);
  const charCount = code.length;
  const monacoTheme = theme === "dark" ? "vs-dark" : "vs-light";
  const monacoLang = appLangToMonaco[effectiveLang] || "plaintext";

  const filtered = useMemo(() => {
    const q = norm(filter);
    if (!q) return history;
    return history.filter((s) => {
      const t = norm(s?.title);
      const lang = norm(s?.language);
      const codeStr = norm(s?.code);
      const docsStr = norm(s?.documentation);
      const created = s?.createdAt ? norm(new Date(s.createdAt).toLocaleString()) : "";
      return (
        t.includes(q) ||
        lang.includes(q) ||
        codeStr.includes(q) ||
        docsStr.includes(q) ||
        created.includes(q)
      );
    });
  }, [filter, history]);

  /* Actions */
  const onGenerate = useCallback(async () => {
    try {
      setLoading(true);
      const created = await createSnippet({ language: effectiveLang, code });
      setDocs(created.documentation || "");
      setActiveId(created._id);
      setHistory((prev) => [created, ...prev]);
    } catch (err) {
      alert(err?.response?.data?.message || "Server error");
    } finally {
      setLoading(false);
    }
  }, [effectiveLang, code]);

  const onSelectHistory = useCallback(
    (id) => {
      const s = history.find((x) => x._id === id);
      if (!s) return;
      setActiveId(id);
      // Keep user’s selection mode (auto/manual), but update detected
      setDetected(s.language || "plaintext");
      setCode(s.code || "");
      setDocs(s.documentation || "");
      monacoEditorRef.current?.setScrollTop(0);
      monacoEditorRef.current?.setPosition({ lineNumber: 1, column: 1 });
    },
    [history]
  );

  const onDelete = useCallback(
    async (id) => {
      if (!confirm("Delete this snippet?")) return;
      try {
        await deleteSnippet(id);
        setHistory((p) => p.filter((x) => x._id !== id));
        if (activeId === id) {
          setActiveId(null);
          setDocs("");
        }
      } catch {
        alert("Failed to delete.");
      }
    },
    [activeId]
  );

  const onRename = useCallback(
    async (id) => {
      const current = history.find((x) => x._id === id);
      const initial = (current?.title || firstLine(current?.code || "")) ?? "";
      const title = prompt("New title", initial);
      if (!title || title.trim() === "") return;
      try {
        const updated = await updateSnippetTitle(id, title.trim());
        setHistory((prev) => prev.map((x) => (x._id === id ? { ...x, title: updated.title } : x)));
      } catch {
        setHistory((prev) => prev.map((x) => (x._id === id ? { ...x, title: title.trim() } : x)));
      }
    },
    [history]
  );

  const onCopyDocs = useCallback(() => {
    navigator.clipboard.writeText(docs || "").catch(() => {});
  }, [docs]);

  // Clean PDF export (hidden iframe + print; CSS hides headers/footers in most browsers)
  const onExportPdf = useCallback(() => {
    const printable = docsRef.current;
    if (!printable) return;

    const html = `
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Documentation</title>
  <link href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&display=swap" rel="stylesheet">
  <style>
    *{box-sizing:border-box}
    body{
      font-family:Sora,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial;
      color:#0f1535;margin:24px;background:#fff;
      -webkit-print-color-adjust:exact; print-color-adjust:exact;
    }
    h1,h2,h3,h4{margin:.4rem 0}
    h1{font-size:22px;font-weight:800}
    h2{font-size:18px;font-weight:800}
    h3{font-size:16px;font-weight:700}
    p{line-height:1.8;margin:.4rem 0}
    code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f5f7ff;border:1px solid #e3e9ff;padding:2px 6px;border-radius:6px}
    pre{background:#f5f7ff;border:1px solid #e3e9ff;padding:12px;border-radius:12px;overflow:auto}
    table{border-collapse:collapse;width:100%;margin:.4rem 0}
    th,td{border:1px solid #e3e9ff;padding:8px;text-align:left}
    th{background:#f5f7ff}
    @page{size:auto; margin:10mm}
    @media print {
      a[href]:after{content:""}
      header,footer{display:none !important}
    }
  </style>
</head>
<body>
  ${printable.innerHTML}
</body>
</html>`.trim();

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();

    const doPrint = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => document.body.removeChild(iframe), 1500);
      }
    };

    if (doc.readyState === "complete") setTimeout(doPrint, 120);
    else (iframe.onload = () => setTimeout(doPrint, 120));
  }, []);

  const onChangeLanguage = useCallback((l) => {
    setLanguage(l);
    if (l !== "auto") {
      const starterCode = STARTER[l] || "";
      setCode(starterCode);
      setDocs("");
      setDetected(l);
    } else {
      // When switching to auto mode, detect from current code
      // If code is empty or matches a starter template, set to plaintext
      const currentDetected = guessLang(code);
      setDetected(currentDetected);
    }
  }, [code]);

  /* Uploads */
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const allowed = files.filter((f) => {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      return ACCEPT_EXT.includes(ext);
    });
    if (allowed.length === 0) {
      alert("Only code/text files are allowed.");
      return;
    }

    const total = allowed.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL) {
      alert(`Total upload too large: ${prettyBytes(total)} (max ${prettyBytes(MAX_TOTAL)})`);
      return;
    }
    if (allowed.some((f) => f.size > MAX_PER_FILE)) {
      alert(`A file exceeds ${prettyBytes(MAX_PER_FILE)} limit.`);
      return;
    }

    // if first content and language is auto, prefer first file's extension
    if (!code.trim() && language === "auto") {
      const byExt = extToLang(allowed[0]?.name);
      setDetected(byExt);
    } else if (!code.trim() && language !== "auto") {
      setLanguage(extToLang(allowed[0]?.name));
    }

    let merged = code ? code.trimEnd() + "\n\n" : "";
    for (const f of allowed) {
      try {
        const txt = await readFileAsText(f);
        const localLang = language === "auto" ? guessLang(txt) : language;
        const header =
          localLang === "python"
            ? `# ==== ${f.name} ====\n`
            : localLang === "plaintext"
            ? `==== ${f.name} ====\n`
            : `// ==== ${f.name} ====\n`;
        merged += header + txt.trimEnd() + "\n\n";
      } catch {
        alert(`Failed to read: ${f.name}`);
      }
    }

    setCode(merged);
    setUploaded((prev) => [...prev, ...allowed.map((f) => ({ name: f.name, size: f.size }))]);
  }
  const onPickClick = () => fileInputRef.current?.click();
  const onInputChange = (e) => {
    handleFiles(e.target.files);
    e.target.value = "";
  };
  const onDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files);
  };
  const onDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };
  const removeUploaded = (name) => {
    setUploaded((list) => list.filter((x) => x.name !== name));
  };

  /* Monaco mount (bind Ctrl/Cmd+Enter) */
  const handleEditorMount = useCallback((editor, monaco) => {
    monacoEditorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      if (!disabled) onGenerate();
    });
    editor.updateOptions({ minimap: { enabled: false } });
  }, [onGenerate, disabled]);

  /* Render */
  return (
    <>
      <Styles />

      <div className="nx-shell">
        <header className="nx-header nx-card">
          <div className="nx-left">
            <button
              className="nx-icon-btn"
              onClick={() => setIsSidebarOpen((s) => !s)}
              title={isSidebarOpen ? "Hide history" : "Show history"}
              aria-label={isSidebarOpen ? "Hide history" : "Show history"}
            >
              ☰
            </button>
            <img src="/Logo.png" alt="DevDocs AI" className="nx-logo" decoding="async" loading="eager" />
            <div className="nx-title">
              <div className="nx-brand">DevDocs AI</div>
              <div className="nx-sub">Generate clean docs from raw code</div>
            </div>
          </div>

          <div className="nx-right">
            <button
              className="nx-icon-btn"
              onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
              title="Toggle theme"
              aria-label="Toggle theme"
            >
              {theme === "dark" ? "🌙" : "☀️"}
            </button>

            <select
              value={language}
              onChange={(e) => onChangeLanguage(e.target.value)}
              className="nx-select"
              aria-label="Language"
              title="Language mode"
            >
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {label(l)}
                </option>
              ))}
            </select>

            <button className="nx-btn nx-outline" onClick={doLogout}>Logout</button>
          </div>
        </header>

        <div className={`nx-main ${isSidebarOpen ? "has-sidebar" : "no-sidebar"}`}>
          {/* Sidebar (removed from DOM when collapsed) */}
          {isSidebarOpen && (
            <aside className="nx-pane nx-card nx-sidebar">
              <div className="nx-pane-head">
                {/* intentionally no “History” title */}
                <div style={{ height: 18 }} />
                <div className="nx-head-controls">
                  <input
                    className="nx-input"
                    placeholder="Search snippets…"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    aria-label="Search history"
                  />
                </div>
              </div>

              <div className="nx-list">
                {filtered.length === 0 ? (
                  <div className="nx-empty">No snippets yet. Generate your first one!</div>
                ) : (
                  filtered.map((s) => (
                    <div
                      key={s._id}
                      className={`nx-item ${activeId === s._id ? "is-active" : ""}`}
                      onClick={() => onSelectHistory(s._id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="nx-item-top">
                        <span className="nx-pill">{s.language}</span>
                        <div className="nx-actions-inline">
                          <button
                            className="nx-mini"
                            onClick={(e) => {
                              e.stopPropagation();
                              onRename(s._id);
                            }}
                          >
                            Rename
                          </button>
                          <button
                            className="nx-mini nx-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(s._id);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                      <div className="nx-item-title">{s.title || firstLine(s.code)}</div>
                      <div className="nx-item-meta">{new Date(s.createdAt).toLocaleString()}</div>
                    </div>
                  ))
                )}
              </div>
            </aside>
          )}

          {/* Composer */}
          <section className="nx-pane nx-card">
            <div className="nx-pane-head">
              <h3>Your Code</h3>
              <div className="nx-head-meta">
                <span className="nx-chip">
                  {language === "auto" ? `Auto: ${label(effectiveLang)}` : label(effectiveLang)}
                </span>
                <span className="nx-meta">{charCount.toLocaleString()} chars</span>
              </div>
            </div>

            {/* Upload / Dropzone */}
            <div className="nx-dropzone" onDrop={onDrop} onDragOver={onDragOver} role="button" tabIndex={0} aria-label="Drop files here">
              <div className="nx-drop-inner">
                <div className="nx-drop-left">
                  <div className="nx-drop-title">Upload files</div>
                  <div className="nx-drop-sub">
                    Drag &amp; drop here, or
                    <button type="button" className="nx-linklike" onClick={onPickClick} aria-label="Choose files">
                      &nbsp;choose files
                    </button>
                  </div>
                </div>
                <div className="nx-drop-actions">
                  <button type="button" className="nx-btn nx-outline" onClick={onPickClick}>Browse…</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept={ACCEPT_EXT.map((e) => `.${e}`).join(",")}
                    style={{ display: "none" }}
                    onChange={onInputChange}
                  />
                </div>
              </div>

              {uploaded.length > 0 && (
                <div className="nx-files">
                  {uploaded.map((f) => (
                    <div key={f.name} className="nx-file" title={`${f.name} • ${prettyBytes(f.size)}`}>
                      <span className="nx-file-name">{f.name}</span>
                      <span className="nx-file-size">{prettyBytes(f.size)}</span>
                      <button className="nx-mini" onClick={() => removeUploaded(f.name)}>Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Monaco Editor */}
            <div className="nx-editor">
              <Editor
                height="58vh"
                language={monacoLang}
                theme={monacoTheme}
                value={code}
                onChange={(v) => setCode(v ?? "")}
                onMount={handleEditorMount}
                options={{
                  fontSize: 14,
                  lineHeight: 24,
                  wordWrap: "on",
                  scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
                  smoothScrolling: true,
                  automaticLayout: true,
                  renderLineHighlight: "line",
                  tabSize: 2,
                  insertSpaces: true,
                }}
              />
            </div>

            <div className="nx-pane-foot">
              <button
                className="nx-btn nx-primary"
                onClick={onGenerate}
                disabled={disabled}
                aria-busy={loading}
                title="Ctrl/Cmd + Enter"
              >
                {loading ? "Generating…" : "✨ Generate Documentation"}
              </button>
            </div>
          </section>

          {/* Docs */}
          <section className="nx-pane nx-card">
            <div className="nx-pane-head">
              <h3>AI Generated Documentation</h3>
              <div className="nx-actions-inline">
                <button className="nx-btn nx-ghost nx-sm" onClick={onCopyDocs}>Copy</button>
                <button className="nx-btn nx-ghost nx-sm" onClick={onExportPdf}>Download PDF</button>
              </div>
            </div>

            <div className="nx-doc" ref={docsRef}>
              {docs ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h1: (p) => <h2 className="nx-md-h1" {...p} />,
                    h2: (p) => <h3 className="nx-md-h2" {...p} />,
                    h3: (p) => <h4 className="nx-md-h3" {...p} />,
                    p:  (p) => <p className="nx-md-p" {...p} />,
                    ul: (p) => <ul className="nx-md-ul" {...p} />,
                    li: (p) => <li className="nx-md-li" {...p} />,
                    pre: (p) => <pre className="nx-md-pre" {...p} />,
                    code: ({ inline, ...props }) =>
                      inline ? <code className="nx-md-code" {...props} /> : <code {...props} />,
                    table: (p) => (
                      <div className="nx-table-wrap">
                        <table {...p} />
                      </div>
                    ),
                    th: (p) => <th className="nx-th" {...p} />,
                    td: (p) => <td className="nx-td" {...p} />,
                  }}
                >
                  {docs}
                </ReactMarkdown>
              ) : (
                <div className="nx-empty">No documentation yet. Generate to see results.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

/* ──────────────────────────────────────────────────────────────
   Styles
────────────────────────────────────────────────────────────── */
function Styles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;500;600;700;800&display=swap');

      :root{
        --nx-bg:#f7f8ff; --nx-bg2:#eef2ff;
        --nx-surface:#ffffff; --nx-surface2:#f3f6ff;
        --nx-border:#d9e2ff; --nx-text:#0f1535; --nx-muted:#6071a6;
        --nx-brand:#3d63ff; --nx-brand-2:#204bff; --nx-danger:#ea4a4a; --nx-ring: rgba(61,99,255,.25);
        --nx-shadow: 0 10px 30px rgba(32,52,128,.10);
        --nx-radius: 16px;
      }
      [data-nx-theme="dark"]{
        --nx-bg:#0a0f1f; --nx-bg2:#0b1226;
        --nx-surface:#0f1732; --nx-surface2:#121b3d;
        --nx-border:#223366; --nx-text:#eaf0ff; --nx-muted:#9db1e6;
        --nx-brand:#6a8aff; --nx-brand-2:#3c65ff; --nx-danger:#ff6b6b; --nx-ring: rgba(106,138,255,.35);
        --nx-shadow: 0 16px 40px rgba(0,0,0,.35);
      }

      html,body,#root{height:100%}
      body{
        margin:0;
        background:linear-gradient(180deg,var(--nx-bg),var(--nx-bg2));
        color:var(--nx-text);
        font-family: "Sora", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial;
      }

      .nx-shell{height:100vh;display:flex;flex-direction:column}
      .nx-card{
        border:1px solid var(--nx-border);
        border-radius: var(--nx-radius);
        background: var(--nx-surface);
        box-shadow: var(--nx-shadow);
      }

      /* Header */
      .nx-header{
        height:72px;display:flex;align-items:center;justify-content:space-between;
        padding:0 18px; margin:14px; backdrop-filter: blur(10px);
      }
      .nx-left{display:flex;gap:12px;align-items:center}
      .nx-logo{height:32px;width:32px;object-fit:contain;border-radius:8px;filter: drop-shadow(0 6px 16px var(--nx-ring))}
      .nx-brand{font-weight:800;}
      .nx-sub{font-size:12px; color:var(--nx-muted); margin-top:2px}
      .nx-right{display:flex;gap:10px;align-items:center}
      .nx-icon-btn{
        height:42px;width:42px;border-radius:12px;border:1px solid var(--nx-border);
        background:var(--nx-surface2); cursor:pointer; font-size:18px;
      }
      .nx-icon-btn:hover{ box-shadow:0 0 0 2px var(--nx-ring) }

      .nx-select{
        background:var(--nx-surface2);color:var(--nx-text);border:1px solid var(--nx-border);
        padding:10px 12px;border-radius:12px;outline:none;font-weight:600;
      }

      /* Grid */
      .nx-main{
        display:grid; gap:18px;
        padding:0 14px 14px 14px; height:calc(100vh - 100px); overflow:hidden;
      }
      .nx-main.has-sidebar{ grid-template-columns:300px 1fr 520px; }
      .nx-main.no-sidebar{  grid-template-columns:1fr 520px; }

      /* Sidebar */
      .nx-sidebar{overflow:hidden}

      /* Inputs & buttons */
      .nx-input{
        width:46%; min-width:220px;
        border:1px solid var(--nx-border); background:var(--nx-surface); color:var(--nx-text);
        padding:10px 12px; border-radius:12px; outline:none; font-weight:600;
      }
      .nx-input:focus{ box-shadow:0 0 0 2px var(--nx-ring) }

      .nx-btn{height:44px;padding:0 18px;border-radius:12px;font-weight:800;border:1px solid var(--nx-border);cursor:pointer}
      .nx-outline{background:transparent}
      .nx-outline:hover{box-shadow:0 0 0 2px var(--nx-ring)}
      .nx-primary{background:linear-gradient(90deg,var(--nx-brand),var(--nx-brand-2));color:#fff;border:none}
      .nx-primary[aria-busy="true"]{opacity:.75;cursor:wait}
      .nx-ghost{background:transparent}
      .nx-sm{height:36px;border-radius:10px}
      .nx-mini{
        height:28px; padding:0 10px; border-radius:8px; border:1px solid var(--nx-border); background:var(--nx-surface2);
        font-weight:700; cursor:pointer;
      }
      .nx-mini.nx-danger{color:#fff; background:linear-gradient(90deg,var(--nx-danger),#ff8b8b); border:none}

      /* Panels */
      .nx-pane{display:flex;flex-direction:column;overflow:hidden}
      .nx-pane-head{
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 16px; border-bottom:1px solid var(--nx-border); background:var(--nx-surface2);
        border-top-left-radius: var(--nx-radius); border-top-right-radius: var(--nx-radius);
      }
      .nx-pane-head h3{margin:0;font-size:15px;font-weight:800}
      .nx-pane-foot{padding:12px 14px;border-top:1px solid var(--nx-border);background:var(--nx-surface2)}

      /* History list */
      .nx-list{padding:12px;overflow:auto}
      .nx-empty{color:var(--nx-muted);padding:8px 6px}
      .nx-item{
        border:1px solid var(--nx-border); background:var(--nx-surface); border-radius:14px; padding:12px; margin-bottom:12px;
        transition: box-shadow .15s, border-color .15s, transform .04s; cursor:pointer;
      }
      .nx-item:hover{box-shadow:0 6px 16px var(--nx-ring)}
      .nx-item.is-active{border-color:var(--nx-brand); box-shadow:0 0 0 2px var(--nx-ring)}
      .nx-item-top{display:flex; justify-content:space-between; align-items:center; margin-bottom:6px}
      .nx-pill{font-size:11px; padding:6px 10px; border-radius:999px; background:linear-gradient(90deg,var(--nx-brand),var(--nx-brand-2)); color:#fff;font-weight:700}
      .nx-actions-inline{display:flex;gap:8px}
      .nx-item-title{font-weight:800; font-size:14px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis}
      .nx-item-meta{color:var(--nx-muted); font-size:12px; margin-top:2px}

      /* Upload / Dropzone */
      .nx-dropzone{ margin: 12px; border:1px dashed var(--nx-border); border-radius:14px; background: var(--nx-surface2); }
      .nx-drop-inner{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; }
      .nx-drop-title{font-weight:800}
      .nx-drop-sub{font-size:12px; color:var(--nx-muted)}
      .nx-linklike{border:none;background:none;color:var(--nx-brand-2);font-weight:800;cursor:pointer}
      .nx-files{padding:8px 12px; border-top:1px dashed var(--nx-border); display:flex; flex-wrap:wrap; gap:8px}
      .nx-file{ display:flex; align-items:center; gap:10px; border:1px solid var(--nx-border); border-radius:10px; padding:6px 10px; background:var(--nx-surface); }
      .nx-file-name{max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      .nx-file-size{color:var(--nx-muted); font-size:12px}

      /* Editor */
      .nx-editor{padding:12px;overflow:auto;flex:1}

      /* Docs / Markdown */
      .nx-doc{padding:12px;overflow:auto}
      .nx-table-wrap{overflow-x:auto}
      table{border-collapse:collapse;width:100%}
      .nx-th,.nx-td{border:1px solid var(--nx-border); padding:8px}
      .nx-th{background:var(--nx-surface2)}
      .nx-md-h1{font-size:22px;font-weight:800;margin:.2rem 0 .6rem}
      .nx-md-h2{font-size:18px;font-weight:800;margin:.8rem 0 .4rem}
      .nx-md-h3{font-size:16px;font-weight:700;margin:.6rem 0 .3rem}
      .nx-md-p{line-height:1.8;margin:.5rem 0}
      .nx-md-ul{margin:.4rem 0 .7rem 1.2rem}
      .nx-md-li{margin:.22rem 0}
      .nx-md-pre{background:var(--nx-surface2); padding:12px; border-radius:14px; overflow:auto; border:1px solid var(--nx-border)}
      .nx-md-code{background:var(--nx-surface2); padding:2px 6px; border-radius:6px}

      /* Responsive */
      @media (max-width:1040px){
        .nx-main.has-sidebar{ grid-template-columns: 1fr; }
        .nx-sidebar{ order: 1; }
      }
    `}</style>
  );
}
