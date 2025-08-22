// src/App.jsx
import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";

const Signup = lazy(() => import("./pages/Signup"));
const Login = lazy(() => import("./pages/Login"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const DashboardPage = lazy(() => import("./pages/Dashboard"));

function GlobalStyles() {
  return (
    <style>{`
      :root{
        --bg:#0b0f1a;--bg-soft:#111826;--panel:#151b2b;--panel-2:#0f172a;
        --text:#e5e7eb;--muted:#93a3b8;--border:#27324a;--brand:#3b82f6;--brand-2:#2563eb
      }
      html,body,#root{height:100%}
      body{margin:0;background:var(--bg);color:var(--text);
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica Neue,Arial}
      /* Layout shell */
      .dash{display:grid;grid-template-rows:56px 1fr;height:100vh}
      .topbar{display:flex;align-items:center;justify-content:space-between;padding:0 16px;
        border-bottom:1px solid var(--border);background:var(--bg-soft);position:sticky;top:0;z-index:10}
      .topbar .brand{font-weight:700;display:flex;gap:10px;align-items:center}
      .topbar .actions{display:flex;gap:12px;align-items:center}
      .select{background:var(--panel);color:var(--text);border:1px solid var(--border);
        padding:8px 10px;border-radius:10px;outline:none}

      .content{display:grid;grid-template-columns:280px 1fr 420px;gap:16px;padding:16px;height:calc(100vh - 56px);overflow:hidden}

      /* Sidebar */
      .sidebar{background:var(--panel);border:1px solid var(--border);border-radius:16px;overflow:hidden}
      .sidebar-header{padding:12px 14px;border-bottom:1px solid var(--border);font-weight:700;font-size:18px}
      .sidebar-body{padding:10px;height:100%;overflow:auto}
      .sidebar .empty{color:var(--muted);font-size:13px;padding:8px 6px}
      .row{display:flex;align-items:center;gap:8px;padding:10px 8px;border-radius:12px;border:1px solid transparent;background:transparent;transition:.15s;position:relative}
      .row:hover{background:rgba(255,255,255,.03)}
      .row.active{border-color:var(--brand);background:rgba(59,130,246,.08)}
      .del-btn{position:absolute;right:8px;top:8px;border:none;background:transparent;color:#f87171;font-size:16px;cursor:pointer}

      /* Panels */
      .panel{background:var(--panel);border:1px solid var(--border);border-radius:16px;display:flex;flex-direction:column;min-height:160px;overflow:hidden}
      .panel-header{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);font-weight:700}
      .panel-header .subtle{color:var(--muted);font-weight:500;font-size:12px;margin-left:8px}
      .panel-body{padding:12px}

      .main{display:flex;flex-direction:column;gap:12px;overflow:hidden}
      .editor-wrap textarea{width:100%;height:56vh;border-radius:12px;padding:12px 14px;resize:vertical;
        background:var(--panel-2);color:var(--text);border:1px solid var(--border);
        font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono",monospace;font-size:14px;line-height:1.5}

      /* Doc panel */
      .doc-body{max-height:calc(100% - 49px);overflow:auto}
      .doc-body h1,.doc-body h2,.doc-body h3{margin:.4rem 0}
      .doc-body p,.doc-body li{line-height:1.6}
      .doc-body pre{background:var(--panel-2);padding:12px;border-radius:12px;overflow:auto}
      .doc-body code{background:var(--panel-2);padding:2px 6px;border-radius:6px}
      .doc-body table{border-collapse:collapse;width:100%}
      .doc-body th,.doc-body td{border:1px solid var(--border);padding:8px}
      .doc-body th{background:#0f172a}

      /* Buttons */
      .btn{height:44px;padding:0 16px;border-radius:12px;font-weight:600;border:1px solid var(--border);cursor:pointer}
      .btn.primary{background:var(--brand);border-color:var(--brand-2);color:#fff}
      .btn.primary:hover{background:var(--brand-2)}
      .btn.ghost{background:transparent;color:var(--text)}
      .ghost-btn{border:1px solid var(--border);background:transparent;color:var(--text);
        border-radius:10px;padding:6px 10px;cursor:pointer}
      .ghost-btn:hover{border-color:var(--brand)}

      @media (max-width:1200px){.content{grid-template-columns:240px 1fr 360px}}
      @media (max-width:980px){
        .content{grid-template-columns:1fr}
        .right,.sidebar{order:2}
        .main{order:1}
      }
    `}</style>
  );
}

function Loader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{background:"#0b0f1a", color:"#e5e7eb"}}>
      <div className="animate-pulse rounded-xl" style={{background:"#151b2b", padding:"12px 24px"}}>Loading…</div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <GlobalStyles /> {/* ← styles always mounted */}
        <Suspense fallback={<Loader />}>
          <Routes>
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="*" element={<div style={{padding:24}}>Not Found</div>} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
