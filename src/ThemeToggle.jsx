import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { getTheme, setTheme } from "./theme";

// One tap switches Dark <-> Light; the choice is remembered on this device.
export default function ThemeToggle({ style }) {
  const [theme, setLocal] = useState(getTheme());
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      title={`Switch to ${next} mode`}
      onClick={() => { setTheme(next); setLocal(next); }}
      style={{
        width: "100%", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
        background: "transparent", color: "var(--mn-textDim)", border: "1px solid var(--mn-border)",
        padding: "8px 13px", borderRadius: 9, fontSize: 13, cursor: "pointer", fontFamily: "inherit", ...style,
      }}
    >
      {theme === "dark" ? <Sun size={13} /> : <Moon size={13} />}
      {theme === "dark" ? "Light mode" : "Dark mode"}
    </button>
  );
}
