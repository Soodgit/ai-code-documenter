import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import html2pdf from "html2pdf.js";

import {
  createSnippet,
  fetchSnippets,
  deleteSnippet,
  updateSnippetTitle,
} from "../api/snippets";
import { doLogout } from "../utils/auth";

/* ──────────────────────────────────────────────────────────────
   Language presets
────────────────────────────────────────────────────────────── */
const LANGS = ["typescript", "javascript", "python", "java", "c++", "plaintext"];

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
const MAX_PER_FILE = 1 * 1024 * 1024;
const MAX_TOTAL = 2 * 1024 * 1024;

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */
function firstLine(str = "") {
  const line = str.split("\n")[0].trim();
  return line.length > 56 ? line.slice(0, 56) + "…" : line;
}
function label(lang) {
  const map = {
    javascript: "JavaScript",
    typescript: "TypeScript",
    python: "Python",
    java: "Java",
    "c++": "C++",
    plaintext: "Plain text",
  };
  return map[lang] || lang;
}
function prettyBytes(n) {
  if (n < 1024) return `${n} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(2)} MB`;
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

/* ──────────────────────────────────────────────────────────────
   Component
────────────────────────────────────────────────────────────── */
export default function DashboardPage() {
  /* theme + layout */
  const [theme, setTheme] = useState(() => localStorage.getItem("theme") || "dark");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const raw = localStorage.getItem("nxSidebarOpen");
    return raw === null ? true : raw === "true";
  });

  /* snippet state */
  const [language, setLanguage] = useState(() => localStorage.getItem("lang") || LANGS[0]);
  const [code, setCode] = useState(() => STARTER[localStorage.getItem("lang")] || STARTER.typescript);
  const [docs, setDocs] = useState("");
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState(null);

  /* ui state */
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [uploaded, setUploaded] = useState([]);

  /* refs */
  const fileInputRef = useRef(null);
  const docsRef = useRef(null);

  /* effects */
  useEffect(() => {
    document.documentElement.setAttribute("data-nx-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);
  useEffect(() => localStorage.setItem("lang", language), [language]);
  useEffect(() => localStorage.setItem("nxSidebarOpen", String(sidebarOpen)), [sidebarOpen]);

  useEffect(() => {
    (async () => {
      try {
        const list = await fetchSnippets();
        list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        setHistory(list);
        if (list[0]) {
          setActiveId(list[0]._id);
          setLanguage(list[0].language);
          setCode(list[0].code || STARTER[list[0].language] || "");
          setDocs(list[0].documentation || "");
        }
      } catch (e) {
        console.error(e);
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        if (!disabled) onGenerate();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, loading]);

  /* derived */
  const disabled = useMemo(() => loading || !code.trim(), [loading, code]);
  const charCount = code.length;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return history;
    return history.filter(
      (s) =>
        (s.title || "").toLowerCase().includes(q) ||
        s.language.toLowerCase().includes(q) ||
        s.code.toLowerCase().includes(q) ||
        (s.documentation || "").toLowerCase().includes(q)
    );
  }, [filter, history]);

  /* actions */
  const onGenerate = useCallback(async () => {
    try {
      setLoading(true);
      const created = await createSnippet({ language, code });
      setDocs(created.documentation || "");
      setActiveId(created._id);
      setHistory((prev) => [created, ...prev]);
    } catch (err) {
      alert(err?.response?.data?.message || "Server error");
    } finally {
      setLoading(false);
    }
  }, [language, code]);

  const onSelectHistory = useCallback(
    (id) => {
      const s = history.find((x) => x._id === id);
      if (!s) return;
      setActiveId(id);
      setLanguage(s.language);
      setCode(s.code);
      setDocs(s.documentation || "");
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

  /* real PDF (no browser header/footer) */
  const onDownloadPdf = useCallback(() => {
    const el = docsRef.current;
    if (!el || !docs.trim()) {
      alert("Nothing to export.");
      return;
    }

    // Clone to a clean, print-friendly container
    const container = document.createElement("div");
    container.className = "pdf-root";
    container.innerHTML = `
      <div class="pdf-page">
        ${el.innerHTML}
      </div>
    `;
    document.body.appendChild(container);

    const opt = {
      margin: [10, 12], // mm
      filename: `documentation-${new Date().toISOString().slice(0,19)}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
      pagebreak: { mode: ["css", "legacy"] },
    };

    html2pdf()
      .from(container)
      .set(opt)
      .save()
      .then(() => {
        document.body.removeChild(container);
      })
      .catch((e) => {
        console.error(e);
        document.body.removeChild(container);
        alert("Failed to generate PDF.");
      });
  }, [docs]);

  const onChangeLanguage = useCallback((l) => {
    setLanguage(l);
    setCode(STARTER[l] || "");
    setDocs("");
  }, []);

  /* uploads */
  async function handleFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const allowed = files.filter((f) => {
      const ext = (f.name.split(".").pop() || "").toLowerCase();
      return ACCEPT_EXT.includes(ext);
    });
    if (allowed.length === 0) return alert("Only code/text files are allowed.");

    const total = allowed.reduce((s, f) => s + f.size, 0);
    if (total > MAX_TOTAL) return alert(`Total upload too large: ${prettyBytes(total)} (max ${prettyBytes(MAX_TOTAL)})`);
    if (allowed.some((f) => f.size > MAX_PER_FILE)) return alert(`A file exceeds ${prettyBytes(MAX_PER_FILE)} limit.`);

    if (!code.trim()) setLanguage(extToLang(allowed[0]?.name));

    let merged = code ? code.trimEnd() + "\n\n" : "";
    for (const f of allowed) {
      try {
        const txt = await readFileAsText(f);
        const header =
          language === "python"
            ? `# ==== ${f.name} ====\n`
            : language === "plaintext"
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
  function onPickClick() { fileInputRef.current?.click(); }
  function onInputChange(e) { handleFiles(e.target.files); e.target.value = ""; }
  function onDrop(e) { e.preventDefault(); e.stopPropagation(); if (e.dataTransfer?.files?.length) handleFiles(e.dataTransfer.files); }
  function onDragOver(e) { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; }
  function removeUploaded(name) { setUploaded((list) => list.filter((x) => x.name !== name)); }

  /* render */
  return (
    <>
      <Styles />

      <div className="nx-shell">
        <header className="nx-header nx-card">
          <div className="nx-left">
            <button
              className="nx-icon-btn"
              onClick={() => setSidebarOpen((s) => !s)}
              title={sidebarOpen ? "Hide history" : "Show history"}
              aria-label={sidebarOpen ? "Hide history" : "Show history"}
            >
              <span className="nx-hamburger" aria-hidden="true" />
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
              <span className="nx-theme-emoji" aria-hidden="true">{theme === "dark" ? "🌙" : "☀️"}</span>
            </button>

            <select value={language} onChange={(e) => onChangeLanguage(e.target.value)} className="nx-select" aria-label="Language">
              {LANGS.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>

            <button className="nx-btn nx-outline" onClick={doLogout}>Logout</button>
          </div>
        </header>

        <div className={`nx-main ${sidebarOpen ? "has-sidebar" : "no-sidebar"}`}>
          {sidebarOpen && (
            <aside className="nx-pane nx-card nx-sidebar">
              <div className="nx-pane-head">
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
                            onClick={(e) => { e.stopPropagation(); onRename(s._id); }}
                          >Rename</button>
                          <button
                            className="nx-mini nx-danger"
                            onClick={(e) => { e.stopPropagation(); onDelete(s._id); }}
                          >Delete</button>
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
                <span className="nx-chip">{label(language)}</span>
                <span className="nx-meta">{charCount.toLocaleString()} chars</span>
              </div>
            </div>

            {/* Upload */}
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

            <div className="nx-editor">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                placeholder="// Paste or type code here…"
                aria-label="Code editor"
              />
            </div>

            <div className="nx-pane-foot">
              <button className="nx-btn nx-primary" onClick={onGenerate} disabled={disabled} aria-busy={loading} title="Ctrl/Cmd + Enter">
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
                <button className="nx-btn nx-ghost nx-sm" onClick={onDownloadPdf}>Download PDF</button>
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
   Styles (UI + PDF)
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
        background:var(--nx-surface2); cursor:pointer; display:grid; place-items:center;
        color:var(--nx-text);
        font-size:18px; line-height:1; /* visible emoji */
      }
      .nx-icon-btn:hover{ box-shadow:0 0 0 2px var(--nx-ring) }
      .nx-hamburger{
        width:18px; height:14px; display:block;
        background:
          linear-gradient(currentColor, currentColor) 0 0 / 100% 2px no-repeat,
          linear-gradient(currentColor, currentColor) 0 6px / 100% 2px no-repeat,
          linear-gradient(currentColor, currentColor) 0 12px / 100% 2px no-repeat;
        border-radius:2px; opacity:.95;
      }
      .nx-theme-emoji{ font-size:18px; line-height:1; }

      .nx-select{
        background:var(--nx-surface2);color:var(--nx-text);border:1px solid var(--nx-border);
        padding:10px 12px;border-radius:12px;outline:none;font-weight:600;
      }

      .nx-main{
        display:grid; gap:18px;
        padding:0 14px 14px 14px; height:calc(100vh - 100px); overflow:hidden;
      }
      .nx-main.has-sidebar{ grid-template-columns:300px 1fr 520px; }
      .nx-main.no-sidebar{ grid-template-columns:1fr 520px; }

      .nx-pane{display:flex;flex-direction:column;overflow:hidden}
      .nx-pane-head{
        display:flex; align-items:center; justify-content:space-between;
        padding:14px 16px; border-bottom:1px solid var(--nx-border); background:var(--nx-surface2);
        border-top-left-radius: var(--nx-radius); border-top-right-radius: var(--nx-radius);
      }
      .nx-pane-head h3{margin:0;font-size:15px;font-weight:800}
      .nx-pane-foot{padding:12px 14px;border-top:1px solid var(--nx-border);background:var(--nx-surface2)}

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

      .nx-dropzone{ margin:12px; border:1px dashed var(--nx-border); border-radius:14px; background: var(--nx-surface2); }
      .nx-drop-inner{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; }
      .nx-drop-title{font-weight:800}
      .nx-drop-sub{font-size:12px; color:var(--nx-muted)}
      .nx-linklike{border:none;background:none;color:var(--nx-brand-2);font-weight:800;cursor:pointer}
      .nx-files{padding:8px 12px; border-top:1px dashed var(--nx-border); display:flex; flex-wrap:wrap; gap:8px}
      .nx-file{ display:flex; align-items:center; gap:10px; border:1px solid var(--nx-border); border-radius:10px; padding:6px 10px; background:var(--nx-surface); }
      .nx-file-name{max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;}
      .nx-file-size{color:var(--nx-muted); font-size:12px}

      .nx-editor{padding:12px;overflow:auto;flex:1}
      .nx-editor textarea{
        width:100%; height:58vh; border-radius:14px; padding:14px 16px; resize:vertical;
        background:var(--nx-surface2); color:var(--nx-text); border:1px solid var(--nx-border);
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
        font-size:14px; line-height:1.6;
      }
      .nx-head-meta{display:flex; gap:10px; align-items:center}
      .nx-chip{font-size:12px; padding:6px 10px; border-radius:999px; border:1px solid var(--nx-brand); color:var(--nx-brand); background:transparent}
      .nx-meta{color:var(--nx-muted); font-size:12px; font-weight:600}

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
      .nx-md-pre{
        background:var(--nx-surface2); padding:12px; border-radius:14px; overflow:auto; border:1px solid var(--nx-border);
        white-space:pre-wrap; word-break:break-word; /* better for PDF */
      }
      .nx-md-code{background:var(--nx-surface2); padding:2px 6px; border-radius:6px}

      @media (max-width:1040px){
        .nx-main.has-sidebar{ grid-template-columns: 1fr; }
        .nx-sidebar{ order: 1; }
      }

      /* ───── PDF styling (html2pdf target) ───── */
      .pdf-root{
        all: initial; /* avoid app styles leaking */
        font-family: Sora, Arial, sans-serif;
        color: #0f1535;
      }
      .pdf-page{
        width: 210mm;
        min-height: 297mm;
        box-sizing: border-box;
        padding: 12mm;
        background: #fff;
      }
      .pdf-page h1,.pdf-page h2,.pdf-page h3{ margin: .4rem 0; }
      .pdf-page table{ width: 100%; border-collapse: collapse; }
      .pdf-page th,.pdf-page td{ border:1px solid #e3e9ff; padding:8px; }
      .pdf-page th{ background:#f5f7ff }
      .pdf-page pre{
        background:#f5f7ff; border:1px solid #e3e9ff; padding:12px; border-radius:12px;
        white-space: pre-wrap; word-break: break-word;
      }
      .pdf-page code{
        background:#f5f7ff; border:1px solid #e3e9ff; padding:2px 6px; border-radius:6px;
        font-family: ui-monospace, Menlo, Consolas, monospace;
      }
      .pdf-page .nx-table-wrap{ overflow: visible; } /* ensure captured in canvas */
    `}</style>
  );
}
