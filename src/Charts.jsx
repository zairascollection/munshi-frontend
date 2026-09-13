// Every recharts-powered block lives here.
//
// recharts is ~150 KB gzipped — bigger than the rest of the app combined —
// and only two screens use it. Keeping it in this file lets App.jsx pull it
// in with React.lazy, so opening the POS or Inventory never pays for it.
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { COLORS, CHART_COLORS, fmt } from "./theme";

const tooltipStyle = {
  background: COLORS.surface2,
  border: `1px solid ${COLORS.border}`,
  borderRadius: 6,
  fontSize: 12,
};

const axisTick = { fill: COLORS.textFaint, fontSize: 11 };
const axisLine = { stroke: COLORS.border };
const shortNum = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : v);

export function RevenueProfitTrend({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderSoft} />
        <XAxis dataKey="date" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis tick={axisTick} axisLine={axisLine} tickLine={false} tickFormatter={shortNum} />
        <Tooltip contentStyle={tooltipStyle} labelStyle={{ color: COLORS.text }} formatter={(v) => fmt(v)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.info} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="profit" name="Profit" stroke={COLORS.positive} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function OrdersByStatus({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderSoft} />
        <XAxis dataKey="status" tick={axisTick} axisLine={axisLine} tickLine={false} />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={axisLine} tickLine={false} />
        <Tooltip contentStyle={tooltipStyle} />
        <Bar dataKey="count" radius={[4, 4, 0, 0]}>
          {data.map((s, idx) => <Cell key={s.status} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function StockByCategory({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="category" cx="50%" cy="50%" outerRadius={80} label={(e) => e.category}>
          {data.map((_, idx) => <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function DailyProfitTrend({ data }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.borderSoft} />
        <XAxis dataKey="date" tick={{ fill: COLORS.textFaint, fontSize: 10 }} axisLine={axisLine} tickLine={false} />
        <YAxis tick={{ fill: COLORS.textFaint, fontSize: 10 }} axisLine={axisLine} tickLine={false} tickFormatter={shortNum} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => fmt(v)} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Line type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.info} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="adSpend" name="Ad spend" stroke={COLORS.accent} strokeWidth={2} dot={false} />
        <Line type="monotone" dataKey="profit" name="Profit" stroke={COLORS.positive} strokeWidth={2} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
