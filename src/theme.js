// Shared palette and money formatter — imported by App.jsx, Login.jsx and Charts.jsx.
// Every colour is a CSS variable so Dark / Light can switch instantly with
// no re-render: the variables are defined below and swapped by data-theme.
const VARS = {
  dark: {
    bg: "#0F161F", surface: "#161F2A", surface2: "#1D2A38", border: "#26374A", borderSoft: "#1E2C3A",
    text: "#E9F0F6", textDim: "#8CA0B3", textFaint: "#5A7186",
    accent: "#E8A33D", accentDim: "#3A2F1C",
    positive: "#3FB68A", positiveDim: "#173A30",
    negative: "#E2574C", negativeDim: "#3A1E1C",
    info: "#5B9BD5", infoDim: "#1B2C3D",
    overlay: "rgba(0,0,0,0.55)",
  },
  light: {
    bg: "#F2F5F9", surface: "#FFFFFF", surface2: "#EDF1F6", border: "#D3DCE6", borderSoft: "#E4EAF1",
    text: "#14202B", textDim: "#4F6477", textFaint: "#7A8DA0",
    accent: "#C7860F", accentDim: "#FBEBD0",
    positive: "#1E8F67", positiveDim: "#D8F1E7",
    negative: "#CC3B30", negativeDim: "#FBE0DD",
    info: "#2F78C0", infoDim: "#DCEAF7",
    overlay: "rgba(20,32,43,0.35)",
  },
};

export const COLORS = Object.fromEntries(Object.keys(VARS.dark).map((k) => [k, `var(--mn-${k})`]));

export const CHART_COLORS = ["#E8A33D", "#5B9BD5", "#3FB68A", "#E2574C", "#9B7EDE", "#4FC3C7"];

const KEY = "munshi-theme";
const css = (t) => Object.entries(VARS[t]).map(([k, v]) => `--mn-${k}:${v};`).join("");

function injectStyles() {
  if (typeof document === "undefined" || document.getElementById("mn-theme-vars")) return;
  const el = document.createElement("style");
  el.id = "mn-theme-vars";
  el.textContent =
    `:root{${css("dark")}color-scheme:dark;}` +
    `:root[data-theme="light"]{${css("light")}color-scheme:light;}` +
    `body{background:var(--mn-bg);margin:0;transition:background .2s ease;}`;
  document.head.appendChild(el);
}

export function getTheme() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch { /* storage can be blocked — fall through */ }
  return "dark";
}

export function setTheme(t) {
  injectStyles();
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem(KEY, t); } catch { /* ignore */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", VARS[t].bg);
}

injectStyles();
if (typeof document !== "undefined") setTheme(getTheme());

export const fmt = (n) =>
  "Rs " + Math.round(Number(n) || 0).toLocaleString("en-PK");
