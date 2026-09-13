// Shared palette and money formatter — imported by App.jsx and Charts.jsx.
export const COLORS = {
  bg: "#0F161F",
  surface: "#161F2A",
  surface2: "#1D2A38",
  border: "#26374A",
  borderSoft: "#1E2C3A",
  text: "#E9F0F6",
  textDim: "#8CA0B3",
  textFaint: "#5A7186",
  accent: "#E8A33D",
  accentDim: "#3A2F1C",
  positive: "#3FB68A",
  positiveDim: "#173A30",
  negative: "#E2574C",
  negativeDim: "#3A1E1C",
  info: "#5B9BD5",
  infoDim: "#1B2C3D",
};

export const CHART_COLORS = ["#E8A33D", "#5B9BD5", "#3FB68A", "#E2574C", "#9B7EDE", "#4FC3C7"];

export const fmt = (n) =>
  "Rs " + Math.round(Number(n) || 0).toLocaleString("en-PK");
