import { useState } from "react";
import { login, setToken } from "./api";

const COLORS = {
  bg: "#0F161F",
  surface: "#161F2A",
  surface2: "#1D2A38",
  border: "#26374A",
  text: "#E9F0F6",
  textDim: "#8CA0B3",
  textFaint: "#5A7186",
  accent: "#E8A33D",
  negative: "#E2574C",
};

function LogoMark({ size = 44 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx="20" cy="20" r="19" fill={COLORS.surface2} stroke={COLORS.accent} strokeWidth="1.4" />
      <circle cx="20" cy="20" r="15.5" fill="none" stroke={COLORS.accent} strokeWidth="0.6" opacity="0.5" />
      <text x="20" y="27" textAnchor="middle" fontFamily="'Space Grotesk', serif" fontSize="18" fontWeight="700" fill={COLORS.accent}>
        Z
      </text>
      <circle cx="20" cy="9.5" r="1.1" fill={COLORS.accent} />
    </svg>
  );
}

export default function Login({ onLoggedIn }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { token, user } = await login(email.trim(), password);
      setToken(token);
      onLoggedIn(user);
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ background: COLORS.bg, minHeight: 640, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter', sans-serif", color: COLORS.text, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
      <form onSubmit={submit} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 32, width: 320 }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 14 }}>
          <LogoMark size={48} />
        </div>
        <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 19, marginBottom: 4, textAlign: "center" }}>Zaira's Collection</div>
        <div style={{ fontSize: 12.5, color: COLORS.textFaint, marginBottom: 22, textAlign: "center" }}>Sign in to Munshi</div>

        <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Email</label>
        <input
          type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
          style={{ width: "100%", background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Password</label>
        <input
          type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
          style={{ width: "100%", background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: "9px 10px", borderRadius: 6, fontSize: 13, marginBottom: 14, boxSizing: "border-box" }}
        />

        {error && <div style={{ color: COLORS.negative, fontSize: 12, marginBottom: 12 }}>{error}</div>}

        <button
          type="submit" disabled={loading}
          style={{ width: "100%", background: COLORS.accent, color: "#241804", border: "none", padding: "10px 14px", borderRadius: 6, fontSize: 13.5, fontWeight: 600, cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1 }}
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
