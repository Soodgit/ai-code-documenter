import { useState } from "react";
import api from "../lib/api";
import { useParams, Link, useNavigate } from "react-router-dom";

export default function ResetPassword() {
  const { token } = useParams();
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [loading, setLoading]   = useState(false);
  const [okMsg, setOkMsg]       = useState("");
  const [errMsg, setErrMsg]     = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setOkMsg(""); setErrMsg("");

    if (password.length < 6) {
      setErrMsg("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErrMsg("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { data } = await api.post(`/api/auth/reset-password/${token}`, { password });
      setOkMsg(data?.message || "Password changed. You can login now.");
      setTimeout(() => nav("/login"), 1200);
    } catch (e) {
      setErrMsg(e?.response?.data?.message || "Reset failed or token expired.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="card">
        {/* centered logo */}
        <div className="brandbar">
          <img src="/Logo.png" alt="Logo" className="brand-logo" />
        </div>

        <h1 className="h-title">Set a new password</h1>
        <p className="h-sub">Choose a strong password you haven't used before.</p>

        <form onSubmit={onSubmit} className="form">
          <label className="label">New Password</label>
          <div className="field">
            <span className="icon">🔒</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <label className="label">Confirm Password</label>
          <div className="field">
            <span className="icon">🔒</span>
            <input
              type="password"
              placeholder="••••••••"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>

          {okMsg && <div className="ok">{okMsg}</div>}
          {errMsg && <div className="error">{errMsg}</div>}

          <button className="btn primary" disabled={loading}>
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>

        <p className="foot">
          Back to <Link to="/login">Login</Link>
        </p>
      </div>

      <AuthStyles />
    </div>
  );
}

function AuthStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800&display=swap');

      :root{
        --bg1:#0b1020; --bg2:#0c1428;
        --panel:#0f1933; --panel2:#101c39;
        --text:#eaf0ff; --muted:#9db1e6; --border:#223566;
        --brandA:#6a8aff; --brandB:#3c65ff; --ring:rgba(106,138,255,.35);
        --shadow:0 20px 60px rgba(0,0,0,.45);
        --radius:20px;
      }

      .auth-wrap{
        min-height:100vh;
        background: radial-gradient(1200px 800px at 15% 0%, #121b3d 0%, transparent 60%),
                    radial-gradient(1100px 900px at 85% 20%, #0d1736 0%, transparent 55%),
                    linear-gradient(180deg,var(--bg1),var(--bg2));
        display:grid; place-items:center;
        font-family:"Sora", ui-sans-serif, system-ui;
        color:var(--text);
      }
      .card{
        width:min(96vw, 560px);
        background: linear-gradient(180deg, rgba(18,29,59,.82), rgba(14,23,46,.82));
        border:1px solid var(--border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
        padding: 34px 36px 26px;
        backdrop-filter: blur(10px);
      }
      .brandbar{display:flex; justify-content:center; margin-bottom:16px}
      .brand-logo{height:43px; width:auto; filter: drop-shadow(0 8px 24px var(--ring))}
      .h-title{margin:8px 0 6px; font-size:28px; font-weight:800}
      .h-sub{margin:0 0 22px; color:var(--muted)}
      .label{font-size:13px; font-weight:700; margin-bottom:8px; display:block}
      .field{position:relative; margin-bottom:16px}
      .icon{position:absolute; left:12px; top:10px; opacity:.7; font-size:16px}
      input{
        width:100%; padding:12px 12px 12px 36px;
        background:var(--panel2); border:1px solid var(--border);
        color:var(--text); border-radius:12px; outline:none; font-size:14px;
      }
      input:focus{ box-shadow:0 0 0 3px var(--ring); }
      .btn{width:100%; height:48px; border-radius:12px; cursor:pointer; border:none; font-weight:800}
      .primary{background:linear-gradient(90deg,var(--brandA),var(--brandB)); color:#fff}
      .primary[disabled]{opacity:.75; cursor:wait}
      .ok{background:rgba(80,200,120,.12); border:1px solid rgba(80,200,120,.35); color:#b6ffd1;
          padding:10px 12px; border-radius:10px; margin-bottom:12px; font-weight:700;}
      .error{background:rgba(255,107,107,.12); border:1px solid #ff6b6b33; color:#ff9f9f;
          padding:10px 12px; border-radius:10px; margin-bottom:12px; font-weight:700;}
      .foot{text-align:center; color:var(--muted); margin-top:14px}
      .foot a{ color:#86a2ff; font-weight:700; text-decoration:none }
      .foot a:hover{ text-decoration:underline }
    `}</style>
  );
}
