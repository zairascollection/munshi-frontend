import { useState, useEffect, useMemo, useCallback, useRef, Fragment, lazy, Suspense } from "react";
import {
  LayoutGrid, Boxes, Truck, Users, Wallet, Share2, Plus, Trash2,
  TrendingUp, TrendingDown, AlertTriangle, Search, X, ChevronRight,
  BarChart3, ImageIcon, ShieldCheck, User, Receipt, Minus, Printer, BookUser,
  Landmark, ScanLine, LogOut, RefreshCw, Pencil, Undo2, Megaphone,
  Settings as SettingsIcon, CalendarDays, FileText, History as HistoryIcon,
  MessageCircle, Truck as TruckIcon, PackagePlus, Factory, Menu, ShieldAlert, Check, Bell,
  PackageCheck, UserCheck,
} from "lucide-react";
import Login from "./Login";
import { COLORS, CHART_COLORS, fmt } from "./theme";
import { initialFormValues, diffForSync, createPayload, REMOVE_FILE, isTempId } from "./sync";

// recharts is loaded on demand — only the two screens that draw charts pay
// for it, and the rest of the app starts without waiting on 150 KB.
const RevenueProfitTrend = lazy(() => import("./Charts").then((m) => ({ default: m.RevenueProfitTrend })));
const OrdersByStatus = lazy(() => import("./Charts").then((m) => ({ default: m.OrdersByStatus })));
const StockByCategory = lazy(() => import("./Charts").then((m) => ({ default: m.StockByCategory })));
const DailyProfitTrend = lazy(() => import("./Charts").then((m) => ({ default: m.DailyProfitTrend })));

// Shown for the fraction of a second while the chart bundle arrives.
function ChartFallback() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textFaint, fontSize: 12.5 }}>
      Chart load ho raha hai...
    </div>
  );
}
import {
  api, getToken, setToken, me, syncWooCommerce, createUser, listUsers, removeUser,
  changePassword, sendLowStockAlert, getAuditLog, getAuditPeople,
  returnOrder, getSettings, saveSettings, getAnalytics, getMonthlySheet, getSavedSheets,
  listCustomers, customerRisk, saveCustomer,
  listPurchases, getPurchase, createPurchase, receivePurchase, removePurchase,
  whatsappHealth, sendConfirmation, sendConfirmationBulk, setConfirmationStatus, sendDigestNow,
  pushStockToWebsite, API_BASE_URL,
  listPayments, addPayment, removePayment, undoReturn,
  listConsignments, getConsignment, createConsignment, settleConsignment, removeConsignment, listSellers,
  backupStatus, downloadBackup, restoreBackup,
} from "./api";



const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const todayISO = () => new Date().toISOString().slice(0, 10);

const paymentStatusOf = (o) => {
  const paid = Number(o.amountPaid || 0);
  const total = Number(o.sell || 0);
  if (total <= 0) return "Pending";
  if (paid >= total) return "Paid";
  if (paid > 0) return "Partial";
  return "Pending";
};
const amountDueOf = (o) => Math.max(0, Number(o.sell || 0) - Number(o.amountPaid || 0));

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutGrid, ownerOnly: false },
  { id: "pos", label: "POS / Billing", icon: Receipt, ownerOnly: false },
  { id: "inventory", label: "Inventory", icon: Boxes, ownerOnly: false },
  { id: "orders", label: "Orders & parcels", icon: Truck, ownerOnly: false },
  { id: "customers", label: "Customers", icon: BookUser, ownerOnly: false },
  { id: "employees", label: "Employees", icon: Users, ownerOnly: false },
  { id: "returns", label: "Returns", icon: Undo2, ownerOnly: false },
  { id: "consignments", label: "Stock diya hua", icon: PackageCheck, ownerOnly: false },
  { id: "reports", label: "Reports", icon: BarChart3, ownerOnly: false },
  { id: "profit", label: "Profit tracker", icon: TrendingUp, ownerOnly: true, managerOk: true },
  { id: "monthly", label: "Monthly sheet", icon: CalendarDays, ownerOnly: true, managerOk: true },
  { id: "adspend", label: "Ad spend", icon: Megaphone, ownerOnly: true, managerOk: true },
  { id: "purchases", label: "Purchases", icon: PackagePlus, ownerOnly: true, managerOk: true },
  { id: "suppliers", label: "Suppliers", icon: Factory, ownerOnly: true, managerOk: true },
  { id: "finance", label: "Finance", icon: Wallet, ownerOnly: true, managerOk: true },
  { id: "accounts", label: "Accounts", icon: Landmark, ownerOnly: true },
  { id: "expenses", label: "Expenses", icon: TrendingDown, ownerOnly: true, managerOk: true },
  { id: "affiliates", label: "Affiliates", icon: Share2, ownerOnly: true, managerOk: true },
  { id: "team", label: "Team", icon: Users, ownerOnly: true },
  { id: "settings", label: "Cost settings", icon: SettingsIcon, ownerOnly: true },
  { id: "history", label: "Change history", icon: HistoryIcon, ownerOnly: true },
];

// Sidebar sections — with 15 screens a flat list is hard to scan, so the
// nav is grouped by what you're actually trying to do.
const NAV_SECTIONS = [
  { title: "Daily kaam", ids: ["dashboard", "pos", "inventory", "orders", "returns", "customers"] },
  { title: "Stock aana / jana", ids: ["purchases", "suppliers", "consignments"] },
  { title: "Paisa", ids: ["profit", "monthly", "reports", "finance", "accounts", "expenses", "adspend"] },
  { title: "Log & settings", ids: ["employees", "affiliates", "team", "settings", "history"] },
];


// Mirrors the server: managers can delete too, and every delete is written
// to the change history under their name.
const canDelete = (role) => role === "owner" || role === "manager";

const accountName = (accounts, id) => ((accounts || []).find((a) => a.id === id) || {}).name || "—";

// Phone/tablet detection. The whole app was built desktop-first, so
// instead of rewriting every screen the layout switches to a slide-over
// sidebar and tables get horizontal scroll wrappers below this width.
function useIsMobile(breakpoint = 820) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
}

// Resources fetched on login. Owner-only ones are skipped for staff
// (the backend would 403 them anyway — no point making the calls).
const OWNER_ONLY_KEYS = new Set(["accounts"]);
const MANAGER_OK_KEYS = new Set(["expenses", "affiliates", "ad-spend", "suppliers"]);
const ALL_KEYS = ["inventory", "orders", "employees", "affiliates", "accounts", "expenses", "ad-spend", "suppliers"];

export default function App() {
  const [user, setUser] = useState(null); // { id, name, email, role } once logged in
  const [authChecked, setAuthChecked] = useState(false);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState("dashboard");
  const [data, setData] = useState({ inventory: [], orders: [], employees: [], affiliates: [], accounts: [], expenses: [], "ad-spend": [], suppliers: [] });
  const [settings, setSettings] = useState({ default_delivery_charge: 0, default_return_charge: 0, cash_handling_pct: 0, tax_pct: 0, packaging_cost: 0 });
  const [toast, setToast] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  // Queue of list changes waiting to be pushed to the server — see update().
  const pendingSync = useRef([]);

  // Failure messages stay up much longer than confirmations. A "save nahi
  // hua" that disappears in two seconds is worse than no message at all —
  // the item looks saved and is gone after the next refresh.
  const toastTimer = useRef(null);
  const notify = (msg) => {
    const isError = /nahi|fail|error|nhi|couldn't|khali|maujood|qabool/i.test(String(msg || ""));
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), isError ? 8000 : 2200);
  };

  // Restore session from a saved token on page load.
  useEffect(() => {
    (async () => {
      const token = getToken();
      if (token) {
        try {
          const { user: u } = await me();
          setUser(u);
        } catch {
          setToken(null); // token expired/invalid
        }
      }
      setAuthChecked(true);
    })();
  }, []);

  // Inventory and orders drive the dashboard, POS and the first few tabs.
  // Everything else can arrive a moment later without anyone noticing.
  const PRIMARY_KEYS = ["inventory", "orders"];

  const loadAll = useCallback(async (role) => {
    const keys = ALL_KEYS.filter((k) => role === "owner" || (role === "manager" && !OWNER_ONLY_KEYS.has(k)) || (!OWNER_ONLY_KEYS.has(k) && !MANAGER_OK_KEYS.has(k)));
    const primary = keys.filter((k) => PRIMARY_KEYS.includes(k));
    const rest = keys.filter((k) => !PRIMARY_KEYS.includes(k));

    const apply = (ks, results) => setData((d) => {
      const next = { ...d };
      ks.forEach((k, i) => { next[k] = results[i]; });
      return next;
    });

    // Fire every request at once — the second group isn't waiting on the
    // first, we just stop blocking the screen once the first group lands.
    const restPromise = Promise.all(rest.map((k) => api.list(k).catch(() => [])));
    const primaryResults = await Promise.all(primary.map((k) => api.list(k).catch(() => [])));
    apply(primary, primaryResults);
    setReady(true);

    apply(rest, await restPromise);
  }, []);

  useEffect(() => {
    if (user) loadAll(user.role);
  }, [user, loadAll]);

  // COD charge defaults — read by everyone so POS/Orders can pre-fill them.
  useEffect(() => {
    if (!user) return;
    getSettings().then(setSettings).catch(() => {});
  }, [user]);

  const role = user?.role || "staff";
  const logout = () => { setToken(null); setUser(null); };

  // Diff-based sync: apply the same list-transform functions the UI already
  // uses (add/edit/delete via array ops), then push whatever changed to the
  // API in the background. Keeps every downstream component's code exactly
  // as it was in the window.storage version — only this function changed.
  // The server calls happen OUTSIDE the state updater. React may run an
  // updater more than once for a single change, and doing the saving in
  // there meant a double-click could fire two creates or two deletes.
  const update = (key, fn) => {
    setData((d) => {
      const oldList = d[key] || [];
      const newList = fn(oldList);
      pendingSync.current.push({ key, oldList, newList });
      return { ...d, [key]: newList };
    });
  };

  // Drains whatever the last render queued, once, after it has committed.
  useEffect(() => {
    if (pendingSync.current.length === 0) return;
    const queued = pendingSync.current;
    pendingSync.current = [];
    queued.forEach(({ key, oldList, newList }) => reconcile(key, oldList, newList));
  });

  const reconcile = (key, oldList, newList) => {
    const oldIds = new Set(oldList.map((x) => x.id));
    const newIds = new Set(newList.map((x) => x.id));

    oldList.forEach((item) => {
      if (!newIds.has(item.id)) {
        // A row whose create never succeeded only exists on screen, so
        // there is nothing on the server to delete.
        if (isTempId(item.id)) return;
        api.remove(key, item.id).catch((err) => {
          notify(`Delete nahi hua: ${err.message}`);
          // Put it back rather than leaving the screen showing something
          // that still exists on the server.
          setData((d) => ({ ...d, [key]: [...(d[key] || []), item] }));
        });
      }
    });

    newList.forEach((item) => {
      if (!oldIds.has(item.id)) {
        const tempId = item.id;
        api.create(key, createPayload(item))
          .then((created) => {
            setData((d) => ({
              ...d,
              [key]: d[key].map((x) => (x.id === tempId ? { ...x, ...created } : x)),
            }));
          })
          .catch((err) => {
            notify(`Save nahi hua: ${err.message}`);
            // Take the row back off the screen. Leaving it there is worse
            // than losing it: the shopkeeper thinks it is saved, and every
            // later edit or delete silently does nothing.
            setData((d) => ({ ...d, [key]: (d[key] || []).filter((x) => x.id !== tempId) }));
          });
      } else {
        const before = oldList.find((x) => x.id === item.id);
        if (!before) return;
        // Only what actually changed goes to the server — see src/sync.js.
        const patch = diffForSync(before, item);
        if (Object.keys(patch).length > 0) {
          api.update(key, item.id, patch).catch((err) => notify(`Couldn't update: ${err.message}`));
        }
      }
    });
  };

  const runSync = async () => {
    setSyncing(true);
    try {
      const res = await syncWooCommerce();
      notify(
        res.affiliates && !res.affiliates.skipped
          ? `Synced ${res.ordersSynced} order(s), ${res.affiliates.synced} affiliate(s)`
          : `Synced ${res.ordersSynced} order(s) from WooCommerce`
      );
      await loadAll(role);
    } catch (err) {
      notify(`Sync failed: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => { setNavOpen(false); }, [tab]);

  useEffect(() => {
    const item = NAV.find((n) => n.id === tab);
    if (item && item.ownerOnly && !(role === "owner" || (item.managerOk && role === "manager"))) setTab("dashboard");
  }, [role, tab]);

  const metrics = useMemo(() => {
    const activeOrders = data.orders.filter((o) => o.status !== "Returned");
    const revenue = activeOrders.reduce((s, o) => s + Number(o.sell || 0), 0);
    const cogs = activeOrders.reduce((s, o) => s + Number(o.cost || 0), 0);
    const grossProfit = revenue - cogs;
    const salaries = data.employees.reduce((s, e) => s + Number(e.salary || 0), 0);
    const commissions = data.affiliates.reduce((s, a) => s + Number(a.commission || 0), 0);
    const totalExpenses = (data.expenses || []).reduce((s, x) => s + Number(x.amount || 0), 0);
    const netProfit = grossProfit - salaries - commissions - totalExpenses;
    const totalBalance = (data.accounts || []).reduce((s, a) => s + Number(a.balance || 0), 0);
    const receivable = data.orders
      .filter((o) => o.status !== "Returned")
      .reduce((s, o) => s + amountDueOf(o), 0);
    const payable =
      data.employees.filter((e) => e.status === "Pending").reduce((s, e) => s + Number(e.salary || 0), 0) +
      data.affiliates.filter((a) => a.payment === "Pending").reduce((s, a) => s + Number(a.commission || 0), 0);
    // Only items the owner opted into — see the "Low stock alert" checkbox.
    const lowStock = data.inventory.filter((i) => i.alertEnabled && Number(i.quantity) <= Number(i.reorder));
    const activeParcels = data.orders.filter((o) => o.status === "Pending" || o.status === "Shipped").length;
    const stockInvestment = data.inventory.reduce((s, i) => s + Number(i.cost || 0) * Number(i.quantity || 0), 0);
    const stockSaleValue = data.inventory.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
    const stockUnits = data.inventory.reduce((s, i) => s + Number(i.quantity || 0), 0);
    return { revenue, cogs, grossProfit, salaries, commissions, totalExpenses, netProfit, receivable, payable, lowStock, activeParcels, totalBalance, stockInvestment, stockSaleValue, stockUnits };
  }, [data]);

  if (!authChecked) {
    return (
      <div style={{ background: COLORS.bg, minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontFamily: "Inter, sans-serif" }}>
        Loading Munshi...
      </div>
    );
  }

  if (!user) {
    return <Login onLoggedIn={setUser} />;
  }

  if (!ready) {
    return (
      <div style={{ background: COLORS.bg, minHeight: 500, display: "flex", alignItems: "center", justifyContent: "center", color: COLORS.textDim, fontFamily: "Inter, sans-serif" }}>
        Loading your data...
      </div>
    );
  }

  return (
    <div style={{ background: COLORS.bg, minHeight: isMobile ? "100vh" : 640, display: "flex", fontFamily: "'Inter', sans-serif", color: COLORS.text, borderRadius: isMobile ? 0 : 10, overflow: "hidden", border: isMobile ? "none" : `1px solid ${COLORS.border}` }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        .mn-num { font-family: 'Space Grotesk', sans-serif; }
        .mn-scroll::-webkit-scrollbar { width: 8px; height: 8px; }
        .mn-scroll::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 4px; }
        .mn-input {
          background: ${COLORS.surface2}; border: 1px solid ${COLORS.border}; color: ${COLORS.text};
          padding: 8px 10px; border-radius: 6px; font-size: 13px; font-family: inherit; width: 100%;
        }
        .mn-input:focus { outline: none; border-color: ${COLORS.accent}; }
        .mn-btn {
          display: inline-flex; align-items: center; gap: 6px; background: ${COLORS.accent}; color: #241804;
          border: none; padding: 8px 14px; border-radius: 6px; font-size: 13px; font-weight: 600; cursor: pointer;
          font-family: inherit;
        }
        .mn-btn:hover { filter: brightness(1.08); }
        .mn-btn-ghost {
          display: inline-flex; align-items: center; gap: 6px; background: transparent; color: ${COLORS.textDim};
          border: 1px solid ${COLORS.border}; padding: 7px 12px; border-radius: 6px; font-size: 13px; cursor: pointer;
          font-family: inherit;
        }
        .mn-btn-ghost:hover { color: ${COLORS.text}; border-color: ${COLORS.textDim}; }
        .mn-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .mn-table th { text-align: left; color: ${COLORS.textFaint}; font-weight: 500; font-size: 11.5px; letter-spacing: 0.02em; padding: 0 12px 8px; border-bottom: 1px solid ${COLORS.border}; }
        .mn-table td { padding: 11px 12px; border-bottom: 1px solid ${COLORS.borderSoft}; }
        .mn-table tr:last-child td { border-bottom: none; }
        select.mn-input { appearance: none; }
        .mn-spin { animation: mn-spin 1s linear infinite; }
        @keyframes mn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

        /* --- Mobile --- the app was built desktop-first, so on small
           screens tables scroll sideways instead of squashing, grids
           collapse to one column, and the sidebar becomes a drawer. */
        .mn-tablewrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        @media (max-width: 820px) {
          .mn-table { font-size: 12.5px; min-width: 560px; }
          .mn-table th, .mn-table td { padding: 9px 8px; white-space: nowrap; }
          .mn-grid-2 { grid-template-columns: 1fr !important; }
          .mn-pad { padding: 14px 14px !important; }
          .mn-btn, .mn-btn-ghost { padding: 9px 12px; }
          .mn-input { font-size: 16px; } /* stops iOS zooming in on focus */
        }

        /* Printing used to send the whole app to the printer — sidebar,
           navigation and buttons around a small slip. Only the receipt
           prints now, on white paper, with the photos kept. */
        @media print {
          body * { visibility: hidden; }
          .mn-receipt, .mn-receipt * { visibility: visible; }
          .mn-receipt {
            position: absolute; left: 0; top: 0; width: 100%;
            max-width: none !important;
          }
          /* The on-screen slip is light text on a dark card. Inline styles
             set those colours per element, so they have to be overridden
             one by one or the bill prints white-on-white. */
          .mn-receipt, .mn-receipt * { color: #000 !important; }
          .mn-receipt > div {
            background: #fff !important; border: none !important; padding: 0 !important;
          }
          .mn-receipt img { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .mn-noprint { display: none !important; }
        }
      `}</style>

      {isMobile ? (
        navOpen && (
          <>
            <div
              onClick={() => setNavOpen(false)}
              style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 40 }}
            />
            <div style={{ position: "fixed", top: 0, bottom: 0, left: 0, zIndex: 41, display: "flex" }}>
              <Sidebar tab={tab} setTab={setTab} metrics={metrics} role={role} user={user} onLogout={logout} onSync={runSync} syncing={syncing} onChangePassword={() => setChangingPw(true)} />
            </div>
          </>
        )
      ) : (
        <Sidebar tab={tab} setTab={setTab} metrics={metrics} role={role} user={user} onLogout={logout} onSync={runSync} syncing={syncing} onChangePassword={() => setChangingPw(true)} />
      )}

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <TopBar tab={tab} role={role} isMobile={isMobile} onMenu={() => setNavOpen(true)} />
        <div className="mn-scroll mn-pad" style={{ flex: 1, overflowY: "auto", padding: isMobile ? "16px 14px" : "24px 28px" }}>
          {tab === "dashboard" && <Dashboard data={data} metrics={metrics} setTab={setTab} role={role} notify={notify} />}
          {tab === "pos" && <POS data={data} update={update} notify={notify} user={user} role={role} />}
          {tab === "inventory" && <Inventory items={data.inventory} update={(fn) => update("inventory", fn)} notify={notify} role={role} />}
          {tab === "orders" && <Orders orders={data.orders} accounts={data.accounts || []} update={(fn) => update("orders", fn)} updateAccounts={(fn) => update("accounts", fn)} notify={notify} role={role} user={user} settings={settings} reload={() => loadAll(role)} />}
          {tab === "returns" && <Returns orders={data.orders} notify={notify} role={role} settings={settings} reload={() => loadAll(role)} />}
          {tab === "consignments" && <Consignments inventory={data.inventory} affiliates={data.affiliates || []} orders={data.orders} notify={notify} role={role} reload={() => loadAll(role)} />}
          {tab === "customers" && <Customers orders={data.orders} notify={notify} role={role} />}
          {tab === "employees" && <Employees employees={data.employees} accounts={data.accounts || []} update={(fn) => update("employees", fn)} updateAccounts={(fn) => update("accounts", fn)} notify={notify} role={role} />}
          {tab === "reports" && <Reports data={data} role={role} />}
          {tab === "profit" && (role === "owner" || role === "manager") && <ProfitTracker notify={notify} />}
          {tab === "monthly" && (role === "owner" || role === "manager") && <MonthlySheet notify={notify} />}
          {tab === "adspend" && (role === "owner" || role === "manager") && <AdSpend rows={data["ad-spend"] || []} update={(fn) => update("ad-spend", fn)} notify={notify} role={role} />}
          {tab === "suppliers" && (role === "owner" || role === "manager") && <Suppliers suppliers={data.suppliers || []} update={(fn) => update("suppliers", fn)} notify={notify} role={role} />}
          {tab === "purchases" && (role === "owner" || role === "manager") && <Purchases suppliers={data.suppliers || []} inventory={data.inventory} notify={notify} role={role} reload={() => loadAll(role)} />}
          {tab === "finance" && (role === "owner" || role === "manager") && <Finance data={data} metrics={metrics} />}
          {tab === "accounts" && role === "owner" && <Accounts accounts={data.accounts || []} update={(fn) => update("accounts", fn)} notify={notify} />}
          {tab === "expenses" && (role === "owner" || role === "manager") && <Expenses expenses={data.expenses || []} accounts={data.accounts || []} update={(fn) => update("expenses", fn)} updateAccounts={(fn) => update("accounts", fn)} notify={notify} />}
          {tab === "affiliates" && (role === "owner" || role === "manager") && <Affiliates affiliates={data.affiliates} accounts={data.accounts || []} update={(fn) => update("affiliates", fn)} updateAccounts={(fn) => update("accounts", fn)} notify={notify} />}
          {tab === "team" && role === "owner" && <Team notify={notify} currentUserId={user.id} />}
          {tab === "settings" && role === "owner" && <CostSettings settings={settings} onSaved={setSettings} notify={notify} />}
          {tab === "history" && role === "owner" && <AuditLogPanel notify={notify} />}
        </div>
      </div>

      {changingPw && <ChangePasswordForm onClose={() => setChangingPw(false)} notify={notify} />}

      {toast && (
        <div
          onClick={() => setToast(null)} title="Band karein"
          style={{ position: "absolute", bottom: 20, right: 20, maxWidth: 340, cursor: "pointer", background: COLORS.surface2, border: `1px solid ${COLORS.border}`, color: COLORS.text, padding: "10px 16px", borderRadius: 8, fontSize: 13, zIndex: 60 }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function Sidebar({ tab, setTab, metrics, role, user, onLogout, onSync, syncing, onChangePassword }) {
  const alerts = metrics.lowStock.length;
  const visibleNav = NAV.filter((n) => !n.ownerOnly || role === "owner" || (n.managerOk && role === "manager"));
  return (
    <div style={{ width: 208, background: COLORS.surface, borderRight: `1px solid ${COLORS.border}`, padding: "20px 14px", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "0 8px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
        <LogoMark size={34} />
        <div>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17, color: COLORS.text, lineHeight: 1.2 }}>Zaira's Collection</div>
          <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 2 }}>Business Manager</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: "8px 10px", marginBottom: 4 }}>
        {role === "owner" ? <ShieldCheck size={14} color={COLORS.accent} /> : <User size={14} color={COLORS.info} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{user?.name}</div>
          <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>{role === "owner" ? "Owner" : role === "manager" ? "Manager" : "Staff"}</div>
        </div>
        <button onClick={onLogout} title="Log out" style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer", padding: 2 }}>
          <LogOut size={14} />
        </button>
      </div>
      <button onClick={onChangePassword} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer", fontSize: 11, textAlign: "left", padding: "2px 8px 12px", textDecoration: "underline" }}>
        Change password
      </button>
      {role === "owner" && (
        <button
          onClick={onSync} disabled={syncing} className="mn-btn-ghost"
          style={{ width: "100%", justifyContent: "center", marginBottom: 18, opacity: syncing ? 0.6 : 1 }}
        >
          <RefreshCw size={13} className={syncing ? "mn-spin" : ""} /> {syncing ? "Syncing..." : "Sync WooCommerce"}
        </button>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }} className="mn-scroll">
        {NAV_SECTIONS.map((section) => {
          const items = section.ids.map((id) => visibleNav.find((n) => n.id === id)).filter(Boolean);
          if (items.length === 0) return null;
          return (
            <Fragment key={section.title}>
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: COLORS.textFaint, padding: "12px 10px 5px" }}>
                {section.title}
              </div>
              {items.map((n) => {
                const Icon = n.icon;
                const active = tab === n.id;
                const showAlert = n.id === "inventory" && alerts > 0;
                return (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 7,
                      background: active ? COLORS.surface2 : "transparent",
                      border: "none", cursor: "pointer", textAlign: "left", width: "100%",
                      color: active ? COLORS.text : COLORS.textDim, fontSize: 13, fontFamily: "inherit",
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    <Icon size={15} style={{ flexShrink: 0, color: active ? COLORS.accent : COLORS.textFaint }} />
                    <span style={{ flex: 1 }}>{n.label}</span>
                    {showAlert && (
                      <span style={{ background: COLORS.negative, color: "#fff", fontSize: 10.5, fontWeight: 600, borderRadius: 10, padding: "1px 6px" }}>
                        {alerts}
                      </span>
                    )}
                  </button>
                );
              })}
            </Fragment>
          );
        })}
      </div>
      <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11.5, color: COLORS.textFaint }}>
        {role === "staff" ? "Staff view — finance & profit hidden." : role === "manager" ? "Manager view — no delete, no Team/Accounts." : "Owner view — full access."} Data saves automatically.
      </div>
    </div>
  );
}

function TopBar({ tab, role, isMobile, onMenu }) {
  const label = NAV.find((n) => n.id === tab)?.label || "";
  const date = new Date().toLocaleDateString("en-GB", isMobile
    ? { day: "numeric", month: "short" }
    : { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <div style={{ padding: isMobile ? "13px 14px" : "18px 28px", borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {isMobile && (
          <button onClick={onMenu} aria-label="Menu" style={{ background: "none", border: "none", color: COLORS.text, cursor: "pointer", padding: 2, display: "flex" }}>
            <Menu size={20} />
          </button>
        )}
        <h2 style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: isMobile ? 16 : 19, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</h2>
        <Badge text={role === "owner" ? "Owner view" : role === "manager" ? "Manager view" : "Staff view"} tone={role === "owner" ? "accent" : "info"} />
      </div>
      <span style={{ fontSize: 12.5, color: COLORS.textFaint, whiteSpace: "nowrap" }}>{date}</span>
    </div>
  );
}

function StatCard({ label, value, sub, tone }) {
  const toneColor = tone === "positive" ? COLORS.positive : tone === "negative" ? COLORS.negative : COLORS.text;
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: "16px 18px" }}>
      <div style={{ fontSize: 12, color: COLORS.textDim, marginBottom: 8 }}>{label}</div>
      <div className="mn-num" style={{ fontSize: 23, fontWeight: 600, color: toneColor }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Badge({ text, tone }) {
  const map = {
    positive: [COLORS.positiveDim, COLORS.positive],
    negative: [COLORS.negativeDim, COLORS.negative],
    info: [COLORS.infoDim, COLORS.info],
    accent: [COLORS.accentDim, COLORS.accent],
  };
  const [bg, fg] = map[tone] || [COLORS.surface2, COLORS.textDim];
  return (
    <span style={{ background: bg, color: fg, fontSize: 11.5, fontWeight: 600, padding: "3px 9px", borderRadius: 5, whiteSpace: "nowrap" }}>
      {text}
    </span>
  );
}

const orderStatusTone = { Pending: "accent", Shipped: "info", Delivered: "positive", Returned: "negative" };
const paymentTone = { Paid: "positive", Partial: "accent", Pending: "negative" };

function Dashboard({ data, metrics, setTab, role, notify }) {
  const recentOrders = [...data.orders].slice(-5).reverse();
  const isOwner = role === "owner";
  const [sendingAlert, setSendingAlert] = useState(false);

  const handleSendAlert = async () => {
    setSendingAlert(true);
    try {
      const res = await sendLowStockAlert();
      notify(res.sent ? `Alert sent (${res.count} item${res.count > 1 ? "s" : ""})` : res.reason || "Not sent");
    } catch (err) {
      notify(`Couldn't send alert: ${err.message}`);
    } finally {
      setSendingAlert(false);
    }
  };
  const isManagerOrAbove = role === "owner" || role === "manager";
  // One-tap shortcuts for the five things done most often, so nobody has
  // to hunt through the sidebar for routine work.
  const quickActions = [
    { id: "pos", label: "Nayi sale", icon: Receipt },
    { id: "inventory", label: "Stock add", icon: Boxes },
    { id: "returns", label: "Return record", icon: Undo2 },
    ...(isManagerOrAbove ? [{ id: "profit", label: "Aaj ka munafa", icon: TrendingUp }] : []),
    ...(isManagerOrAbove ? [{ id: "monthly", label: "Monthly sheet", icon: CalendarDays }] : []),
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {quickActions.map((q) => {
          const Icon = q.icon;
          return (
            <button key={q.id} className="mn-btn-ghost" onClick={() => setTab(q.id)} style={{ fontSize: 12.5 }}>
              <Icon size={14} /> {q.label}
            </button>
          );
        })}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Total revenue" value={fmt(metrics.revenue)} />
        <StatCard label="Net profit" value={fmt(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "positive" : "negative"} />
        <StatCard label="Cash & bank balance" value={fmt(metrics.totalBalance)} sub="Across all accounts" />
        <StatCard label="Pending to receive" value={fmt(metrics.receivable)} tone="negative" sub="From customers" />
        <StatCard label="Pending to pay" value={fmt(metrics.payable)} tone="negative" sub="Salaries + commissions" />
        <StatCard label="Active parcels" value={metrics.activeParcels} sub="In transit or pending" />
        <StatCard label="Low stock items" value={metrics.lowStock.length} tone={metrics.lowStock.length ? "negative" : undefined} />
        <StatCard label="Stock investment" value={fmt(metrics.stockInvestment)} sub={`${metrics.stockUnits} units at cost price`} />
        {isManagerOrAbove && <StatCard label="Stock value at sale price" value={fmt(metrics.stockSaleValue)} sub="If everything sells" />}
      </div>

      <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Recent orders" action={() => setTab("orders")} />
          {recentOrders.length === 0 ? (
            <EmptyRow text="No orders yet." />
          ) : (
            <div className="mn-tablewrap"><table className="mn-table">
              <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th>Payment</th></tr></thead>
              <tbody>
                {recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{o.orderNo}</td>
                    <td>{o.customer}</td>
                    <td className="mn-num">{fmt(o.sell)}</td>
                  {/* Cost is what the goods cost — POS copies it from each
                      item's real cost in inventory when the bill is made.
                      Profit also subtracts the courier and return money,
                      so a returned parcel shows the loss it actually was. */}
                  {isManagerOrAbove && <td className="mn-num" style={{ color: COLORS.textDim }}>{fmt(o.cost)}</td>}
                  {isManagerOrAbove && (() => {
                    const returned = o.status === "Returned";
                    const profit = returned
                      ? -(Number(o.deliveryCharge || 0) + Number(o.returnCharge || 0) + Number(o.refundAmount || 0))
                      : Number(o.sell || 0) - Number(o.cost || 0) - Number(o.deliveryCharge || 0);
                    const margin = !returned && Number(o.sell) > 0 ? Math.round((profit / Number(o.sell)) * 100) : null;
                    return (
                      <td className="mn-num" style={{ color: profit >= 0 ? COLORS.positive : COLORS.negative }}>
                        {fmt(profit)}
                        {margin !== null && <span style={{ color: COLORS.textFaint, fontSize: 11 }}> · {margin}%</span>}
                      </td>
                    );
                  })()}
                    <td><Badge text={o.status} tone={orderStatusTone[o.status]} /></td>
                    <td><Badge text={paymentStatusOf(o)} tone={paymentTone[paymentStatusOf(o)]} /></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          )}
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <SectionHeading title="Low stock alerts" action={() => setTab("inventory")} />
            {isOwner && metrics.lowStock.length > 0 && (
              <button className="mn-btn-ghost" disabled={sendingAlert} onClick={handleSendAlert} style={{ fontSize: 11, padding: "5px 9px" }}>
                {sendingAlert ? "Sending..." : "Send alert (WhatsApp/SMS)"}
              </button>
            )}
          </div>
          {metrics.lowStock.length === 0 ? (
            <EmptyRow text="Sab kuch stock mein hai." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {metrics.lowStock.map((i) => (
                <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <AlertTriangle size={14} color={COLORS.negative} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1 }}>{i.name}</span>
                  <span className="mn-num" style={{ color: COLORS.negative }}>{i.quantity} left</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, action, actionLabel }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
      <h3 style={{ fontSize: 14.5, fontWeight: 600, margin: 0 }}>{title}</h3>
      {action && (
        <button onClick={action} style={{ background: "none", border: "none", color: COLORS.textFaint, fontSize: 12, display: "flex", alignItems: "center", gap: 2, cursor: "pointer", fontFamily: "inherit" }}>
          {actionLabel || "View all"} <ChevronRight size={13} />
        </button>
      )}
    </div>
  );
}

function EmptyRow({ text }) {
  return <div style={{ color: COLORS.textFaint, fontSize: 13, padding: "20px 0", textAlign: "center" }}>{text}</div>;
}

function Panel({ title, count, onAdd, addLabel, children, extra }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: COLORS.textDim }}>{count}</div>
        <div style={{ display: "flex", gap: 8 }}>
          {extra}
          {onAdd && <button className="mn-btn" onClick={onAdd}><Plus size={14} /> {addLabel}</button>}
        </div>
      </div>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function LogoMark({ size = 36 }) {
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

function AddForm({ fields, onCancel, onSave, title, initialValues, footer }) {
  const [vals, setVals] = useState(() => initialFormValues(fields, initialValues));
  const set = (k, v) => setVals((s) => ({ ...s, [k]: v }));
  const submit = () => {
    for (const f of fields) {
      if (f.required && !String(vals[f.key]).trim()) return;
    }
    onSave(vals);
  };

  // Resizes/compresses the picked image in the browser and turns it into a
  // base64 data URL, which is stored directly in the existing `image` text
  // column — no file storage server needed for a small product catalog.
  const handleImageFile = (key, file) => {
    if (!file) return;
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const maxDim = 420;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        set(key, canvas.toDataURL("image/jpeg", 0.72));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ padding: 18, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10 }}>
        {fields.map((f) => (
          <div key={f.key}>
            <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>{f.label}</label>
            {f.type === "combo" ? (
              <ComboField
                value={vals[f.key]} options={f.options} placeholder={f.placeholder}
                onChange={(v) => set(f.key, v)}
              />
            ) : f.type === "seller" ? (
              <SellerPicker
                label={null} compact
                value={vals[f.key]} type={vals[f.typeKey || "soldByType"]}
                onChange={(name, kind) => setVals((v) => ({ ...v, [f.key]: name, [f.typeKey || "soldByType"]: kind }))}
              />
            ) : f.type === "checkbox" ? (
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: COLORS.textDim, paddingTop: 6 }}>
                <input
                  type="checkbox"
                  checked={Boolean(vals[f.key])}
                  onChange={(e) => setVals((v) => ({ ...v, [f.key]: e.target.checked }))}
                />
                {f.hint || "Haan"}
              </label>
            ) : f.type === "select" ? (
              <select className="mn-input" value={vals[f.key]} onChange={(e) => set(f.key, e.target.value)}>
                {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : f.type === "file" ? (
              (() => {
                const removed = vals[f.key] === REMOVE_FILE;
                const preview = removed ? null : (vals[f.key] || initialValues?.image || initialValues?.imageUrl);
                const hasPhoto = Boolean(preview);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <Thumb url={preview} size={44} />
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <input
                        type="file" accept="image/*"
                        onChange={(e) => handleImageFile(f.key, e.target.files[0])}
                        style={{ fontSize: 11, color: COLORS.textDim, maxWidth: 130 }}
                      />
                      {hasPhoto && (
                        <button
                          type="button"
                          onClick={() => set(f.key, REMOVE_FILE)}
                          style={{ background: "none", border: "none", color: COLORS.negative, cursor: "pointer", fontSize: 11, padding: 0, textAlign: "left", fontFamily: "inherit" }}
                        >
                          Tasveer hatayein
                        </button>
                      )}
                      {removed && (
                        <span style={{ fontSize: 10.5, color: COLORS.textFaint }}>
                          Save karne par tasveer hat jayegi
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()
            ) : (
              <input
                className="mn-input"
                type={f.type || "text"}
                value={vals[f.key]}
                placeholder={f.placeholder || ""}
                onChange={(e) => set(f.key, e.target.value)}
              />
            )}
          </div>
        ))}
      </div>
      {footer && footer(vals)}
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={submit}>Save</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Pick from what already exists, or press + to type a new one.
//
// Typing a category by hand every time produced "Winter", "winter" and
// "Winer" as three separate categories, which then split the reports. The
// list is built from what is actually in the data, so it stays correct
// without anyone maintaining it.
// Seed list for a brand-new shop with nothing in stock yet. Once items
// exist, their own categories are merged in and this stops mattering.
const DEFAULT_CATEGORIES = ["Unstitched", "Stitched", "Best Sellers", "New Arrivals", "Summer", "Winter", "Sale"];

function ComboField({ value, options, onChange, placeholder }) {
  const known = [...new Set((options || []).filter(Boolean).map((o) => String(o).trim()))]
    .sort((a, b) => a.localeCompare(b));
  // A value that is not in the list means it was just typed — stay in
  // typing mode so it is not silently dropped.
  const [creating, setCreating] = useState(Boolean(value) && !known.includes(value));

  if (creating) {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        <input
          className="mn-input" autoFocus value={value || ""} placeholder={placeholder || "Naya naam"}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button" className="mn-btn-ghost" title="List se chunein"
          style={{ padding: "4px 8px", fontSize: 11 }}
          onClick={() => { setCreating(false); onChange(""); }}
        >
          List
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 6 }}>
      <select className="mn-input" value={value || ""} onChange={(e) => onChange(e.target.value)}>
        <option value="">— chunein —</option>
        {known.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <button
        type="button" className="mn-btn-ghost" title="Nayi bana'ein"
        style={{ padding: "4px 10px", fontSize: 15, lineHeight: 1 }}
        onClick={() => { setCreating(true); onChange(""); }}
      >
        +
      </button>
    </div>
  );
}

function Thumb({ url, size = 34, eager = false }) {
  const [broken, setBroken] = useState(false);
  // url is either a freshly-picked "data:..." string or a relative
  // "/inventory/<id>/image?v=..." path served by the API host.
  const src = url && url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
  useEffect(() => { setBroken(false); }, [src]);
  return (
    <div style={{ width: size, height: size, borderRadius: 6, overflow: "hidden", background: COLORS.surface2, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {src && !broken ? (
        // A lazy image that has not loaded yet prints as a blank box, so
        // anything on the bill is loaded eagerly.
        <img src={src} onError={() => setBroken(true)} loading={eager ? "eager" : "lazy"} decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <ImageIcon size={Math.round(size * 0.4)} color={COLORS.textFaint} />
      )}
    </div>
  );
}

function Inventory({ items, update, notify, role }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [q, setQ] = useState("");
  const isOwner = role === "owner";
  const filtered = items.filter((i) =>
    `${i.name || ""}${i.sku || ""}${i.category || ""}${i.parentName || ""}${i.size || ""}${i.color || ""}`
      .toLowerCase().includes(q.toLowerCase())
  );
  const editingItem = items.find((i) => i.id === editingId);

  // Rows sharing a "Design / group name" are shown under one heading so a
  // shirt in five sizes reads as one product, not five unrelated lines.
  const grouped = useMemo(() => {
    const groups = [];
    const byParent = {};
    filtered.forEach((i) => {
      const parent = (i.parentName || "").trim();
      if (!parent) { groups.push({ parent: `__single_${i.id}`, isGroup: false, items: [i] }); return; }
      if (!byParent[parent]) {
        byParent[parent] = { parent, isGroup: true, items: [] };
        groups.push(byParent[parent]);
      }
      byParent[parent].items.push(i);
    });
    return groups.map((g) => ({
      ...g,
      totalQty: g.items.reduce((t, x) => t + Number(x.quantity || 0), 0),
      lowCount: g.items.filter((x) => x.alertEnabled && Number(x.quantity) <= Number(x.reorder)).length,
    }));
  }, [filtered]);

  // Category and group lists are built from what is already in the stock,
  // so the shopkeeper picks an existing one instead of retyping it (and
  // "Summer" / "summer " never become two categories). The + button on the
  // field is there for a genuinely new one.
  const categoryOptions = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...items.map((i) => (i.category || "").trim())])].filter(Boolean),
    [items]
  );
  const groupOptions = useMemo(
    () => [...new Set(items.map((i) => (i.parentName || "").trim()))].filter(Boolean),
    [items]
  );
  const colorOptions = useMemo(
    () => [...new Set(items.map((i) => (i.color || "").trim()))].filter(Boolean),
    [items]
  );

  const baseFields = [
    { key: "name", label: "Item name", required: true },
    { key: "sku", label: "SKU", required: true },
    // Variants: each size/colour is its own row with its own stock and
    // cost, but rows sharing a Design name are grouped together below.
    { key: "parentName", label: "Design / group name", type: "combo", options: groupOptions, placeholder: "Naya design naam" },
    { key: "size", label: "Size", type: "select", options: ["", "XS", "S", "M", "L", "XL", "XXL", "Free size", "Unstitched"] },
    { key: "color", label: "Colour", type: "combo", options: colorOptions, placeholder: "Naya rang" },
    { key: "category", label: "Category", type: "combo", options: categoryOptions, placeholder: "Nayi category" },
    { key: "image", label: "Photo (optional)", type: "file" },
    { key: "quantity", label: "Quantity", type: "number", default: 0 },
    { key: "reorder", label: "Reorder level", type: "number", default: 5 },
    // Real (purchase) cost is visible and editable for EVERY role — staff,
    // manager and owner. Nothing is hidden; instead every edit is written to
    // the change history so the owner can see who changed what.
    { key: "cost", label: "Real cost — purchase (Rs)", type: "number", default: 0 },
    { key: "price", label: "Selling price (Rs)", type: "number", default: 0 },
    // Opt-in per item. Without this every one-off piece with qty 1 fires
    // an alert and the badge becomes noise nobody looks at.
    { key: "alertEnabled", label: "Low stock alert", type: "checkbox", hint: "Is item par alert bhejein", default: false },
  ];

  return (
    <Panel
      title="Inventory" addLabel="Add item" onAdd={() => setAdding(true)}
      count={`${items.length} items`}
      extra={<SearchBox value={q} onChange={setQ} />}
    >
      <div style={{ padding: "10px 18px", fontSize: 11.5, color: COLORS.textFaint, borderBottom: `1px solid ${COLORS.borderSoft}` }}>
        Real cost sab ko dikhti hai aur sab edit kar sakte hain — lekin har tabdeeli owner ke <b style={{ color: COLORS.textDim }}>Change history</b> mein save hoti hai (kis ne, kab, kya se kya kiya). Low stock alert sirf un items par aata hai jin par ghanti <b style={{ color: COLORS.accent }}>on</b> ki gayi ho.
      </div>
      {adding && (
        <AddForm
          title="New inventory item" fields={baseFields} onCancel={() => setAdding(false)}
          onSave={(v) => {
            update((list) => [...list, { id: genId(), ...v, quantity: Number(v.quantity), reorder: Number(v.reorder), cost: Number(v.cost || 0), price: Number(v.price) }]);
            setAdding(false);
            notify("Item added");
          }}
        />
      )}
      {editingItem && (
        <AddForm
          // Remount per item, otherwise the form keeps the previous item's
          // values and the category field keeps its typing/list mode.
          key={editingId}
          title={`Edit — ${editingItem.name}`} fields={baseFields} initialValues={editingItem} onCancel={() => setEditingId(null)}
          onSave={(v) => {
            update((list) => list.map((x) => x.id === editingId
              ? { ...x, ...v, quantity: Number(v.quantity), reorder: Number(v.reorder), cost: Number(v.cost || 0), price: Number(v.price) }
              : x
            ));
            setEditingId(null);
            notify("Item updated");
          }}
        />
      )}
      {filtered.length === 0 ? <EmptyRow text="Koi item nahi mila." /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th></th><th>Item</th><th>SKU</th><th>Category</th><th>Qty</th><th>Real cost</th><th>Price</th><th>Margin</th><th>Stock value</th><th></th></tr></thead>
          <tbody>
            {grouped.map((g) => (
              <Fragment key={g.parent}>
                {g.isGroup && (
                  <tr>
                    <td colSpan={10} style={{ background: COLORS.surface2, padding: "8px 12px", fontSize: 12.5, fontWeight: 600 }}>
                      {g.parent}
                      <span style={{ color: COLORS.textFaint, fontWeight: 400, marginLeft: 8 }}>
                        {g.items.length} variants · total {g.totalQty} pcs
                        {g.lowCount > 0 && <span style={{ color: COLORS.negative }}> · {g.lowCount} low</span>}
                      </span>
                    </td>
                  </tr>
                )}
                {g.items.map((i) => {
              const low = i.alertEnabled && Number(i.quantity) <= Number(i.reorder);
              const margin = Number(i.price) > 0
                ? Math.round(((Number(i.price) - Number(i.cost || 0)) / Number(i.price)) * 100)
                : 0;
              const variantLabel = [i.size, i.color].filter(Boolean).join(" · ");
              return (
                <tr key={i.id}>
                  {/* Same size for every row — variants and standalone
                      items alike, so the column lines up cleanly. */}
                  <td><Thumb url={i.image || i.imageUrl} size={74} /></td>
                  <td style={g.isGroup ? { paddingLeft: 26 } : undefined}>
                    {g.isGroup ? (variantLabel || i.name) : i.name}
                    {!g.isGroup && variantLabel && <span style={{ color: COLORS.textFaint, fontSize: 11.5, marginLeft: 6 }}>{variantLabel}</span>}
                  </td>
                  <td style={{ color: COLORS.textFaint }}>{i.sku}</td>
                  <td style={{ color: COLORS.textDim }}>{i.category}</td>
                  <td className="mn-num" style={{ color: low ? COLORS.negative : COLORS.text }}>{i.quantity}{low && " ⚠"}</td>
                  <td className="mn-num">{fmt(i.cost)}</td>
                  <td className="mn-num">{fmt(i.price)}</td>
                  <td className="mn-num" style={{ color: margin >= 30 ? COLORS.positive : margin > 0 ? COLORS.accent : COLORS.negative }}>{margin}%</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{fmt(Number(i.cost || 0) * Number(i.quantity || 0))}</td>
                  <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                    {/* One-click alert toggle — turning it on for a dozen
                        items shouldn't mean opening a dozen edit forms. */}
                    <button
                      onClick={() => update((list) => list.map((x) => (x.id === i.id ? { ...x, alertEnabled: !x.alertEnabled } : x)))}
                      title={i.alertEnabled ? "Alert on — band karne ke liye click karein" : "Alert off — chalu karne ke liye click karein"}
                      style={{ background: "none", border: "none", color: i.alertEnabled ? COLORS.accent : COLORS.textFaint, cursor: "pointer", padding: 2, opacity: i.alertEnabled ? 1 : 0.45 }}
                    >
                      <Bell size={14} />
                    </button>
                    <button onClick={() => setEditingId(i.id)} title="Edit" style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer", padding: 2 }}>
                      <Pencil size={14} />
                    </button>
                    {canDelete(role) && <DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== i.id))} />}
                  </td>
                </tr>
              );
                })}
              </Fragment>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function PaymentEditor({ order, accounts, onSave, onClose }) {
  const [amountPaid, setAmountPaid] = useState(order.amountPaid || 0);
  const [dueDate, setDueDate] = useState(order.dueDate || "");
  const [accountId, setAccountId] = useState((accounts && accounts[0] && accounts[0].id) || "");
  const due = Math.max(0, Number(order.sell || 0) - Number(amountPaid || 0));
  const delta = Number(amountPaid || 0) - Number(order.amountPaid || 0);
  return (
    <div style={{ position: "absolute", zIndex: 10, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 8, padding: 12, width: 230, boxShadow: "0 8px 20px rgba(0,0,0,0.35)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>Record payment</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={14} /></button>
      </div>
      <label style={{ fontSize: 10.5, color: COLORS.textFaint, display: "block", marginBottom: 3 }}>Total bill: {fmt(order.sell)}</label>
      <label style={{ fontSize: 10.5, color: COLORS.textFaint, display: "block", marginBottom: 3, marginTop: 6 }}>Amount received (Rs)</label>
      <input className="mn-input" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "5px 8px" }} onClick={() => setAmountPaid(0)}>Mark udhar</button>
        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "5px 8px" }} onClick={() => setAmountPaid(order.sell)}>Mark full paid</button>
      </div>
      <div style={{ fontSize: 11, color: due > 0 ? COLORS.negative : COLORS.positive, margin: "8px 0" }}>
        {due > 0 ? `Due: ${fmt(due)}` : "Fully paid"}
      </div>
      {due > 0 && (
        <>
          <label style={{ fontSize: 10.5, color: COLORS.textFaint, display: "block", marginBottom: 3 }}>Due date (optional)</label>
          <input className="mn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </>
      )}
      {delta > 0 && accounts && accounts.length > 0 && (
        <>
          <label style={{ fontSize: 10.5, color: COLORS.textFaint, display: "block", marginBottom: 3, marginTop: 8 }}>Received into account</label>
          <select className="mn-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </>
      )}
      <button className="mn-btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => onSave({ amountPaid: Number(amountPaid) || 0, dueDate: due > 0 ? dueDate : "" }, delta > 0 ? accountId : null, delta)}>Save</button>
    </div>
  );
}

function Orders({ orders, accounts, update, updateAccounts, notify, role, user, settings, reload }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [returning, setReturning] = useState(null);
  const [paying, setPaying] = useState(null);
  const [dueOnly, setDueOnly] = useState(false);
  const [sellerFilter, setSellerFilter] = useState("");
  const [sendingBulk, setSendingBulk] = useState(false);
  const isOwner = role === "owner";
  const isManagerOrAbove = role === "owner" || role === "manager";

  // Pending parcels that haven't been confirmed yet — these are the ones
  // that turn into returns if they go out unchecked.
  const unconfirmed = orders.filter(
    (o) => o.status === "Pending" && o.phone && !["Confirmed", "Sent", "Cancelled"].includes(o.confirmationStatus)
  );

  const sendAllConfirmations = async () => {
    setSendingBulk(true);
    try {
      const res = await sendConfirmationBulk(unconfirmed.map((o) => o.id));
      notify(`${res.sent} message bheje${res.failed.length ? `, ${res.failed.length} fail` : ""}`);
      reload && reload();
    } catch (err) {
      notify(`WhatsApp failed: ${err.message}`);
    } finally { setSendingBulk(false); }
  };

  // Orders still owing money — the udhaar list.
  const withDue = orders.filter((o) => o.status !== "Returned" && Number(o.sell || 0) - Number(o.amountPaid || 0) > 0);
  const totalDue = withDue.reduce((t, o) => t + (Number(o.sell || 0) - Number(o.amountPaid || 0)), 0);
  const sellerNames = [...new Set(orders.map((o) => o.soldBy).filter(Boolean))].sort();
  const shown = (dueOnly ? withDue : orders).filter((o) => !sellerFilter || o.soldBy === sellerFilter);

  const fields = [
    { key: "orderNo", label: "Order No", default: "ORD-" + Math.floor(1000 + Math.random() * 9000), required: true },
    { key: "customer", label: "Customer name", required: true },
    { key: "phone", label: "Phone (WhatsApp)" },
    { key: "city", label: "City" },
    { key: "product", label: "Product" },
    { key: "qty", label: "Qty", type: "number", default: 1 },
    { key: "sell", label: "Sale amount (Rs)", type: "number", default: 0 },
    ...(isManagerOrAbove ? [{ key: "cost", label: "Cost amount (Rs)", type: "number", default: 0 }] : []),
    { key: "courier", label: "Courier", type: "select", options: ["Leopards", "TCS", "M&P", "Trax", "PostEx", "Other"] },
    { key: "tracking", label: "Tracking No" },
    { key: "channel", label: "Sales channel", type: "select", options: ["Website", "Instagram", "WhatsApp", "Facebook", "Walk-in / POS", "Other"] },
    { key: "deliveryCharge", label: "Delivery charge (Rs)", type: "number", default: settings?.default_delivery_charge || 0 },
    { key: "status", label: "Status", type: "select", options: ["Pending", "Shipped", "Delivered", "Returned"] },
    { key: "amountPaid", label: "Amount received now (Rs)", type: "number", default: 0 },
    { key: "method", label: "Payment method", type: "select", options: ["COD", "Bank Transfer", "JazzCash", "EasyPaisa"] },
    // Who wrote this bill. Pre-filled with the logged-in user but editable,
    // so an owner entering yesterday's counter sales can credit the right person.
    { key: "billedBy", label: "Billed by", default: user?.name || "" },
    // Kis ke through sale hui — staff, affiliate, ya koi aur. Baad mein
    // koi masla ho to yahi batata hai ke order kahan se aya tha.
    { key: "soldBy", label: "Sold by — kis ke through", type: "seller", default: user?.name || "" },
  ];

  // Clicking the status badge cycles Pending -> Shipped -> Delivered.
  // Returns are deliberately NOT part of the cycle any more — they open the
  // proper return form instead (reason + refund + return charge + restock).
  const cycleStatus = (o) => {
    if (o.status === "Returned") return;
    const order = ["Pending", "Shipped", "Delivered"];
    const idx = order.indexOf(o.status);
    const next = order[(idx + 1) % order.length];
    const patch = { status: next };
    if (next === "Delivered") patch.deliveredAt = todayISO();
    update((list) => list.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
  };
  const savePayment = (o, patch, accountId, delta) => {
    update((list) => list.map((x) => (x.id === o.id ? { ...x, ...patch } : x)));
    if (accountId && delta > 0 && updateAccounts) {
      updateAccounts((list) => list.map((a) => (a.id === accountId ? { ...a, balance: Number(a.balance || 0) + delta } : a)));
    }
    setEditingId(null);
  };

  return (
    <Panel
      title="Orders & parcels" addLabel="Add order" onAdd={() => setAdding(true)}
      count={`${shown.length} orders${totalDue > 0 ? ` · baqaya ${fmt(totalDue)}` : ""}`}
      extra={(
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {sellerNames.length > 0 && (
            <select
              className="mn-input" style={{ width: 170 }}
              value={sellerFilter} onChange={(e) => setSellerFilter(e.target.value)}
            >
              <option value="">Sold by — sab</option>
              {sellerNames.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
          <button
            className={dueOnly ? "mn-btn" : "mn-btn-ghost"} style={{ fontSize: 12 }}
            onClick={() => setDueOnly((v) => !v)}
          >
            <Wallet size={13} /> Udhaar {withDue.length > 0 ? `(${withDue.length})` : ""}
          </button>
          {unconfirmed.length > 0 && (
            <button className="mn-btn-ghost" style={{ fontSize: 12 }} disabled={sendingBulk} onClick={sendAllConfirmations}>
              <MessageCircle size={13} /> {sendingBulk ? "Bhej raha hai..." : `WhatsApp ${unconfirmed.length} ko`}
            </button>
          )}
        </div>
      )}
    >
      {adding && (
        <AddForm
          title="New order" fields={fields} onCancel={() => setAdding(false)}
          footer={(vals) => <CustomerRiskBanner phone={vals.phone} />}
          onSave={(v) => {
            update((list) => [...list, { id: genId(), ...v, qty: Number(v.qty), sell: Number(v.sell), cost: Number(v.cost || 0), amountPaid: Number(v.amountPaid || 0), dueDate: "", date: todayISO() }]);
            setAdding(false);
            notify("Order added");
          }}
        />
      )}
      {paying && (
        <PaymentPanel
          order={paying} accounts={accounts} notify={notify}
          onCancel={() => setPaying(null)}
          onDone={() => { setPaying(null); reload && reload(); }}
        />
      )}
      {returning && (
        <ReturnForm
          order={returning}
          settings={settings}
          onCancel={() => setReturning(null)}
          onDone={(msg) => { setReturning(null); notify(msg); reload && reload(); }}
        />
      )}
      {shown.length === 0 ? <EmptyRow text={dueOnly ? "Kisi customer par udhaar baqi nahi." : "Abhi tak koi order nahi."} /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>Order</th><th>Customer</th><th>Product</th><th>Amount</th>{isManagerOrAbove && <th>Cost</th>}{isManagerOrAbove && <th>Profit</th>}<th>Courier / Tracking</th><th>Status</th><th>Confirmation</th><th>Sold by</th><th>Billed by</th><th>Payment</th><th></th>{canDelete(role) && <th></th>}</tr></thead>
          <tbody>
            {shown.map((o) => {
              const pStatus = paymentStatusOf(o);
              const due = amountDueOf(o);
              return (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>
                    {o.customer}
                    {o.phone && <div style={{ fontSize: 11, color: COLORS.textFaint }}>{o.phone}</div>}
                  </td>
                  <td style={{ color: COLORS.textDim }}>{o.product}{o.qty ? ` ×${o.qty}` : ""}</td>
                  <td className="mn-num">{fmt(o.sell)}</td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{o.courier || "—"}{o.tracking ? ` · ${o.tracking}` : ""}</td>
                  <td>
                    <button onClick={() => cycleStatus(o)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><Badge text={o.status} tone={orderStatusTone[o.status]} /></button>
                    {o.status === "Returned" && o.returnReason && <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 3 }}>{o.returnReason}</div>}
                  </td>
                  <td>
                    <ConfirmationCell order={o} notify={notify} onChanged={reload} />
                  </td>
                  {/* Sold by = kis ke through. Badge marks an affiliate
                      sale so it stands out from an in-house one. */}
                  <td style={{ fontSize: 12 }}>
                    {o.soldBy ? (
                      <>
                        <div style={{ color: COLORS.text }}>{o.soldBy}</div>
                        {o.soldByType === "Affiliate" && <Badge text="Affiliate" tone="info" />}
                      </>
                    ) : <span style={{ color: COLORS.textFaint }}>—</span>}
                  </td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{o.billedBy || "—"}</td>
                  <td style={{ position: "relative" }}>
                    <button onClick={() => setEditingId(editingId === o.id ? null : o.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>
                      <Badge text={pStatus} tone={paymentTone[pStatus]} />
                      {due > 0 && <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 3 }}>Due {fmt(due)}{o.dueDate ? ` · ${o.dueDate}` : ""}</div>}
                    </button>
                    {editingId === o.id && (
                      <PaymentEditor order={o} accounts={accounts || []} onClose={() => setEditingId(null)} onSave={(patch, accountId, delta) => savePayment(o, patch, accountId, delta)} />
                    )}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {o.status !== "Returned" && Number(o.sell || 0) - Number(o.amountPaid || 0) > 0 && (
                        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px", color: COLORS.accent }} onClick={() => setPaying(o)}>
                          <Wallet size={12} /> Payment
                        </button>
                      )}
                      {o.status !== "Returned" && (
                        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setReturning(o)}>
                          <Undo2 size={12} /> Return
                        </button>
                      )}
                    </div>
                  </td>
                  {canDelete(role) && <td><DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== o.id))} /></td>}
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------
// Return form — one screen that does the whole return:
// reason, refund given back, courier's return charge, and whether the
// stock goes back on the shelf. The backend does all four in one
// transaction and writes it to the change history.
// ---------------------------------------------------------------
const RETURN_REASONS = ["Size issue", "Quality issue", "Wrong item sent", "Customer changed mind", "Damaged in transit", "Not received / refused", "Other"];

function ReturnForm({ order, settings, onCancel, onDone }) {
  const [reason, setReason] = useState(RETURN_REASONS[0]);
  const [note, setNote] = useState("");
  const [refundAmount, setRefundAmount] = useState(Number(order.amountPaid || 0));
  const [returnCharge, setReturnCharge] = useState(Number(settings?.default_return_charge || 0));
  const [restock, setRestock] = useState(true);
  const [saving, setSaving] = useState(false);

  const loss = Number(returnCharge || 0) + Number(refundAmount || 0) + Number(order.deliveryCharge || 0);

  const submit = async () => {
    setSaving(true);
    try {
      const fullReason = note.trim() ? `${reason} — ${note.trim()}` : reason;
      const res = await returnOrder(order.id, {
        reason: fullReason,
        refundAmount: Number(refundAmount) || 0,
        returnCharge: Number(returnCharge) || 0,
        restock,
      });
      const back = (res.restocked || []).map((r) => `${r.name} +${r.added}`).join(", ");
      onDone(back ? `Return saved. Stock wapas: ${back}` : "Return saved");
    } catch (err) {
      onDone(`Return failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ padding: 18, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Return — {order.orderNo} · {order.customer}</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Return reason</label>
          <select className="mn-input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {RETURN_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Detail (optional)</label>
          <input className="mn-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. medium chahiye tha" />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Refund to customer (Rs)</label>
          <input className="mn-input" type="number" value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Courier return charge (Rs)</label>
          <input className="mn-input" type="number" value={returnCharge} onChange={(e) => setReturnCharge(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Stock wapas inventory mein?</label>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingTop: 6 }}>
            <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
            {restock ? "Haan — quantity add ho jayegi" : "Nahi — item damaged / khatam"}
          </label>
        </div>
      </div>
      <div style={{ marginTop: 12, fontSize: 12.5, color: COLORS.negative }}>
        Is return ka total nuqsan: <span className="mn-num">{fmt(loss)}</span>
        <span style={{ color: COLORS.textFaint }}> (delivery + return charge + refund)</span>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={submit} disabled={saving}>{saving ? "Saving..." : "Confirm return"}</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// Dedicated Returns tab — every returned order in one place with the
// reasons, the money lost, and a reason-wise summary so patterns show up.
function Returns({ orders, notify, role, settings, reload }) {
  const [returning, setReturning] = useState(null);
  const [undoing, setUndoing] = useState(null);
  const [q, setQ] = useState("");
  const returned = orders.filter((o) => o.status === "Returned");
  const totalLoss = returned.reduce(
    (t, o) => t + Number(o.returnCharge || 0) + Number(o.refundAmount || 0) + Number(o.deliveryCharge || 0), 0
  );
  const returnRate = orders.length ? Math.round((returned.length / orders.length) * 1000) / 10 : 0;

  const byReason = useMemo(() => {
    const map = {};
    returned.forEach((o) => {
      const key = (o.returnReason || "Not specified").split(" — ")[0];
      map[key] = (map[key] || 0) + 1;
    });
    return Object.entries(map).map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count);
  }, [returned]);

  // Searchable, because after a few hundred orders scrolling to find the
  // right one is hopeless. Shows all matches, not just the newest 25.
  const pending = orders
    .filter((o) => o.status !== "Returned")
    .filter((o) => `${o.orderNo || ""} ${o.customer || ""} ${o.phone || ""} ${o.product || ""}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Returned orders" value={returned.length} sub={`${returnRate}% of all orders`} tone={returnRate > 20 ? "negative" : undefined} />
        <StatCard label="Total return loss" value={fmt(totalLoss)} sub="Delivery + return charge + refunds" tone="negative" />
        <StatCard label="Top reason" value={byReason[0]?.reason || "—"} sub={byReason[0] ? `${byReason[0].count} orders` : "Koi return nahi"} />
      </div>

      {returning && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9 }}>
          <ReturnForm
            order={returning} settings={settings}
            onCancel={() => setReturning(null)}
            onDone={(msg) => { setReturning(null); notify(msg); reload && reload(); }}
          />
        </div>
      )}

      {undoing && (
        <UndoReturnForm
          order={undoing} notify={notify}
          onCancel={() => setUndoing(null)}
          onDone={() => { setUndoing(null); reload && reload(); }}
        />
      )}

      <Panel title="Returned orders" count={`${returned.length} returns`}>
        {returned.length === 0 ? <EmptyRow text="Abhi tak koi return nahi — achi baat hai." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Order</th><th>Customer</th><th>City</th><th>Product</th><th>Reason</th><th>Refund</th><th>Return charge</th><th>Restocked</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {returned.map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>{o.customer}</td>
                  <td style={{ color: COLORS.textDim }}>{o.city || "—"}</td>
                  <td style={{ color: COLORS.textDim }}>{o.product}</td>
                  <td style={{ fontSize: 12 }}>{o.returnReason || "—"}</td>
                  <td className="mn-num">{fmt(o.refundAmount)}</td>
                  <td className="mn-num">{fmt(o.returnCharge)}</td>
                  <td>{o.restocked ? <Badge text="Yes" tone="positive" /> : <Badge text="No" />}</td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{o.returnedAt || o.date}</td>
                  <td style={{ textAlign: "right" }}>
                    <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setUndoing(o)}>
                      <RefreshCw size={11} /> Undo
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>

      <Panel title="Naya return record karein" count={`${pending.length} active orders`} extra={<SearchBox value={q} onChange={setQ} />}>
        {pending.length === 0 ? <EmptyRow text="Koi active order nahi." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Order</th><th>Customer</th><th>Amount</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {pending.slice(0, 60).map((o) => (
                <tr key={o.id}>
                  <td>{o.orderNo}</td>
                  <td>{o.customer}</td>
                  <td className="mn-num">{fmt(o.sell)}</td>
                  <td><Badge text={o.status} tone={orderStatusTone[o.status]} /></td>
                  <td style={{ textAlign: "right" }}>
                    <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setReturning(o)}>
                      <Undo2 size={12} /> Mark returned
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>

      {byReason.length > 0 && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Return reasons" />
          {byReason.map((r) => (
            <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "6px 0" }}>
              <span>{r.reason}</span>
              <span className="mn-num" style={{ color: COLORS.accent }}>{r.count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Employees({ employees, accounts, update, updateAccounts, notify, role }) {
  const [adding, setAdding] = useState(false);
  const isOwner = role === "owner";
  const fields = [
    { key: "name", label: "Name", required: true },
    { key: "role", label: "Role" },
    { key: "image", label: "Photo (optional)", type: "file" },
    { key: "salary", label: "Monthly salary (Rs)", type: "number", default: 0 },
    { key: "phone", label: "Phone" },
    { key: "joined", label: "Join date", type: "date", default: todayISO() },
    { key: "status", label: "This month's salary", type: "select", options: ["Pending", "Paid"] },
  ];
  const markPaid = (e, accountId) => {
    if (accountId && updateAccounts) updateAccounts((list) => list.map((a) => (a.id === accountId ? { ...a, balance: Number(a.balance || 0) - Number(e.salary || 0) } : a)));
    update((list) => list.map((x) => (x.id === e.id ? { ...x, status: "Paid", paidFrom: accountId || "" } : x)));
  };
  const markPending = (e) => {
    if (e.paidFrom && updateAccounts) updateAccounts((list) => list.map((a) => (a.id === e.paidFrom ? { ...a, balance: Number(a.balance || 0) + Number(e.salary || 0) } : a)));
    update((list) => list.map((x) => (x.id === e.id ? { ...x, status: "Pending", paidFrom: "" } : x)));
  };

  return (
    <Panel title="Employees" addLabel="Add employee" onAdd={() => setAdding(true)} count={`${employees.length} employees`}>
      {adding && (
        <AddForm
          title="New employee" fields={fields} onCancel={() => setAdding(false)}
          onSave={(v) => {
            update((list) => [...list, { id: genId(), ...v, salary: Number(v.salary), paidFrom: "" }]);
            setAdding(false);
            notify("Employee added");
          }}
        />
      )}
      {employees.length === 0 ? <EmptyRow text="Koi employee add nahi hua." /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th></th><th>Name</th><th>Role</th>{isOwner && <th>Salary</th>}<th>Phone</th><th>Joined</th>{isOwner && <th>This month</th>}{canDelete(role) && <th></th>}</tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td><Thumb url={e.image} /></td>
                <td>{e.name}</td>
                <td style={{ color: COLORS.textDim }}>{e.role}</td>
                {isOwner && <td className="mn-num">{fmt(e.salary)}</td>}
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{e.phone}</td>
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{e.joined}</td>
                {isOwner && (
                  <td>
                    {e.status === "Paid" ? (
                      <button onClick={() => markPending(e)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><Badge text="Paid" tone="positive" /></button>
                    ) : (
                      <select className="mn-input" style={{ fontSize: 11, padding: "4px 6px", width: 130 }} value="" onChange={(ev) => { if (ev.target.value) markPaid(e, ev.target.value); }}>
                        <option value="">Pay from...</option>
                        {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                      </select>
                    )}
                  </td>
                )}
                {canDelete(role) && <td><DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== e.id))} /></td>}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Affiliates({ affiliates, accounts, update, updateAccounts, notify }) {
  const [adding, setAdding] = useState(false);
  const fields = [
    { key: "name", label: "Affiliate / partner", required: true },
    { key: "platform", label: "Platform", type: "select", options: ["Website", "Instagram", "TikTok", "Facebook", "Pinterest", "WhatsApp", "Other"] },
    { key: "rate", label: "Commission rate (%)", type: "number", default: 10 },
    { key: "sales", label: "Sales generated (Rs)", type: "number", default: 0 },
    { key: "commission", label: "Commission owed (Rs)", type: "number", default: 0 },
    { key: "status", label: "Status", type: "select", options: ["Active", "Inactive"] },
  ];
  const markPaid = (a, accountId) => {
    if (accountId && updateAccounts) updateAccounts((list) => list.map((x) => (x.id === accountId ? { ...x, balance: Number(x.balance || 0) - Number(a.commission || 0) } : x)));
    update((list) => list.map((x) => (x.id === a.id ? { ...x, payment: "Paid", paidFrom: accountId || "" } : x)));
  };
  const markPending = (a) => {
    if (a.paidFrom && updateAccounts) updateAccounts((list) => list.map((x) => (x.id === a.paidFrom ? { ...x, balance: Number(x.balance || 0) + Number(a.commission || 0) } : x)));
    update((list) => list.map((x) => (x.id === a.id ? { ...x, payment: "Pending", paidFrom: "" } : x)));
  };

  return (
    <Panel title="Affiliates" addLabel="Add affiliate" onAdd={() => setAdding(true)} count={`${affiliates.length} partners`}>
      {adding && (
        <AddForm
          title="New affiliate" fields={fields} onCancel={() => setAdding(false)}
          onSave={(v) => {
            update((list) => [...list, { id: genId(), ...v, rate: Number(v.rate), sales: Number(v.sales), commission: Number(v.commission), payment: "Pending", paidFrom: "" }]);
            setAdding(false);
            notify("Affiliate added");
          }}
        />
      )}
      {affiliates.length === 0 ? <EmptyRow text="Koi affiliate add nahi hua." /> : (
        <>
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Partner</th><th>Platform</th><th>Rate</th><th>Sales</th><th>Commission</th><th>Net profit</th><th>Status</th><th>Payment</th><th></th></tr></thead>
            <tbody>
              {affiliates.map((a) => {
                const netProfit = Number(a.sales || 0) - Number(a.commission || 0);
                return (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td style={{ color: COLORS.textDim }}>{a.platform}</td>
                    <td className="mn-num">{a.rate}%</td>
                    <td className="mn-num">{fmt(a.sales)}</td>
                    <td className="mn-num">{fmt(a.commission)}</td>
                    <td className="mn-num" style={{ color: netProfit >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(netProfit)}</td>
                    <td><Badge text={a.status} tone={a.status === "Active" ? "info" : undefined} /></td>
                    <td>
                      {a.payment === "Paid" ? (
                        <button onClick={() => markPending(a)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}><Badge text="Paid" tone="positive" /></button>
                      ) : (
                        <select className="mn-input" style={{ fontSize: 11, padding: "4px 6px", width: 130 }} value="" onChange={(ev) => { if (ev.target.value) markPaid(a, ev.target.value); }}>
                          <option value="">Pay from...</option>
                          {(accounts || []).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </select>
                      )}
                    </td>
                    <td><DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== a.id))} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          {(() => {
            const totalSales = affiliates.reduce((s, a) => s + Number(a.sales || 0), 0);
            const totalCommission = affiliates.reduce((s, a) => s + Number(a.commission || 0), 0);
            const totalNet = totalSales - totalCommission;
            return (
              <div style={{ display: "flex", gap: 24, padding: "12px 18px", borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 12.5 }}>
                <span style={{ color: COLORS.textFaint }}>Total sales: <b style={{ color: COLORS.text }}>{fmt(totalSales)}</b></span>
                <span style={{ color: COLORS.textFaint }}>Total commission: <b style={{ color: COLORS.text }}>{fmt(totalCommission)}</b></span>
                <span style={{ color: COLORS.textFaint }}>Net profit: <b style={{ color: totalNet >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(totalNet)}</b></span>
              </div>
            );
          })()}
        </>
      )}
    </Panel>
  );
}

function Team({ notify, currentUserId }) {
  const [users, setUsers] = useState(null); // null = loading
  const [adding, setAdding] = useState(false);

  const load = () => {
    listUsers()
      .then(setUsers)
      .catch((err) => notify(`Couldn't load team: ${err.message}`));
  };
  useEffect(load, []);

  const fields = [
    { key: "name", label: "Full name", required: true },
    { key: "email", label: "Email", type: "email", required: true },
    { key: "password", label: "Temporary password", required: true },
    { key: "role", label: "Access level", type: "select", options: ["staff", "manager", "owner"], default: "staff" },
  ];

  const addUser = (v) => {
    createUser(v)
      .then((created) => {
        setUsers((list) => [...(list || []), created]);
        setAdding(false);
        notify(`${created.name} can now log in`);
      })
      .catch((err) => notify(`Couldn't add: ${err.message}`));
  };

  const remove = (u) => {
    if (!window.confirm(`Remove ${u.name}'s login? They won't be able to sign in anymore.`)) return;
    removeUser(u.id)
      .then(() => {
        setUsers((list) => list.filter((x) => x.id !== u.id));
        notify(`${u.name} removed`);
      })
      .catch((err) => notify(`Couldn't remove: ${err.message}`));
  };

  return (
    <Panel title="Team" addLabel="Add teammate" onAdd={() => setAdding(true)} count={users ? `${users.length} logins` : "Loading..."}>
      {adding && (
        <AddForm
          title="New login" fields={fields} onCancel={() => setAdding(false)}
          onSave={addUser}
        />
      )}
      {!users ? (
        <EmptyRow text="Loading team..." />
      ) : users.length === 0 ? (
        <EmptyRow text="No teammates added yet." />
      ) : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Added</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td style={{ color: COLORS.textDim }}>{u.email}</td>
                <td><Badge text={u.role === "owner" ? "Owner" : u.role === "manager" ? "Manager" : "Staff"} tone={u.role === "owner" ? "accent" : u.role === "manager" ? "info" : undefined} /></td>
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{String(u.created_at).slice(0, 10)}</td>
                <td>{u.id !== currentUserId && <DeleteBtn onClick={() => remove(u)} />}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
      <div style={{ padding: "12px 18px", fontSize: 11.5, color: COLORS.textFaint, borderTop: `1px solid ${COLORS.borderSoft}` }}>
        Staff logins see Inventory, Orders, POS, Employees, Customers, and Reports — salary, finance, accounts, expenses, affiliates, delete buttons, and Team stay hidden. Managers see everything staff sees plus cost, salary, profit, finance, expenses, and affiliates — but can't delete records or manage Accounts/Team. Owner logins see and can do everything.
      </div>
    </Panel>
  );
}

function ChangePasswordForm({ onClose, notify }) {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 6) return setError("New password must be at least 6 characters");
    if (newPassword !== confirm) return setError("New passwords don't match");
    setLoading(true);
    try {
      await changePassword(oldPassword, newPassword);
      notify("Password changed");
      onClose();
    } catch (err) {
      setError(err.message || "Couldn't change password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50 }}>
      <form onSubmit={submit} style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 26, width: 300 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 14, fontWeight: 600 }}>Change password</span>
          <button type="button" onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
        </div>

        <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Current password</label>
        <input type="password" required value={oldPassword} onChange={(e) => setOldPassword(e.target.value)} className="mn-input" style={{ marginBottom: 12 }} />

        <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>New password</label>
        <input type="password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mn-input" style={{ marginBottom: 12 }} />

        <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Confirm new password</label>
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mn-input" style={{ marginBottom: 12 }} />

        {error && <div style={{ color: COLORS.negative, fontSize: 12, marginBottom: 10 }}>{error}</div>}

        <button className="mn-btn" disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
          {loading ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}

function Customers({ orders, notify, role }) {
  const [q, setQ] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [ledger, setLedger] = useState(null);
  const [editing, setEditing] = useState(null);
  const isManagerOrAbove = role === "owner" || role === "manager";

  const load = () => listCustomers().then(setLedger).catch((err) => notify(`Customers load failed: ${err.message}`));
  useEffect(() => { load(); }, []);

  const rows = ledger?.customers || [];
  const filtered = rows.filter((c) => `${c.name || ""} ${c.phone || ""} ${c.city || ""}`.toLowerCase().includes(q.toLowerCase()));
  const riskyCount = rows.filter((c) => c.risky).length;
  const blockedCount = rows.filter((c) => c.cod_blocked).length;
  const historyFor = (phoneKey) =>
    orders.filter((o) => String(o.phone || "").replace(/[^0-9]/g, "").slice(-10) === phoneKey);

  const toggleBlock = async (c) => {
    try {
      await saveCustomer(c.phone, { name: c.name, city: c.city, notes: c.notes, cod_blocked: !c.cod_blocked });
      notify(!c.cod_blocked ? "COD block laga diya" : "COD block hata diya");
      load();
    } catch (err) { notify(`Failed: ${err.message}`); }
  };

  if (!ledger) return <EmptyRow text="Customers load ho rahe hain..." />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Customers" value={rows.length} sub="Phone number ke hisaab se" />
        <StatCard label="Risky customers" value={riskyCount} sub={`${ledger.threshold}+ returns wale`} tone={riskyCount ? "negative" : undefined} />
        <StatCard label="COD blocked" value={blockedCount} sub="Sirf advance par bhejein" tone={blockedCount ? "negative" : undefined} />
      </div>

      {editing && (
        <CustomerEditor
          customer={editing}
          onCancel={() => setEditing(null)}
          onSaved={() => { setEditing(null); notify("Customer updated"); load(); }}
          notify={notify}
        />
      )}

      <Panel title="Customers" count={`${rows.length} customers`} extra={<SearchBox value={q} onChange={setQ} />}>
        {filtered.length === 0 ? <EmptyRow text="Koi customer nahi mila." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr>
              <th>Customer</th><th>Phone</th><th>City</th><th>Orders</th><th>Returns</th>
              <th>Lifetime value</th><th>Baqaya</th>{isManagerOrAbove && <th>Return cost</th>}<th>Last order</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map((c) => (
                <Fragment key={c.phone_key}>
                  <tr style={c.cod_blocked ? { background: COLORS.negativeDim } : undefined}>
                    <td>
                      {c.name || "—"}
                      {c.cod_blocked && <span style={{ marginLeft: 6 }}><Badge text="COD blocked" tone="negative" /></span>}
                      {!c.cod_blocked && c.risky && <span style={{ marginLeft: 6 }}><Badge text="Risky" tone="negative" /></span>}
                      {c.notes && <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 3 }}>{c.notes}</div>}
                    </td>
                    <td style={{ color: COLORS.textDim }}>{c.phone || "—"}</td>
                    <td style={{ color: COLORS.textDim }}>{c.city || "—"}</td>
                    <td className="mn-num">{c.orders}</td>
                    <td className="mn-num" style={{ color: c.returned ? COLORS.negative : COLORS.textFaint }}>
                      {c.returned || "—"}{c.returned ? ` (${c.returnRate}%)` : ""}
                    </td>
                    <td className="mn-num">{fmt(c.lifetime_value)}</td>
                    <td className="mn-num" style={{ color: c.outstanding > 0 ? COLORS.negative : COLORS.textFaint }}>{c.outstanding > 0 ? fmt(c.outstanding) : "—"}</td>
                    {isManagerOrAbove && <td className="mn-num" style={{ color: COLORS.textDim }}>{c.return_cost ? fmt(c.return_cost) : "—"}</td>}
                    <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{c.last_order}</td>
                    <td>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setEditing(c)}>
                          <Pencil size={11} /> Note
                        </button>
                        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px", color: c.cod_blocked ? COLORS.positive : COLORS.negative }} onClick={() => toggleBlock(c)}>
                          {c.cod_blocked ? "Unblock" : "Block COD"}
                        </button>
                        <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setExpanded(expanded === c.phone_key ? null : c.phone_key)}>
                          {expanded === c.phone_key ? "Hide" : "History"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expanded === c.phone_key && (
                    <tr>
                      <td colSpan={isManagerOrAbove ? 10 : 9} style={{ background: COLORS.surface2, padding: 12 }}>
                        {historyFor(c.phone_key).length === 0 ? (
                          <span style={{ fontSize: 12, color: COLORS.textFaint }}>Is number par koi order nahi mila.</span>
                        ) : historyFor(c.phone_key).map((o) => (
                          <div key={o.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "4px 0", gap: 12 }}>
                            <span style={{ color: COLORS.textDim }}>{o.date} · {o.orderNo}</span>
                            <span style={{ flex: 1, color: COLORS.textFaint }}>{o.product}</span>
                            <span className="mn-num">{fmt(o.sell)}</span>
                            <Badge text={o.status} tone={orderStatusTone[o.status]} />
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}

function CustomerEditor({ customer, onCancel, onSaved, notify }) {
  const [notes, setNotes] = useState(customer.notes || "");
  const [name, setName] = useState(customer.name || "");
  const [city, setCity] = useState(customer.city || "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveCustomer(customer.phone, { name, city, notes, cod_blocked: customer.cod_blocked });
      onSaved();
    } catch (err) {
      notify(`Save failed: ${err.message}`);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{customer.phone}</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Name</label>
          <input className="mn-input" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>City</label>
          <input className="mn-input" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Note (order likhte waqt dikhega)</label>
          <input className="mn-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. 2 baar parcel refuse kiya — advance lein" />
        </div>
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// The history feed carries three kinds of entry, and they read very
// differently: a field edit (old → new), an "Added" line, and a "Deleted"
// line holding a summary of what the record contained. The deleted one is
// the only surviving record that the thing ever existed, so it gets the
// most visual weight.
const ACTION_STYLE = {
  Added: { label: "Added", color: COLORS.positive },
  Deleted: { label: "Deleted", color: COLORS.negative },
};

function AuditLogPanel({ notify }) {
  const [entries, setEntries] = useState(null);
  const [people, setPeople] = useState([]);
  const [resourceFilter, setResourceFilter] = useState("");
  const [personFilter, setPersonFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  useEffect(() => {
    setEntries(null);
    let cancelled = false;
    getAuditLog({
      resource: resourceFilter || undefined,
      changedBy: personFilter || undefined,
      action: actionFilter || undefined,
    })
      .then((rows) => { if (!cancelled) setEntries(rows); })
      .catch((err) => { if (!cancelled) notify(`Couldn't load history: ${err.message}`); });
    return () => { cancelled = true; };
  }, [resourceFilter, personFilter, actionFilter]);

  // Loaded once — the list of people rarely changes and the filter should
  // not flicker every time the feed reloads.
  useEffect(() => { getAuditPeople().then(setPeople).catch(() => {}); }, []);

  const filters = (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <select className="mn-input" style={{ width: 140 }} value={resourceFilter} onChange={(e) => setResourceFilter(e.target.value)}>
        <option value="">All records</option>
        <option value="inventory">Inventory</option>
        <option value="orders">Bills / orders</option>
        <option value="employees">Employees</option>
        <option value="expenses">Expenses</option>
        <option value="ad_spend">Ad spend</option>
        <option value="suppliers">Suppliers</option>
        <option value="affiliates">Affiliates</option>
        <option value="accounts">Accounts</option>
        <option value="settings">Cost settings</option>
      </select>
      <select className="mn-input" style={{ width: 130 }} value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
        <option value="">Sab kuch</option>
        <option value="added">Added only</option>
        <option value="edited">Edited only</option>
        <option value="deleted">Deleted only</option>
      </select>
      <select className="mn-input" style={{ width: 140 }} value={personFilter} onChange={(e) => setPersonFilter(e.target.value)}>
        <option value="">Kisi ne bhi</option>
        {people.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );

  return (
    <Panel title="History" count={entries ? `${entries.length} changes` : "Loading..."} extra={filters}>
      {!entries ? (
        <EmptyRow text="Loading..." />
      ) : entries.length === 0 ? (
        <EmptyRow text="Is filter par koi change record nahi hui." />
      ) : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>When</th><th>Record</th><th>What</th><th>Old value</th><th>New value</th><th>Changed by</th></tr></thead>
          <tbody>
            {entries.map((e) => {
              const action = ACTION_STYLE[e.field];
              return (
                <tr key={e.id}>
                  <td style={{ color: COLORS.textFaint, fontSize: 12, whiteSpace: "nowrap" }}>
                    {String(e.changed_at).slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    {/* The photo makes an inventory line recognisable at a
                        glance — far faster than decoding a SKU. */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      {e.resource === "inventory" && <Thumb url={e.image_url} size={30} />}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                          {e.record_label || String(e.record_id || "").slice(0, 8)}
                        </div>
                        <div style={{ fontSize: 10.5, color: COLORS.textFaint }}>{e.resource}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ color: action ? action.color : COLORS.textDim, fontWeight: action ? 600 : 400 }}>
                    {action ? action.label : e.field}
                  </td>
                  {action ? (
                    // Added / Deleted have no before-and-after; the summary of
                    // what the record held spans both value columns.
                    <td colSpan={2} style={{ fontSize: 12, color: COLORS.textDim }}>
                      {e.new_value || e.old_value || "—"}
                    </td>
                  ) : (
                    <>
                      <td className="mn-num" style={{ color: COLORS.negative }}>{e.old_value || "—"}</td>
                      <td className="mn-num" style={{ color: COLORS.positive }}>{e.new_value || "—"}</td>
                    </>
                  )}
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{e.changed_by}</td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function RowLine({ label, value, bold, negative }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: bold ? 13.5 : 12.5, fontWeight: bold ? 700 : 400, color: negative ? COLORS.negative : COLORS.text, padding: "3px 0" }}>
      <span>{label}</span><span className="mn-num">{fmt(value)}</span>
    </div>
  );
}

function ReceiptView({ receipt, onNew, inventory = [] }) {
  const due = Math.max(0, receipt.sell - receipt.amountPaid);
  // The cart line carries its own photo, but if a bill was built before
  // photos were added to the cart — or the line came from anywhere else —
  // fall back to looking the product up in stock by id. Without this the
  // bill silently shows a grey box and looks like the feature is broken.
  const photoFor = (it) => {
    if (it.image) return it.image;
    const inv = inventory.find((x) => x.id === it.id);
    return (inv && (inv.image || inv.imageUrl)) || null;
  };
  return (
    <div className="mn-receipt" style={{ maxWidth: 380, margin: "0 auto" }}>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 22 }}>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 17 }}>Zaira's Collection</div>
          <div style={{ fontSize: 11, color: COLORS.textFaint }}>zairascollection.com</div>
        </div>
        <div style={{ fontSize: 12, color: COLORS.textDim, display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
          <span>{receipt.orderNo}</span><span>{receipt.date}</span>
        </div>
        <div style={{ fontSize: 12, marginBottom: 10 }}>Customer: {receipt.customer}{receipt.phone ? ` · ${receipt.phone}` : ""}</div>
        <div style={{ borderTop: `1px dashed ${COLORS.border}`, borderBottom: `1px dashed ${COLORS.border}`, padding: "10px 0", margin: "10px 0" }}>
          {receipt.items.map((it) => (
            <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, marginBottom: 8 }}>
              <Thumb url={photoFor(it)} size={34} eager />
              <span style={{ flex: 1 }}>{it.name} ×{it.qty}</span>
              <span className="mn-num">{fmt(it.price * it.qty)}</span>
            </div>
          ))}
        </div>
        <RowLine label="Subtotal" value={receipt.subtotal} />
        {receipt.discount > 0 && <RowLine label="Discount" value={-receipt.discount} />}
        <RowLine label="Total" value={receipt.sell} bold />
        <RowLine label="Amount paid" value={receipt.amountPaid} />
        {due > 0 && <RowLine label="Balance due" value={due} negative />}
        {receipt.method && <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 8 }}>Paid via {receipt.method}</div>}
        {receipt.billedBy && <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 2 }}>Billed by {receipt.billedBy}</div>}
        {/* On the customer's copy too: if they come back with a problem,
            the slip itself says who they dealt with. */}
        {receipt.soldBy && receipt.soldBy !== receipt.billedBy && (
          <div style={{ fontSize: 11, color: COLORS.textFaint }}>Sold by {receipt.soldBy}</div>
        )}
        <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 12, textAlign: "center" }}>Shukriya! Dobara tashreef laayen.</div>
      </div>
      <div className="mn-noprint" style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "center" }}>
        <button className="mn-btn" onClick={() => window.print()}><Printer size={14} /> Print</button>
        <button className="mn-btn-ghost" onClick={onNew}>New bill</button>
      </div>
    </div>
  );
}

function POS({ data, update, notify, user, role }) {
  const isManagerOrAbove = role === "owner" || role === "manager";
  const [cart, setCart] = useState([]);
  const [search, setSearch] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [soldBy, setSoldBy] = useState("");
  const [soldByType, setSoldByType] = useState("");
  const [discount, setDiscount] = useState(0);
  const [mode, setMode] = useState("Paid");
  const [partialAmount, setPartialAmount] = useState(0);
  const [dueDate, setDueDate] = useState("");
  const [method, setMethod] = useState("COD");
  const [status, setStatus] = useState("Delivered");
  const [accountId, setAccountId] = useState((data.accounts && data.accounts[0] && data.accounts[0].id) || "");
  const [receipt, setReceipt] = useState(null);

  const items = data.inventory.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));

  const addToCart = (item) => {
    setCart((c) => {
      const found = c.find((x) => x.id === item.id);
      if (found) return c.map((x) => (x.id === item.id ? { ...x, qty: x.qty + 1 } : x));
      return [...c, {
        id: item.id, name: item.name,
        price: Number(item.price), cost: Number(item.cost), qty: 1,
        // Carried through to the printed bill — a customer checking their
        // receipt recognises the picture faster than the item name.
        image: item.image || item.imageUrl || null,
      }];
    });
  };
  const handleScan = (e) => {
    if (e.key !== "Enter") return;
    const code = scanCode.trim().toLowerCase();
    if (!code) return;
    const match = data.inventory.find((i) => (i.sku || "").toLowerCase() === code);
    if (match) {
      addToCart(match);
      notify(`${match.name} added`);
    } else {
      notify("SKU not found");
    }
    setScanCode("");
  };
  const changeQty = (id, delta) => {
    setCart((c) => c.map((x) => (x.id === id ? { ...x, qty: Math.max(1, x.qty + delta) } : x)).filter((x) => x.qty > 0));
  };
  const removeItem = (id) => setCart((c) => c.filter((x) => x.id !== id));

  const subtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const costTotal = cart.reduce((s, c) => s + (Number(c.cost) || 0) * c.qty, 0);
  const total = Math.max(0, subtotal - Number(discount || 0));

  // Discount comes out of profit, not out of cost — so profit is measured
  // against what the customer actually pays.
  const billProfit = total - costTotal;
  const billMargin = total > 0 ? Math.round((billProfit / total) * 100) : 0;
  // An item with cost 0 was never costed properly; flag it rather than
  // quietly reporting 100% margin.
  const missingCost = cart.filter((c) => !Number(c.cost)).map((c) => c.name);

  // Warn at checkout rather than after, when the bill is already saved.
  const costWarning = missingCost.length > 0;

  const generateBill = () => {
    if (cart.length === 0) return;
    const orderNo = "INV-" + Math.floor(1000 + Math.random() * 9000);
    const productsSummary = cart.map((c) => `${c.name} x${c.qty}`).join(", ");
    const totalQty = cart.reduce((s, c) => s + c.qty, 0);
    const amountPaid = mode === "Paid" ? total : mode === "Partial" ? Number(partialAmount) || 0 : 0;
    const newOrder = {
      id: genId(), orderNo, customer: customer || "Walk-in customer", phone, product: productsSummary,
      qty: totalQty, sell: total, cost: costTotal, courier: "In-store", tracking: "", status,
      amountPaid, dueDate: amountPaid < total ? dueDate : "", method, date: todayISO(),
      billedBy: user?.name || "Unknown", city,
      // Kis ke through bika — default apna naam, lekin affiliate ki sale
      // counter par bill hoti hai to wahan uska naam chuna jata hai.
      soldBy: soldBy || user?.name || "Unknown",
      soldByType: soldBy ? soldByType || "Other" : "Staff",
      // Counter sale: no courier, so no delivery charge — and tagging the
      // channel keeps POS separate from website sales in the profit tracker.
      channel: "Walk-in / POS", deliveryCharge: 0,
    };
    update("orders", (list) => [...list, newOrder]);
    update("inventory", (list) => list.map((inv) => {
      const c = cart.find((x) => x.id === inv.id);
      if (!c) return inv;
      return { ...inv, quantity: Math.max(0, Number(inv.quantity) - c.qty) };
    }));
    if (amountPaid > 0 && accountId) {
      update("accounts", (list) => list.map((a) => (a.id === accountId ? { ...a, balance: Number(a.balance || 0) + amountPaid } : a)));
    }
    setReceipt({ ...newOrder, items: cart, discount: Number(discount || 0), subtotal });
    setCart([]); setCustomer(""); setPhone(""); setCity(""); setDiscount(0); setPartialAmount(0); setDueDate("");
    setSoldBy(""); setSoldByType("");
    notify("Bill generated");
  };

  if (receipt) return <ReceiptView receipt={receipt} inventory={data.inventory} onNew={() => setReceipt(null)} />;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, alignItems: "start" }}>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Select products" />
        <div style={{ position: "relative", marginBottom: 10 }}>
          <ScanLine size={14} style={{ position: "absolute", left: 9, top: 9, color: COLORS.accent }} />
          <input
            className="mn-input" style={{ paddingLeft: 30 }}
            placeholder="Scan barcode or type SKU + Enter"
            value={scanCode}
            onChange={(e) => setScanCode(e.target.value)}
            onKeyDown={handleScan}
          />
        </div>
        <SearchBox value={search} onChange={setSearch} />
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6, maxHeight: 380, overflowY: "auto" }} className="mn-scroll">
          {items.length === 0 ? <EmptyRow text="Koi item nahi mila." /> : items.map((i) => (
            <button key={i.id} onClick={() => addToCart(i)} style={{ display: "flex", alignItems: "center", gap: 10, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 7, padding: 8, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
              <Thumb url={i.image || i.imageUrl} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: COLORS.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{i.name}</div>
                <div style={{ fontSize: 11, color: COLORS.textFaint }}>{i.sku} · {i.quantity} in stock</div>
              </div>
              <div className="mn-num" style={{ fontSize: 13, color: COLORS.accent }}>{fmt(i.price)}</div>
              <Plus size={14} color={COLORS.textFaint} />
            </button>
          ))}
        </div>
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Bill" />
        {cart.length === 0 ? <EmptyRow text="Cart khali hai — product select karein." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
            {cart.map((c) => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
                <button onClick={() => changeQty(c.id, -1)} style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 4, width: 20, height: 20, color: COLORS.text, cursor: "pointer" }}><Minus size={11} /></button>
                <span className="mn-num" style={{ width: 18, textAlign: "center" }}>{c.qty}</span>
                <button onClick={() => changeQty(c.id, 1)} style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 4, width: 20, height: 20, color: COLORS.text, cursor: "pointer" }}><Plus size={11} /></button>
                <span className="mn-num" style={{ width: 70, textAlign: "right" }}>{fmt(c.price * c.qty)}</span>
                <button onClick={() => removeItem(c.id)} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={13} /></button>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
          <input className="mn-input" placeholder="Customer name" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <input className="mn-input" placeholder="Phone (optional)" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div style={{ marginBottom: 10 }}>
          <input className="mn-input" placeholder="City (optional)" value={city} onChange={(e) => setCity(e.target.value)} />
          <div style={{ marginTop: 8 }}>
            <SellerPicker value={soldBy} type={soldByType} onChange={(n, k) => { setSoldBy(n); setSoldByType(k); }} />
          </div>
          <CustomerRiskBanner phone={phone} />
        </div>

        <RowLine label="Subtotal" value={subtotal} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
          <span style={{ fontSize: 12.5 }}>Discount (Rs)</span>
          <input className="mn-input" type="number" style={{ width: 90, textAlign: "right" }} value={discount} onChange={(e) => setDiscount(e.target.value)} />
        </div>
        <RowLine label="Total" value={total} bold />

        {/* Profit on this bill. costTotal comes straight from each item's
            real cost in inventory, so the margin is the actual one — not a
            guess. Deliberately not on the printed receipt: that goes to
            the customer. */}
        {isManagerOrAbove && (
          <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${COLORS.borderSoft}` }}>
            <RowLine label="Inventory cost" value={-costTotal} negative />
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13.5, fontWeight: 700, padding: "3px 0", color: billProfit >= 0 ? COLORS.positive : COLORS.negative }}>
              <span>Is bill ka profit</span>
              <span className="mn-num">{fmt(billProfit)}{total > 0 ? ` · ${billMargin}%` : ""}</span>
            </div>
            {missingCost.length > 0 && (
              <div style={{ fontSize: 11, color: COLORS.negative, marginTop: 4 }}>
                In items ki cost inventory mein 0 hai, is liye profit zyada dikh raha hai: {missingCost.join(", ")}
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Payment</label>
          <div style={{ display: "flex", gap: 6 }}>
            {["Paid", "Partial", "Pending"].map((m) => (
              <button key={m} onClick={() => setMode(m)} style={{ flex: 1, padding: "7px 4px", borderRadius: 6, fontSize: 12, fontFamily: "inherit", fontWeight: 600, cursor: "pointer", border: `1px solid ${mode === m ? COLORS.accent : COLORS.border}`, background: mode === m ? COLORS.accentDim : "transparent", color: mode === m ? COLORS.accent : COLORS.textDim }}>
                {m === "Pending" ? "Udhar" : m}
              </button>
            ))}
          </div>
        </div>

        {mode === "Partial" && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Amount received now (Rs)</label>
            <input className="mn-input" type="number" value={partialAmount} onChange={(e) => setPartialAmount(e.target.value)} />
          </div>
        )}
        {(mode === "Partial" || mode === "Pending") && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Due date (optional)</label>
            <input className="mn-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
          <select className="mn-input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {["COD", "Bank Transfer", "JazzCash", "EasyPaisa"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <select className="mn-input" value={status} onChange={(e) => setStatus(e.target.value)}>
            {["Delivered", "Pending", "Shipped"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>

        {mode !== "Pending" && (data.accounts || []).length > 0 && (
          <div style={{ marginTop: 10 }}>
            <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Receive into account</label>
            <select className="mn-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {data.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}

        <button className="mn-btn" style={{ width: "100%", justifyContent: "center", marginTop: 14 }} onClick={generateBill} disabled={cart.length === 0}>
          <Receipt size={14} /> Generate bill
        </button>
      </div>
    </div>
  );
}

function Accounts({ accounts, update, notify }) {
  const [adding, setAdding] = useState(false);
  const fields = [
    { key: "name", label: "Account name", required: true, placeholder: "e.g. Meezan Bank" },
    { key: "type", label: "Type", type: "select", options: ["Cash", "Bank", "JazzCash", "EasyPaisa", "Other"] },
    { key: "balance", label: "Opening balance (Rs)", type: "number", default: 0 },
  ];
  const total = accounts.reduce((s, a) => s + Number(a.balance || 0), 0);
  return (
    <Panel title="Accounts" addLabel="Add account" onAdd={() => setAdding(true)} count={`${accounts.length} accounts · Total ${fmt(total)}`}>
      {adding && (
        <AddForm
          title="New account" fields={fields} onCancel={() => setAdding(false)}
          onSave={(v) => {
            update((list) => [...list, { id: genId(), ...v, balance: Number(v.balance) }]);
            setAdding(false);
            notify("Account added");
          }}
        />
      )}
      {accounts.length === 0 ? <EmptyRow text="Koi account add nahi hua." /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>Account</th><th>Type</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td><Badge text={a.type} tone="info" /></td>
                <td className="mn-num" style={{ color: Number(a.balance) < 0 ? COLORS.negative : COLORS.text }}>{fmt(a.balance)}</td>
                <td><DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== a.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Expenses({ expenses, accounts, update, updateAccounts, notify }) {
  const [adding, setAdding] = useState(false);
  const total = expenses.reduce((s, x) => s + Number(x.amount || 0), 0);
  return (
    <Panel title="Expenses" addLabel="Add expense" onAdd={() => setAdding(true)} count={`${expenses.length} expenses · Total ${fmt(total)}`}>
      {adding && (
        <div style={{ padding: 18, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
          <ExpenseForm
            accounts={accounts || []}
            onCancel={() => setAdding(false)}
            onSave={(v) => {
              update((list) => [...list, { id: genId(), ...v, amount: Number(v.amount) }]);
              if (v.accountId) updateAccounts((list) => list.map((a) => (a.id === v.accountId ? { ...a, balance: Number(a.balance || 0) - Number(v.amount) } : a)));
              setAdding(false);
              notify("Expense added");
            }}
          />
        </div>
      )}
      {expenses.length === 0 ? <EmptyRow text="Koi expense record nahi." /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>Expense</th><th>Category</th><th>Amount</th><th>Account</th><th>Date</th><th></th></tr></thead>
          <tbody>
            {expenses.map((x) => (
              <tr key={x.id}>
                <td>{x.title}</td>
                <td style={{ color: COLORS.textDim }}>{x.category}</td>
                <td className="mn-num" style={{ color: COLORS.negative }}>{fmt(x.amount)}</td>
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{accountName(accounts || [], x.accountId)}</td>
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{x.date}</td>
                <td><DeleteBtn onClick={() => update((list) => list.filter((y) => y.id !== x.id))} /></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function ExpenseForm({ accounts, onCancel, onSave }) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Rent");
  const [amount, setAmount] = useState(0);
  const [date, setDate] = useState(todayISO());
  const [accountId, setAccountId] = useState((accounts[0] && accounts[0].id) || "");
  const submit = () => {
    if (!title.trim() || !amount) return;
    onSave({ title, category, amount, date, accountId });
  };
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>New expense</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10 }}>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Expense</label>
          <input className="mn-input" placeholder="e.g. Shop rent" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Category</label>
          <select className="mn-input" value={category} onChange={(e) => setCategory(e.target.value)}>
            {["Rent", "Utilities (Bijli/Gas/Internet)", "Marketing/Ads", "Packaging/Shipping", "Staff Advance", "Miscellaneous", "Other"].map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Amount (Rs)</label>
          <input className="mn-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Date</label>
          <input className="mn-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Paid from</label>
          <select className="mn-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      </div>
      {footer && footer(vals)}
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={submit}>Save</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function Finance({ data, metrics }) {
  const pendingReceivables = data.orders.filter((o) => o.status !== "Returned" && amountDueOf(o) > 0);
  const pendingSalaries = data.employees.filter((e) => e.status === "Pending");
  const pendingCommissions = data.affiliates.filter((a) => a.payment === "Pending");

  const ledger = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => {
      if (o.status === "Returned") return;
      const due = amountDueOf(o);
      if (due <= 0) return;
      if (!map[o.customer]) map[o.customer] = { customer: o.customer, due: 0, nextDue: null };
      map[o.customer].due += due;
      if (o.dueDate && (!map[o.customer].nextDue || o.dueDate < map[o.customer].nextDue)) {
        map[o.customer].nextDue = o.dueDate;
      }
    });
    return Object.values(map).sort((a, b) => b.due - a.due);
  }, [data.orders]);

  const Row = ({ label, value, tone, big }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
      <span style={{ fontSize: big ? 14 : 13, color: big ? COLORS.text : COLORS.textDim, fontWeight: big ? 600 : 400 }}>{label}</span>
      <span className="mn-num" style={{ fontSize: big ? 17 : 14, fontWeight: 600, color: tone === "positive" ? COLORS.positive : tone === "negative" ? COLORS.negative : COLORS.text }}>{fmt(value)}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Revenue" value={fmt(metrics.revenue)} />
        <StatCard label="Cost of goods" value={fmt(metrics.cogs)} />
        <StatCard label="Gross profit" value={fmt(metrics.grossProfit)} tone={metrics.grossProfit >= 0 ? "positive" : "negative"} />
        <StatCard label="Net profit" value={fmt(metrics.netProfit)} tone={metrics.netProfit >= 0 ? "positive" : "negative"} />
      </div>

      <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Profit and loss" />
          <Row label="Revenue (delivered/shipped orders)" value={metrics.revenue} tone="positive" />
          <Row label="Cost of goods sold" value={-metrics.cogs} tone="negative" />
          <Row label="Gross profit" value={metrics.grossProfit} big />
          <Row label="Salaries" value={-metrics.salaries} tone="negative" />
          <Row label="Affiliate commissions" value={-metrics.commissions} tone="negative" />
          <Row label="Other expenses" value={-metrics.totalExpenses} tone="negative" />
          <Row label="Net profit" value={metrics.netProfit} big tone={metrics.netProfit >= 0 ? "positive" : "negative"} />
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Payments overview" />
          <Row label="Pending from customers" value={metrics.receivable} tone="negative" />
          <Row label="Pending salaries + commissions" value={metrics.payable} tone="negative" />
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
            {pendingReceivables.length === 0 && pendingSalaries.length === 0 && pendingCommissions.length === 0 ? (
              <EmptyRow text="Koi pending payment nahi." />
            ) : (
              <>
                {pendingReceivables.map((o) => <PendingLine key={o.id} label={`${o.customer} — ${o.orderNo}${o.dueDate ? ` (due ${o.dueDate})` : ""}`} value={amountDueOf(o)} tag="Receive" />)}
                {pendingSalaries.map((e) => <PendingLine key={e.id} label={`${e.name} — salary`} value={e.salary} tag="Pay" />)}
                {pendingCommissions.map((a) => <PendingLine key={a.id} label={`${a.name} — commission`} value={a.commission} tag="Pay" />)}
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Customer ledger (Khata)" />
        {ledger.length === 0 ? (
          <EmptyRow text="Koi udhar / partial payment pending nahi." />
        ) : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Customer</th><th>Amount due</th><th>Next due date</th></tr></thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.customer}>
                  <td>{l.customer}</td>
                  <td className="mn-num" style={{ color: COLORS.negative }}>{fmt(l.due)}</td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{l.nextDue || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function PendingLine({ label, value, tag }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
      <span style={{ color: COLORS.textDim }}>{tag === "Receive" ? "↓ " : "↑ "}{label}</span>
      <span className="mn-num" style={{ color: COLORS.textFaint }}>{fmt(value)}</span>
    </div>
  );
}

function SearchBox({ value, onChange }) {
  return (
    <div style={{ position: "relative" }}>
      <Search size={14} style={{ position: "absolute", left: 9, top: 9, color: COLORS.textFaint }} />
      <input
        className="mn-input"
        style={{ paddingLeft: 30, width: 180 }}
        placeholder="Search..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function DeleteBtn({ onClick }) {
  return (
    <button onClick={onClick} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer", padding: 4 }}>
      <Trash2 size={14} />
    </button>
  );
}

function ChartCard({ title, children, height = 260 }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title={title} />
      <div style={{ width: "100%", height }}>{children}</div>
    </div>
  );
}

function Reports({ data, role }) {
  const isManagerOrAbove = role === "owner" || role === "manager";
  const byDate = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => {
      if (o.status === "Returned") return;
      const d = o.date || todayISO();
      if (!map[d]) map[d] = { date: d, revenue: 0, cost: 0 };
      map[d].revenue += Number(o.sell || 0);
      map[d].cost += Number(o.cost || 0);
    });
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((r) => ({ ...r, profit: r.revenue - r.cost }));
  }, [data.orders]);

  const statusCounts = useMemo(() => {
    const order = ["Pending", "Shipped", "Delivered", "Returned"];
    return order.map((s) => ({ status: s, count: data.orders.filter((o) => o.status === s).length }));
  }, [data.orders]);

  const stockByCategory = useMemo(() => {
    const map = {};
    data.inventory.forEach((i) => {
      const cat = i.category || "Other";
      map[cat] = (map[cat] || 0) + Number(i.quantity || 0) * Number(i.cost || 0);
    });
    return Object.entries(map).map(([category, value]) => ({ category, value }));
  }, [data.inventory]);

  // City-wise performance — which cities sell well vs. return a lot,
  // inspired by COD-market profit trackers like Financify.
  const cityStats = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => {
      const city = (o.city || "Unknown").trim() || "Unknown";
      if (!map[city]) map[city] = { city, orders: 0, revenue: 0, returned: 0 };
      map[city].orders += 1;
      if (o.status === "Returned") map[city].returned += 1;
      else map[city].revenue += Number(o.sell || 0);
    });
    return Object.values(map)
      .map((c) => ({ ...c, returnRate: c.orders ? Math.round((c.returned / c.orders) * 100) : 0 }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data.orders]);

  // This month vs last month, for a quick trend check.
  const monthComparison = useMemo(() => {
    const now = new Date();
    const thisMonth = now.toISOString().slice(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonth = lastMonthDate.toISOString().slice(0, 7);
    const sumFor = (m) => {
      const os = data.orders.filter((o) => (o.date || "").startsWith(m) && o.status !== "Returned");
      return { revenue: os.reduce((s, o) => s + Number(o.sell || 0), 0), profit: os.reduce((s, o) => s + Number(o.sell || 0) - Number(o.cost || 0), 0), count: os.length };
    };
    return { thisMonth: sumFor(thisMonth), lastMonth: sumFor(lastMonth) };
  }, [data.orders]);

  const pctChange = (curr, prev) => (prev === 0 ? (curr > 0 ? 100 : 0) : Math.round(((curr - prev) / prev) * 100));

  const hasOrders = data.orders.length > 0;
  const hasInventory = data.inventory.length > 0;

  // Parses "Item Name x2, Other Item x1" style summaries (used for both POS
  // and WooCommerce-synced orders) to rank products by units sold.
  const bestSellers = useMemo(() => {
    const map = {};
    data.orders.forEach((o) => {
      if (o.status === "Returned" || !o.product) return;
      o.product.split(",").forEach((seg) => {
        const m = seg.trim().match(/^(.*)\s+x(\d+(?:\.\d+)?)$/i);
        if (m) {
          const name = m[1].trim();
          const qty = Number(m[2]);
          map[name] = (map[name] || 0) + qty;
        }
      });
    });
    return Object.entries(map)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 8);
  }, [data.orders]);

  const downloadMonthlyReport = () => {
    const month = todayISO().slice(0, 7); // YYYY-MM
    const monthOrders = data.orders.filter((o) => (o.date || "").startsWith(month));
    const activeOrders = monthOrders.filter((o) => o.status !== "Returned");
    const revenue = activeOrders.reduce((s, o) => s + Number(o.sell || 0), 0);
    const cogs = activeOrders.reduce((s, o) => s + Number(o.cost || 0), 0);
    const returned = monthOrders.filter((o) => o.status === "Returned").length;
    const stockInvestment = data.inventory.reduce((s, i) => s + Number(i.cost || 0) * Number(i.quantity || 0), 0);

    const lines = [];
    lines.push(`Munshi — Monthly Analysis — ${month}`);
    lines.push("");
    lines.push("Summary,Amount");
    lines.push(`Revenue,${revenue}`);
    lines.push(`Cost of goods sold,${cogs}`);
    lines.push(`Gross profit,${revenue - cogs}`);
    lines.push(`Orders this month,${monthOrders.length}`);
    lines.push(`Returned orders,${returned}`);
    lines.push(`Current stock investment (all-time),${stockInvestment}`);
    lines.push("");
    lines.push("Best-selling products,Units sold");
    bestSellers.forEach((p) => lines.push(`${p.name.replace(/,/g, " ")},${p.qty}`));
    lines.push("");
    lines.push("Low stock items,Quantity,Reorder level");
    data.inventory.filter((i) => Number(i.quantity) <= Number(i.reorder)).forEach((i) => {
      lines.push(`${i.name.replace(/,/g, " ")},${i.quantity},${i.reorder}`);
    });
    lines.push("");
    lines.push("Order No,Date,Customer,Product,Amount,Status");
    monthOrders.forEach((o) => {
      lines.push(`${o.orderNo},${o.date},${(o.customer || "").replace(/,/g, " ")},${(o.product || "").replace(/,/g, " ")},${o.sell},${o.status}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `munshi-report-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {isManagerOrAbove && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button className="mn-btn-ghost" onClick={downloadMonthlyReport} style={{ fontSize: 12 }}>
            Download this month's analysis (CSV)
          </button>
        </div>
      )}
      <ChartCard title="Revenue & profit trend">
        {!hasOrders ? <EmptyRow text="Chart k liye orders add karein." /> : (
          <Suspense fallback={<ChartFallback />}><RevenueProfitTrend data={byDate} /></Suspense>
        )}
      </ChartCard>

      <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <ChartCard title="Orders by status" height={240}>
          {!hasOrders ? <EmptyRow text="Koi order nahi." /> : (
            <Suspense fallback={<ChartFallback />}><OrdersByStatus data={statusCounts} /></Suspense>
          )}
        </ChartCard>

        <ChartCard title="Stock value by category" height={240}>
          {!hasInventory ? <EmptyRow text="Koi inventory nahi." /> : (
            <Suspense fallback={<ChartFallback />}><StockByCategory data={stockByCategory} /></Suspense>
          )}
        </ChartCard>
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Best-selling products" />
        {bestSellers.length === 0 ? <EmptyRow text="Abhi tak koi bikri nahi." /> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {bestSellers.map((p, idx) => (
              <div key={p.name} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <span style={{ width: 18, color: COLORS.textFaint, fontFamily: "'Space Grotesk', sans-serif" }}>{idx + 1}</span>
                <span style={{ flex: 1 }}>{p.name}</span>
                <span className="mn-num" style={{ color: COLORS.accent }}>{p.qty} sold</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isManagerOrAbove && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="This month vs last month" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px,1fr))", gap: 12, marginTop: 6 }}>
            <StatCard label="Revenue" value={fmt(monthComparison.thisMonth.revenue)} sub={`${pctChange(monthComparison.thisMonth.revenue, monthComparison.lastMonth.revenue) >= 0 ? "+" : ""}${pctChange(monthComparison.thisMonth.revenue, monthComparison.lastMonth.revenue)}% vs last month`} tone={monthComparison.thisMonth.revenue >= monthComparison.lastMonth.revenue ? "positive" : "negative"} />
            <StatCard label="Profit" value={fmt(monthComparison.thisMonth.profit)} sub={`${pctChange(monthComparison.thisMonth.profit, monthComparison.lastMonth.profit) >= 0 ? "+" : ""}${pctChange(monthComparison.thisMonth.profit, monthComparison.lastMonth.profit)}% vs last month`} tone={monthComparison.thisMonth.profit >= monthComparison.lastMonth.profit ? "positive" : "negative"} />
            <StatCard label="Orders" value={monthComparison.thisMonth.count} sub={`Last month: ${monthComparison.lastMonth.count}`} />
          </div>
        </div>
      )}

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="City-wise performance" />
        {cityStats.length === 0 ? <EmptyRow text="Abhi tak koi order nahi." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>City</th><th>Orders</th><th>Revenue</th><th>Return rate</th></tr></thead>
            <tbody>
              {cityStats.map((c) => (
                <tr key={c.city}>
                  <td>{c.city}</td>
                  <td className="mn-num">{c.orders}</td>
                  <td className="mn-num">{fmt(c.revenue)}</td>
                  <td className="mn-num" style={{ color: c.returnRate > 20 ? COLORS.negative : COLORS.textDim }}>{c.returnRate}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

// =====================================================================
// Profit tracker — Financify-style true-profit view.
//
// The point of this screen: revenue is not profit. In a COD business the
// courier fee, the return fee, the refund, the packing and the ad spend
// all come out of the same sale, and the only number that matters is what
// is left at the bottom. Everything here is computed by /analytics so the
// month-end sheet and this screen can never disagree.
// =====================================================================

const RANGE_PRESETS = [
  { id: "thisMonth", label: "This month" },
  { id: "lastMonth", label: "Last month" },
  { id: "last30", label: "Last 30 days" },
  { id: "last7", label: "Last 7 days" },
];

function rangeFor(preset) {
  const now = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  if (preset === "lastMonth") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: iso(start), to: iso(end) };
  }
  if (preset === "last30") return { from: iso(new Date(now.getTime() - 29 * 864e5)), to: iso(now) };
  if (preset === "last7") return { from: iso(new Date(now.getTime() - 6 * 864e5)), to: iso(now) };
  return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
}

function ProfitTracker({ notify }) {
  const [preset, setPreset] = useState("thisMonth");
  const [range, setRange] = useState(() => rangeFor("thisMonth"));
  const [a, setA] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setRange(rangeFor(preset)); }, [preset]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getAnalytics(range.from, range.to)
      .then((res) => { if (alive) setA(res); })
      .catch((err) => notify(`Analytics failed: ${err.message}`))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [range.from, range.to]);

  if (loading && !a) return <EmptyRow text="Profit data load ho raha hai..." />;
  if (!a) return <EmptyRow text="Data load nahi hua." />;

  const s = a.summary;
  const tone = s.netProfit >= 0 ? "positive" : "negative";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        {RANGE_PRESETS.map((r) => (
          <button
            key={r.id}
            className={preset === r.id ? "mn-btn" : "mn-btn-ghost"}
            style={{ fontSize: 12 }}
            onClick={() => setPreset(r.id)}
          >{r.label}</button>
        ))}
        <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          <input className="mn-input" style={{ width: 140 }} type="date" value={range.from} onChange={(e) => setRange((x) => ({ ...x, from: e.target.value }))} />
          <span style={{ color: COLORS.textFaint, fontSize: 12 }}>to</span>
          <input className="mn-input" style={{ width: 140 }} type="date" value={range.to} onChange={(e) => setRange((x) => ({ ...x, to: e.target.value }))} />
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Revenue" value={fmt(s.revenue)} sub={`${s.orders} orders · AOV ${fmt(s.aov)}`} />
        <StatCard label="Gross profit" value={fmt(s.grossProfit)} sub={`COGS ${fmt(s.cogs)}`} />
        <StatCard label="COD costs" value={fmt(s.codCosts)} sub="Delivery + return + refunds + packing" tone="negative" />
        <StatCard label="Ad spend" value={fmt(s.adSpend)} sub={a.roas.cac ? `CAC ${fmt(a.roas.cac)} per delivered order` : "Ad spend add karein"} tone="negative" />
        <StatCard label="Net profit" value={fmt(s.netProfit)} sub={`${s.margin}% margin`} tone={tone} />
        <StatCard label="Return rate" value={`${s.returnRate}%`} sub={`${s.returnedOrders} of ${s.orders} orders`} tone={s.returnRate > 20 ? "negative" : undefined} />
      </div>

      <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Profit breakdown — paisa kahan gaya" />
          <RowLine label="Revenue (non-returned sales)" value={s.revenue} bold />
          <RowLine label="− Cost of goods" value={-s.cogs} negative />
          <RowLine label="= Gross profit" value={s.grossProfit} bold />
          <div style={{ height: 8 }} />
          <RowLine label="− Delivery charges" value={-s.deliveryCharges} negative />
          <RowLine label="− Return charges" value={-s.returnCharges} negative />
          <RowLine label="− Refunds given" value={-s.refunds} negative />
          <RowLine label="− Packaging" value={-s.packaging} negative />
          <RowLine label="− Cash handling" value={-s.cashHandling} negative />
          <RowLine label="− Ad spend" value={-s.adSpend} negative />
          <RowLine label="= Contribution profit" value={s.contributionProfit} bold />
          <div style={{ height: 8 }} />
          <RowLine label="− Salaries (paid)" value={-s.salaries} negative />
          <RowLine label="− Affiliate commissions" value={-s.commissions} negative />
          <RowLine label="− Other expenses" value={-s.otherExpenses} negative />
          {s.tax > 0 && <RowLine label="− Tax" value={-s.tax} negative />}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: s.netProfit >= 0 ? COLORS.positive : COLORS.negative }}>
              <span>Net profit</span><span className="mn-num">{fmt(s.netProfit)}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
            <SectionHeading title="ROAS — asli tasveer" />
            <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <StatCard label="Purchase ROAS" value={a.roas.purchase != null ? `${a.roas.purchase}x` : "—"} sub="Har order count hota hai" />
              <StatCard
                label="Post-delivery ROAS" value={a.roas.postDelivery != null ? `${a.roas.postDelivery}x` : "—"}
                sub="Sirf delivered orders"
                tone={a.roas.postDelivery != null && a.roas.postDelivery < 1.5 ? "negative" : "positive"}
              />
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
              COD mein purchase ROAS hamesha bara lagta hai. Faisla post-delivery ROAS par karein — cash jo waqai aya.
              Cash collected: <span className="mn-num" style={{ color: COLORS.text }}>{fmt(a.roas.cashCollected)}</span>
            </div>
          </div>

          <ChartCard title="Daily revenue vs ad spend vs profit" height={220}>
            {a.daily.length === 0 ? <EmptyRow text="Is period mein koi data nahi." /> : (
              <Suspense fallback={<ChartFallback />}><DailyProfitTrend data={a.daily} /></Suspense>
            )}
          </ChartCard>
        </div>
      </div>

      <BreakdownTable title="City-wise performance" rows={a.byCity} keyLabel="City" hint="Jahan return rate zyada hai, wahan COD band karke advance lein." />
      <BreakdownTable title="Courier-wise performance" rows={a.byCourier} keyLabel="Courier" hint="Jo courier zyada return karwata hai, uska hissa kam karein." />
      <BreakdownTable title="Channel-wise performance" rows={a.byChannel} keyLabel="Channel" />
      <BreakdownTable
        title="Kis ke through kitni sale (sold by)" rows={a.bySeller} keyLabel="Sold by"
        hint="Affiliates aur staff dono yahan aate hain — commission aur performance dono isi se dekhein."
      />
      <BreakdownTable title="Staff-wise sales (billed by)" rows={a.byStaff} keyLabel="Billed by" hint="Ye woh banda hai jis ne bill likha — sold by se alag ho sakta hai." />

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Product-wise profit" />
        {a.byProduct.length === 0 ? <EmptyRow text="Abhi tak koi product bika nahi." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Product</th><th>Units</th><th>Returned</th><th>Revenue</th><th>Cost</th><th>Profit</th><th>Margin</th></tr></thead>
            <tbody>
              {a.byProduct.map((pr) => (
                <tr key={pr.name}>
                  <td>{pr.name}</td>
                  <td className="mn-num">{pr.units}</td>
                  <td className="mn-num" style={{ color: pr.returnedUnits > 0 ? COLORS.negative : COLORS.textFaint }}>{pr.returnedUnits || "—"}</td>
                  <td className="mn-num">{fmt(pr.revenue)}</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{fmt(pr.cost)}</td>
                  <td className="mn-num" style={{ color: pr.profit >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(pr.profit)}</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{pr.margin}%</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </div>
  );
}

function BreakdownTable({ title, rows, keyLabel, hint }) {
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title={title} />
      {(!rows || rows.length === 0) ? <EmptyRow text="Is period mein koi data nahi." /> : (
        <>
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>{keyLabel}</th><th>Orders</th><th>Delivered</th><th>Returned</th><th>Return rate</th><th>Revenue</th><th>Profit</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.key}</td>
                  <td className="mn-num">{r.orders}</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{r.delivered}</td>
                  <td className="mn-num" style={{ color: r.returned ? COLORS.negative : COLORS.textFaint }}>{r.returned}</td>
                  <td className="mn-num" style={{ color: r.returnRate > 20 ? COLORS.negative : COLORS.textDim }}>{r.returnRate}%</td>
                  <td className="mn-num">{fmt(r.revenue)}</td>
                  <td className="mn-num" style={{ color: r.profit >= 0 ? COLORS.positive : COLORS.negative }}>{fmt(r.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          {hint && <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>{hint}</div>}
        </>
      )}
    </div>
  );
}

// =====================================================================
// Monthly analysis sheet — "mahine ke baad khud hi ban jaye".
//
// The backend freezes a full sheet for every month (a Railway cron hits
// /reports/month-end/cron on the 1st). This screen lists those frozen
// months, can generate any month on demand, and exports to CSV / print.
// =====================================================================
function MonthlySheet({ notify }) {
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [sheet, setSheet] = useState(null);
  const [saved, setSaved] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = (m) => {
    setLoading(true);
    getMonthlySheet(m)
      .then(setSheet)
      .catch((err) => notify(`Sheet failed: ${err.message}`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(month); }, [month]);
  useEffect(() => { getSavedSheets().then(setSaved).catch(() => {}); }, [sheet]);

  const downloadCsv = () => {
    if (!sheet) return;
    const s = sheet.summary;
    const L = [];
    const push = (...cells) => L.push(cells.map((c) => String(c ?? "").replace(/,/g, " ")).join(","));

    push(`Munshi — Monthly Analysis — ${sheet.month}`);
    push("");
    push("PROFIT & LOSS", "Amount (Rs)");
    push("Revenue", s.revenue);
    push("Cost of goods sold", s.cogs);
    push("Gross profit", s.grossProfit);
    push("Delivery charges", s.deliveryCharges);
    push("Return charges", s.returnCharges);
    push("Refunds", s.refunds);
    push("Packaging", s.packaging);
    push("Cash handling", s.cashHandling);
    push("Ad spend", s.adSpend);
    push("Contribution profit", s.contributionProfit);
    push("Salaries", s.salaries);
    push("Affiliate commissions", s.commissions);
    push("Other expenses", s.otherExpenses);
    push("Tax", s.tax);
    push("NET PROFIT", s.netProfit);
    push("Net margin %", s.margin);
    push("");
    push("ORDERS", "Count");
    push("Total orders", s.orders);
    push("Delivered", s.deliveredOrders);
    push("Returned", s.returnedOrders);
    push("Return rate %", s.returnRate);
    push("Average order value", s.aov);
    push("");
    push("ROAS", "Value");
    push("Purchase ROAS", sheet.roas.purchase ?? "—");
    push("Post-delivery ROAS", sheet.roas.postDelivery ?? "—");
    push("CAC per delivered order", sheet.roas.cac ?? "—");
    push("Cash collected", sheet.roas.cashCollected);
    push("");
    push("CITY", "Orders", "Delivered", "Returned", "Return rate %", "Revenue", "Profit");
    sheet.byCity.forEach((c) => push(c.key, c.orders, c.delivered, c.returned, c.returnRate, c.revenue, c.profit));
    push("");
    push("COURIER", "Orders", "Delivered", "Returned", "Return rate %", "Revenue", "Profit");
    sheet.byCourier.forEach((c) => push(c.key, c.orders, c.delivered, c.returned, c.returnRate, c.revenue, c.profit));
    push("");
    push("SOLD BY", "Orders", "Revenue", "Profit");
    (sheet.bySeller || []).forEach((c) => push(c.key, c.orders, c.revenue, c.profit));
    push("");
    push("BILLED BY", "Orders", "Revenue", "Profit");
    sheet.byStaff.forEach((c) => push(c.key, c.orders, c.revenue, c.profit));
    push("");
    push("PRODUCT", "Units", "Returned units", "Revenue", "Cost", "Profit", "Margin %");
    sheet.byProduct.forEach((pr) => push(pr.name, pr.units, pr.returnedUnits, pr.revenue, pr.cost, pr.profit, pr.margin));
    push("");
    push("RETURN REASON", "Count");
    (sheet.returnReasons || []).forEach((r) => push(r.reason, r.count));
    push("");
    push("LOW STOCK ITEM", "SKU", "Quantity", "Reorder level");
    (sheet.stock?.lowStock || []).forEach((i) => push(i.name, i.sku, i.quantity, i.reorder));
    push("");
    push("Stock invested (at cost)", sheet.stock?.invested ?? 0);
    push("Stock retail value", sheet.stock?.retailValue ?? 0);

    const blob = new Blob([L.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `munshi-analysis-${sheet.month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !sheet) return <EmptyRow text="Sheet ban rahi hai..." />;
  if (!sheet) return <EmptyRow text="Sheet load nahi hui." />;

  const s = sheet.summary;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input className="mn-input" style={{ width: 160 }} type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        {saved.length > 0 && (
          <select className="mn-input" style={{ width: 200 }} value="" onChange={(e) => e.target.value && setMonth(e.target.value)}>
            <option value="">Saved month-end sheets…</option>
            {saved.map((x) => <option key={x.month} value={x.month}>{x.month}</option>)}
          </select>
        )}
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="mn-btn-ghost" onClick={() => window.print()}><Printer size={13} /> Print</button>
          <button className="mn-btn" onClick={downloadCsv}><FileText size={13} /> Download CSV</button>
        </div>
      </div>

      <div style={{ fontSize: 11.5, color: COLORS.textFaint }}>
        Har mahine ki 1 tareekh ko pichle mahine ki sheet khud save ho jati hai. Yahan koi bhi mahina dobara bana kar dekh sakte hain.
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Revenue" value={fmt(s.revenue)} sub={`${s.orders} orders`} />
        <StatCard label="Gross profit" value={fmt(s.grossProfit)} sub={`COGS ${fmt(s.cogs)}`} />
        <StatCard label="Net profit" value={fmt(s.netProfit)} sub={`${s.margin}% margin`} tone={s.netProfit >= 0 ? "positive" : "negative"} />
        <StatCard label="Returns" value={`${s.returnedOrders}`} sub={`${s.returnRate}% · loss ${fmt(s.returnCharges + s.refunds)}`} tone={s.returnRate > 20 ? "negative" : undefined} />
        <StatCard label="Ad spend" value={fmt(s.adSpend)} sub={sheet.roas.postDelivery != null ? `${sheet.roas.postDelivery}x post-delivery ROAS` : "No ad spend logged"} />
        <StatCard label="Stock invested" value={fmt(sheet.stock?.invested || 0)} sub={`Retail ${fmt(sheet.stock?.retailValue || 0)}`} />
      </div>

      <div className="mn-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title={`Profit & loss — ${sheet.month}`} />
          <RowLine label="Revenue" value={s.revenue} bold />
          <RowLine label="− Cost of goods" value={-s.cogs} negative />
          <RowLine label="= Gross profit" value={s.grossProfit} bold />
          <RowLine label="− Delivery + return + refunds" value={-(s.deliveryCharges + s.returnCharges + s.refunds)} negative />
          <RowLine label="− Packaging + cash handling" value={-(s.packaging + s.cashHandling)} negative />
          <RowLine label="− Ad spend" value={-s.adSpend} negative />
          <RowLine label="− Salaries + commissions + expenses" value={-(s.salaries + s.commissions + s.otherExpenses)} negative />
          {s.tax > 0 && <RowLine label="− Tax" value={-s.tax} negative />}
          <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 8, paddingTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, fontWeight: 700, color: s.netProfit >= 0 ? COLORS.positive : COLORS.negative }}>
              <span>Net profit</span><span className="mn-num">{fmt(s.netProfit)}</span>
            </div>
          </div>
        </div>

        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Return reasons" />
          {(!sheet.returnReasons || sheet.returnReasons.length === 0) ? <EmptyRow text="Is mahine koi return nahi." /> : (
            sheet.returnReasons.map((r) => (
              <div key={r.reason} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
                <span>{r.reason}</span><span className="mn-num" style={{ color: COLORS.accent }}>{r.count}</span>
              </div>
            ))
          )}
          <div style={{ marginTop: 14 }}>
            <SectionHeading title="Low stock" />
            {(!sheet.stock?.lowStock || sheet.stock.lowStock.length === 0) ? <EmptyRow text="Sab stock theek hai." /> : (
              sheet.stock.lowStock.slice(0, 8).map((i) => (
                <div key={i.sku || i.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "5px 0" }}>
                  <span>{i.name}</span>
                  <span className="mn-num" style={{ color: COLORS.negative }}>{i.quantity} / {i.reorder}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <BreakdownTable title="City-wise" rows={sheet.byCity} keyLabel="City" />
      <BreakdownTable title="Courier-wise" rows={sheet.byCourier} keyLabel="Courier" />
      <BreakdownTable title="Sold by — kis ke through" rows={sheet.bySeller} keyLabel="Sold by" />
      <BreakdownTable title="Staff-wise (billed by)" rows={sheet.byStaff} keyLabel="Billed by" />
    </div>
  );
}

// =====================================================================
// Ad spend — manual replacement for Financify's Meta/Google auto-sync.
// One row per channel per day is enough to make ROAS and CAC real.
// =====================================================================
function AdSpend({ rows, update, notify, role }) {
  const [adding, setAdding] = useState(false);
  const isOwner = role === "owner";

  const fields = [
    { key: "date", label: "Date", type: "date", default: todayISO() },
    { key: "channel", label: "Channel", type: "select", options: ["Facebook", "Instagram", "Google", "TikTok", "WhatsApp", "Influencer", "Other"] },
    { key: "campaign", label: "Campaign (optional)" },
    { key: "amount", label: "Amount spent (Rs)", type: "number", default: 0 },
    { key: "notes", label: "Notes (optional)" },
  ];

  const total = rows.reduce((t, r) => t + Number(r.amount || 0), 0);
  const thisMonth = rows
    .filter((r) => String(r.date || "").slice(0, 7) === todayISO().slice(0, 7))
    .reduce((t, r) => t + Number(r.amount || 0), 0);

  const byChannel = useMemo(() => {
    const map = {};
    rows.forEach((r) => { map[r.channel || "Other"] = (map[r.channel || "Other"] || 0) + Number(r.amount || 0); });
    return Object.entries(map).map(([channel, amount]) => ({ channel, amount })).sort((a, b) => b.amount - a.amount);
  }, [rows]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="This month's ad spend" value={fmt(thisMonth)} sub="Profit tracker mein use hota hai" />
        <StatCard label="All-time ad spend" value={fmt(total)} sub={`${rows.length} entries`} />
        <StatCard label="Top channel" value={byChannel[0]?.channel || "—"} sub={byChannel[0] ? fmt(byChannel[0].amount) : "Abhi kuch add nahi hua"} />
      </div>

      <Panel title="Ad spend" addLabel="Add spend" onAdd={() => setAdding(true)} count={`${rows.length} entries`}>
        {adding && (
          <AddForm
            title="New ad spend" fields={fields} onCancel={() => setAdding(false)}
            onSave={(v) => {
              update((list) => [...list, { id: genId(), ...v, amount: Number(v.amount || 0) }]);
              setAdding(false);
              notify("Ad spend added");
            }}
          />
        )}
        {rows.length === 0 ? <EmptyRow text="Ad spend add karein taake asli ROAS pata chale." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Date</th><th>Channel</th><th>Campaign</th><th>Amount</th><th>Notes</th>{canDelete(role) && <th></th>}</tr></thead>
            <tbody>
              {[...rows].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((r) => (
                <tr key={r.id}>
                  <td style={{ color: COLORS.textDim }}>{String(r.date || "").slice(0, 10)}</td>
                  <td><Badge text={r.channel || "Other"} tone="info" /></td>
                  <td style={{ color: COLORS.textDim }}>{r.campaign || "—"}</td>
                  <td className="mn-num">{fmt(r.amount)}</td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{r.notes || "—"}</td>
                  {canDelete(role) && <td><DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== r.id))} /></td>}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}

// =====================================================================
// Cost settings — the defaults that make profit maths correct without
// typing the same numbers on every order. Owner only; every change is
// written to the change history.
// =====================================================================
function CostSettings({ settings, onSaved, notify }) {
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setForm(settings); }, [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const res = await saveSettings({
        default_delivery_charge: Number(form.default_delivery_charge) || 0,
        default_return_charge: Number(form.default_return_charge) || 0,
        cash_handling_pct: Number(form.cash_handling_pct) || 0,
        tax_pct: Number(form.tax_pct) || 0,
        packaging_cost: Number(form.packaging_cost) || 0,
      });
      onSaved(res);
      notify("Settings saved");
    } catch (err) {
      notify(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { key: "default_delivery_charge", label: "Default delivery charge (Rs)", hint: "Courier har parcel par jo leta hai. Naye order mein khud bhar jayega." },
    { key: "default_return_charge", label: "Default return charge (Rs)", hint: "Return aane par courier ka charge." },
    { key: "packaging_cost", label: "Packaging cost per order (Rs)", hint: "Box, tape, flyer — har order par." },
    { key: "cash_handling_pct", label: "COD cash handling (%)", hint: "Courier COD collection par jo % kaat'ta hai." },
    { key: "tax_pct", label: "Tax on revenue (%)", hint: "0 rakhein agar apply nahi hota." },
  ];

  return (
    <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
        <SectionHeading title="Cost settings" />
        <div style={{ fontSize: 12, color: COLORS.textFaint, marginBottom: 16 }}>
          Ye numbers Profit tracker aur monthly sheet mein asli munafa nikalne ke liye use hote hain.
        </div>
        {rows.map((r) => (
          <div key={r.key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, color: COLORS.textDim, display: "block", marginBottom: 4 }}>{r.label}</label>
            <input className="mn-input" type="number" value={form[r.key] ?? 0} onChange={(e) => set(r.key, e.target.value)} />
            <div style={{ fontSize: 11, color: COLORS.textFaint, marginTop: 4 }}>{r.hint}</div>
          </div>
        ))}
        <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save settings"}</button>
      </div>

      <BackupPanel notify={notify} />
      <IntegrationsPanel notify={notify} />
    </div>
  );
}

// Integration status + the manual triggers, so nothing has to be tested
// by waiting for a cron job to fire.
function IntegrationsPanel({ notify }) {
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState("");

  useEffect(() => { whatsappHealth().then(setHealth).catch(() => setHealth({ configured: false })); }, []);

  const run = async (key, fn, label) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res?.skipped) notify(res.reason || "Skipped");
      else if (key === "stock") notify(`${res.pushed} item website par update huye${res.failed?.length ? `, ${res.failed.length} fail` : ""}`);
      else notify(`${label} ho gaya`);
    } catch (err) {
      notify(`${label} failed: ${err.message}`);
    } finally { setBusy(""); }
  };

  const Row = ({ label, ok, hint }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "5px 0" }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: ok ? COLORS.positive : COLORS.negative, flexShrink: 0 }} />
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ color: COLORS.textFaint, fontSize: 11.5 }}>{ok ? "Ready" : hint}</span>
    </div>
  );

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title="Integrations" />
      <Row label="WhatsApp Cloud API" ok={Boolean(health?.configured)} hint="WHATSAPP_TOKEN / WHATSAPP_PHONE_ID set karein" />
      <Row label="Daily digest number" ok={Boolean(health?.ownerNumberSet)} hint="OWNER_WHATSAPP set karein" />
      <Row label="Webhook verify token" ok={Boolean(health?.webhookVerifyTokenSet)} hint="WHATSAPP_VERIFY_TOKEN set karein" />

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button className="mn-btn-ghost" disabled={busy === "stock"} onClick={() => run("stock", pushStockToWebsite, "Stock push")}>
          <RefreshCw size={13} className={busy === "stock" ? "mn-spin" : ""} /> Stock website par bhejein
        </button>
        <button className="mn-btn-ghost" disabled={busy === "digest"} onClick={() => run("digest", sendDigestNow, "Digest")}>
          <MessageCircle size={13} /> Digest abhi bhejein
        </button>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
        Stock push khud bhi chalta hai — jab bhi kisi item ki quantity badalti hai (POS sale, return, PO receive) website ka stock update ho jata hai. Ye button sirf sab kuch dobara sync karne ke liye hai.
      </div>
    </div>
  );
}

// =====================================================================
// Suppliers & purchase orders.
//
// Receiving a PO is what actually raises stock and sets the real cost
// (weighted average against existing stock), so "Real cost" stops being
// a number somebody types from memory.
// =====================================================================
function Suppliers({ suppliers, update, notify, role }) {
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const isOwner = role === "owner";
  const editingItem = suppliers.find((x) => x.id === editingId);

  const fields = [
    { key: "name", label: "Supplier name", required: true },
    { key: "contactPerson", label: "Contact person" },
    { key: "phone", label: "Phone" },
    { key: "city", label: "City" },
    { key: "notes", label: "Notes" },
  ];

  return (
    <Panel title="Suppliers" addLabel="Add supplier" onAdd={() => setAdding(true)} count={`${suppliers.length} suppliers`}>
      {adding && (
        <AddForm title="New supplier" fields={fields} onCancel={() => setAdding(false)}
          onSave={(v) => { update((list) => [...list, { id: genId(), ...v }]); setAdding(false); notify("Supplier added"); }} />
      )}
      {editingItem && (
        <AddForm title={`Edit — ${editingItem.name}`} fields={fields} initialValues={editingItem} onCancel={() => setEditingId(null)}
          onSave={(v) => { update((list) => list.map((x) => (x.id === editingId ? { ...x, ...v } : x))); setEditingId(null); notify("Supplier updated"); }} />
      )}
      {suppliers.length === 0 ? <EmptyRow text="Koi supplier add nahi hua." /> : (
        <div className="mn-tablewrap"><table className="mn-table">
          <thead><tr><th>Supplier</th><th>Contact</th><th>Phone</th><th>City</th><th>Notes</th><th></th></tr></thead>
          <tbody>
            {suppliers.map((sp) => (
              <tr key={sp.id}>
                <td>{sp.name}</td>
                <td style={{ color: COLORS.textDim }}>{sp.contactPerson || "—"}</td>
                <td style={{ color: COLORS.textDim }}>{sp.phone || "—"}</td>
                <td style={{ color: COLORS.textDim }}>{sp.city || "—"}</td>
                <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{sp.notes || "—"}</td>
                <td style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                  <button onClick={() => setEditingId(sp.id)} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer", padding: 2 }}><Pencil size={14} /></button>
                  {canDelete(role) && <DeleteBtn onClick={() => update((list) => list.filter((x) => x.id !== sp.id))} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}

function Purchases({ suppliers, inventory, notify, role, reload }) {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState(null);
  const isOwner = role === "owner";

  const load = () => listPurchases().then(setRows).catch((err) => notify(`Purchases load failed: ${err.message}`));
  useEffect(() => { load(); }, []);

  const receive = async (po) => {
    if (!window.confirm(`${po.po_no} receive karein? Stock barh jayega aur cost update ho jayegi. Ye wapas nahi hota.`)) return;
    try {
      const res = await receivePurchase(po.id);
      const summary = (res.applied || []).map((a) => `${a.name} +${a.added}`).join(", ");
      notify(summary ? `Received — ${summary}` : "Received");
      load();
      reload && reload();
    } catch (err) { notify(`Receive failed: ${err.message}`); }
  };

  if (!rows) return <EmptyRow text="Purchase orders load ho rahe hain..." />;

  const pendingValue = rows.filter((r) => r.status !== "Received" && r.status !== "Cancelled").reduce((t, r) => t + Number(r.total || 0), 0);
  const unpaid = rows.reduce((t, r) => t + Math.max(0, Number(r.total || 0) - Number(r.amount_paid || 0)), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Purchase orders" value={rows.length} sub={`${rows.filter((r) => r.status === "Received").length} received`} />
        <StatCard label="Raste mein stock" value={fmt(pendingValue)} sub="Ordered but not received" />
        <StatCard label="Suppliers ko dena hai" value={fmt(unpaid)} tone={unpaid > 0 ? "negative" : undefined} sub="Total minus paid" />
      </div>

      {creating && (
        <PurchaseForm
          suppliers={suppliers} inventory={inventory}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); notify("Purchase order banaya gaya"); load(); }}
          notify={notify}
        />
      )}

      {detail && <PurchaseDetail id={detail} onClose={() => setDetail(null)} notify={notify} />}

      <Panel title="Purchase orders" addLabel="New PO" onAdd={() => setCreating(true)} count={`${rows.length} orders`}>
        {rows.length === 0 ? <EmptyRow text="Koi purchase order nahi. Stock aane par PO banayein — cost khud set ho jayegi." /> : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>PO No</th><th>Supplier</th><th>Date</th><th>Items</th><th>Total</th><th>Paid</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((po) => (
                <tr key={po.id}>
                  <td>{po.po_no}</td>
                  <td style={{ color: COLORS.textDim }}>{po.supplier_name || "—"}</td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{String(po.date).slice(0, 10)}</td>
                  <td className="mn-num">{po.item_count}</td>
                  <td className="mn-num">{fmt(po.total)}</td>
                  <td className="mn-num" style={{ color: Number(po.amount_paid) >= Number(po.total) ? COLORS.positive : COLORS.negative }}>{fmt(po.amount_paid)}</td>
                  <td><Badge text={po.status} tone={po.status === "Received" ? "positive" : po.status === "Cancelled" ? "negative" : "accent"} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setDetail(po.id)}>Items</button>
                      {po.status !== "Received" && po.status !== "Cancelled" && (
                        <button className="mn-btn" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => receive(po)}>
                          <Check size={11} /> Receive
                        </button>
                      )}
                      {canDelete(role) && <DeleteBtn onClick={async () => { await removePurchase(po.id); load(); }} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>
    </div>
  );
}

function PurchaseForm({ suppliers, inventory, onCancel, onSaved, notify }) {
  const [poNo, setPoNo] = useState("PO-" + Math.floor(1000 + Math.random() * 9000));
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayISO());
  const [amountPaid, setAmountPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ key: genId(), inventory_id: "", name: "", sku: "", qty: 1, unit_cost: 0 }]);
  const [saving, setSaving] = useState(false);

  const setItem = (key, patch) => setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const addRow = () => setItems((l) => [...l, { key: genId(), inventory_id: "", name: "", sku: "", qty: 1, unit_cost: 0 }]);
  const removeRow = (key) => setItems((l) => (l.length > 1 ? l.filter((it) => it.key !== key) : l));

  // Picking an existing item fills name/SKU/last cost; leaving it on
  // "New item" lets you type a product that isn't in inventory yet —
  // receiving the PO will create it.
  const pickInventory = (key, id) => {
    const inv = inventory.find((x) => x.id === id);
    setItem(key, inv
      ? { inventory_id: id, name: inv.name, sku: inv.sku || "", unit_cost: Number(inv.cost) || 0 }
      : { inventory_id: "", name: "", sku: "" });
  };

  const total = items.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unit_cost) || 0), 0);

  const save = async () => {
    const clean = items.filter((it) => String(it.name).trim() && Number(it.qty) > 0);
    if (clean.length === 0) return notify("Kam az kam ek item add karein");
    setSaving(true);
    try {
      await createPurchase({
        po_no: poNo, supplier_id: supplierId || null, date, notes,
        amount_paid: Number(amountPaid) || 0,
        items: clean.map((it) => ({
          inventory_id: it.inventory_id || null, name: it.name, sku: it.sku,
          qty: Number(it.qty), unit_cost: Number(it.unit_cost),
        })),
      });
      onSaved();
    } catch (err) {
      notify(`Save failed: ${err.message}`);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title="New purchase order" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>PO number</label>
          <input className="mn-input" value={poNo} onChange={(e) => setPoNo(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Supplier</label>
          <select className="mn-input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— select —</option>
            {suppliers.map((sp) => <option key={sp.id} value={sp.id}>{sp.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Date</label>
          <input className="mn-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Supplier ko diya (Rs)</label>
          <input className="mn-input" type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} />
        </div>
      </div>

      <div className="mn-tablewrap"><table className="mn-table">
        <thead><tr><th>Item</th><th>Name</th><th>SKU</th><th>Qty</th><th>Unit cost</th><th>Line total</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.key}>
              <td style={{ minWidth: 160 }}>
                <select className="mn-input" value={it.inventory_id} onChange={(e) => pickInventory(it.key, e.target.value)}>
                  <option value="">+ New item</option>
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name}{[inv.size, inv.color].filter(Boolean).length ? ` (${[inv.size, inv.color].filter(Boolean).join(" ")})` : ""}
                    </option>
                  ))}
                </select>
              </td>
              <td><input className="mn-input" value={it.name} onChange={(e) => setItem(it.key, { name: e.target.value })} placeholder="Item name" /></td>
              <td><input className="mn-input" style={{ width: 100 }} value={it.sku} onChange={(e) => setItem(it.key, { sku: e.target.value })} /></td>
              <td><input className="mn-input" style={{ width: 70 }} type="number" value={it.qty} onChange={(e) => setItem(it.key, { qty: e.target.value })} /></td>
              <td><input className="mn-input" style={{ width: 90 }} type="number" value={it.unit_cost} onChange={(e) => setItem(it.key, { unit_cost: e.target.value })} /></td>
              <td className="mn-num">{fmt((Number(it.qty) || 0) * (Number(it.unit_cost) || 0))}</td>
              <td><button onClick={() => removeRow(it.key)} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={14} /></button></td>
            </tr>
          ))}
        </tbody>
      </table></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button className="mn-btn-ghost" onClick={addRow}><Plus size={13} /> Add row</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>Total: <span className="mn-num">{fmt(total)}</span></div>
      </div>

      <div style={{ marginTop: 12 }}>
        <input className="mn-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Save PO"}</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
        PO save karne se stock nahi barhta. Jab maal pahunch jaye tab <b style={{ color: COLORS.textDim }}>Receive</b> dabayein — tab quantity add hogi aur cost weighted average se update hogi.
      </div>
    </div>
  );
}

function PurchaseDetail({ id, onClose, notify }) {
  const [po, setPo] = useState(null);
  useEffect(() => { getPurchase(id).then(setPo).catch((err) => notify(`Load failed: ${err.message}`)); }, [id]);
  if (!po) return null;
  return (
    <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>{po.po_no} — {po.supplier_name || "No supplier"}</span>
        <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <div className="mn-tablewrap"><table className="mn-table">
        <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit cost</th><th>Total</th></tr></thead>
        <tbody>
          {po.items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td style={{ color: COLORS.textDim }}>{it.sku || "—"}</td>
              <td className="mn-num">{Number(it.qty)}</td>
              <td className="mn-num">{fmt(it.unit_cost)}</td>
              <td className="mn-num">{fmt(Number(it.qty) * Number(it.unit_cost))}</td>
            </tr>
          ))}
        </tbody>
      </table></div>
      {po.notes && <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 10 }}>{po.notes}</div>}
    </div>
  );
}

// =====================================================================
// WhatsApp order confirmation cell.
//
// In a COD business this is the single biggest lever on return rate:
// send the message, ship only what gets a reply. The customer's "HAAN"
// updates the status automatically via the webhook; the dropdown is
// there for the ones who reply by phone call instead.
// =====================================================================
const CONFIRM_TONE = {
  Confirmed: "positive",
  Sent: "info",
  Cancelled: "negative",
  "No response": "negative",
  "Not sent": undefined,
};

function ConfirmationCell({ order, notify, onChanged }) {
  const [busy, setBusy] = useState(false);
  const status = order.confirmationStatus || "Not sent";

  const send = async () => {
    if (!order.phone) return notify("Is order par phone number nahi hai");
    setBusy(true);
    try {
      await sendConfirmation(order.id);
      notify("WhatsApp confirmation bhej diya");
      onChanged && onChanged();
    } catch (err) {
      notify(`WhatsApp failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  const setStatus = async (value) => {
    setBusy(true);
    try {
      await setConfirmationStatus(order.id, value);
      onChanged && onChanged();
    } catch (err) {
      notify(`Update failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  if (order.status === "Returned") return <span style={{ color: COLORS.textFaint, fontSize: 12 }}>—</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 118 }}>
      <Badge text={status} tone={CONFIRM_TONE[status]} />
      <div style={{ display: "flex", gap: 4 }}>
        {status !== "Confirmed" && (
          <button
            onClick={send} disabled={busy || !order.phone} title={order.phone ? "WhatsApp bhejein" : "Phone number nahi hai"}
            style={{ background: "none", border: "none", cursor: order.phone ? "pointer" : "not-allowed", color: order.phone ? COLORS.positive : COLORS.textFaint, padding: 0, display: "flex", alignItems: "center", gap: 3, fontSize: 11, fontFamily: "inherit" }}
          >
            <MessageCircle size={12} /> {status === "Sent" ? "Dobara" : "Bhejein"}
          </button>
        )}
        <select
          value={status} disabled={busy} onChange={(e) => setStatus(e.target.value)}
          style={{ background: "none", border: "none", color: COLORS.textFaint, fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}
        >
          {["Not sent", "Sent", "Confirmed", "No response", "Cancelled"].map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
      </div>
    </div>
  );
}

// Shown while writing a new order: as soon as a phone number is typed,
// this checks the customer's history and warns before the parcel is booked.
function CustomerRiskBanner({ phone }) {
  const [risk, setRisk] = useState(null);

  useEffect(() => {
    const digits = String(phone || "").replace(/[^0-9]/g, "");
    if (digits.length < 7) { setRisk(null); return; }
    let alive = true;
    const t = setTimeout(() => {
      customerRisk(digits).then((r) => { if (alive) setRisk(r); }).catch(() => {});
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [phone]);

  if (!risk || !risk.found) return null;

  const danger = risk.risky || risk.codBlocked;
  return (
    <div style={{
      marginTop: 10, padding: "10px 12px", borderRadius: 7, fontSize: 12.5,
      background: danger ? COLORS.negativeDim : COLORS.surface,
      border: `1px solid ${danger ? COLORS.negative : COLORS.border}`,
      color: danger ? COLORS.negative : COLORS.textDim,
      display: "flex", alignItems: "flex-start", gap: 8,
    }}>
      {danger ? <ShieldAlert size={15} style={{ flexShrink: 0, marginTop: 1 }} /> : <BookUser size={15} style={{ flexShrink: 0, marginTop: 1, color: COLORS.textFaint }} />}
      <div>
        {risk.codBlocked && <div><b>COD blocked customer.</b> Sirf advance par bhejein.</div>}
        {!risk.codBlocked && risk.risky && <div><b>{risk.returned} parcel return kar chuke hain.</b> Advance lena behtar hai.</div>}
        <div style={{ color: danger ? COLORS.negative : COLORS.textFaint }}>
          {risk.orders} purane order · lifetime {fmt(risk.lifetimeValue)}
          {risk.returned > 0 && !risk.risky ? ` · ${risk.returned} return` : ""}
        </div>
        {risk.notes && <div style={{ marginTop: 3, fontStyle: "italic" }}>{risk.notes}</div>}
      </div>
    </div>
  );
}

// =====================================================================
// Payments against an order — recording the udhaar as it comes in.
//
// Each instalment is its own record, so a bill settled in three visits
// shows three entries with dates instead of one number that quietly
// changed. The cash also lands in whichever account is chosen.
// =====================================================================
function PaymentPanel({ order, accounts, notify, onDone, onCancel }) {
  const due = Math.max(0, Number(order.sell || 0) - Number(order.amountPaid || 0));
  const [amount, setAmount] = useState(due);
  const [method, setMethod] = useState(order.method || "Cash");
  const [accountId, setAccountId] = useState(accounts[0]?.id || "");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [rows, setRows] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = () => listPayments(order.id).then(setRows).catch(() => {});
  useEffect(() => { load(); }, [order.id]);

  const save = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return notify("Amount likhein");
    if (value > due + 0.01) return notify(`Baqaya sirf ${fmt(due)} hai`);
    setSaving(true);
    try {
      await addPayment(order.id, { amount: value, method, accountId: accountId || null, date, note });
      notify(`${fmt(value)} receive ho gaya`);
      onDone();
    } catch (err) {
      notify(`Payment failed: ${err.message}`);
    } finally { setSaving(false); }
  };

  const del = async (p) => {
    if (!window.confirm(`${fmt(p.amount)} wali payment delete karein?`)) return;
    try {
      await removePayment(order.id, p.id);
      notify("Payment delete ho gayi");
      onDone();
    } catch (err) { notify(`Delete failed: ${err.message}`); }
  };

  return (
    <div style={{ padding: 18, borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface2 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          Payment — {order.orderNo} · {order.customer}
          <span style={{ color: due > 0 ? COLORS.negative : COLORS.positive, marginLeft: 10, fontWeight: 400 }}>
            Baqaya {fmt(due)}
          </span>
        </span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>

      {due > 0 ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px,1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Kitna mila (Rs)</label>
              <input className="mn-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Tareeqa</label>
              <select className="mn-input" value={method} onChange={(e) => setMethod(e.target.value)}>
                {["Cash", "COD", "Bank Transfer", "JazzCash", "EasyPaisa"].map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Kis account mein</label>
              <select className="mn-input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                <option value="">— koi nahi —</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Tareekh</label>
              <input className="mn-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <input className="mn-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
            </div>
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Payment receive karein"}</button>
            <button className="mn-btn-ghost" onClick={() => setAmount(due)}>Poora baqaya</button>
            <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 13, color: COLORS.positive }}>Ye order poora clear ho chuka hai.</div>
      )}

      {rows.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SectionHeading title="Payment history" />
          {rows.map((p) => (
            <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${COLORS.borderSoft}` }}>
              <span style={{ color: COLORS.textFaint, minWidth: 88 }}>{String(p.date).slice(0, 10)}</span>
              <span className="mn-num" style={{ minWidth: 88, color: COLORS.positive }}>{fmt(p.amount)}</span>
              <span style={{ color: COLORS.textDim, minWidth: 90 }}>{p.method || "—"}</span>
              <span style={{ color: COLORS.textFaint, flex: 1 }}>
                {p.account_name ? `${p.account_name} · ` : ""}{p.received_by || ""}{p.note ? ` · ${p.note}` : ""}
              </span>
              <DeleteBtn onClick={() => del(p)} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Undoing a return that was marked by mistake. Asks what the order should
// go back to, because "it wasn't returned" can mean delivered or still out.
function UndoReturnForm({ order, notify, onDone, onCancel }) {
  const [status, setStatus] = useState("Delivered");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const res = await undoReturn(order.id, status);
      const back = (res.removed || []).map((r) => `${r.name} -${r.removed}`).join(", ");
      notify(back ? `Return hata diya. Stock wapas nikala: ${back}` : "Return hata diya");
      onDone();
    } catch (err) {
      notify(`Undo failed: ${err.message}`);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ padding: 18, background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 9 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>Return hatayein — {order.orderNo} · {order.customer}</span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>
      <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Order ab kis halat mein hai?</label>
      <select className="mn-input" style={{ maxWidth: 220 }} value={status} onChange={(e) => setStatus(e.target.value)}>
        {["Delivered", "Shipped", "Pending"].map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
        {order.restocked
          ? "Return ke waqt stock wapas inventory mein gaya tha — woh dobara nikal liya jayega."
          : "Return ke waqt stock wapas nahi gaya tha, is liye inventory par koi asar nahi hoga."}
        {" "}Refund aur return charge sifar ho jayenge.
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={submit} disabled={busy}>{busy ? "..." : "Haan, return hatayein"}</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// =====================================================================
// Consignment stock — maal jo affiliate ko bechne ke liye diya gaya.
//
// The goods leave the shop but are still ours, so handing them out drops
// the inventory count and records who is holding what. When the affiliate
// comes back, unsold pieces go straight back on the shelf and sold ones
// are simply marked sold — the remaining figure is always
// qty_out − returned − sold, so nothing can quietly drift.
// =====================================================================
function Consignments({ inventory, affiliates, orders, notify, role, reload }) {
  const [rows, setRows] = useState(null);
  const [creating, setCreating] = useState(false);
  const [settling, setSettling] = useState(null);
  const [q, setQ] = useState("");
  const isOwner = role === "owner";

  const load = () => listConsignments().then(setRows).catch((err) => notify(`Load failed: ${err.message}`));
  useEffect(() => { load(); }, []);

  const del = async (c) => {
    if (!window.confirm(`${c.ref_no} delete karein? Jo maal abhi ${c.holder} ke paas hai woh wapas inventory mein chala jayega.`)) return;
    try {
      await removeConsignment(c.id);
      notify("Consignment delete ho gaya");
      load();
      reload && reload();
    } catch (err) { notify(`Delete failed: ${err.message}`); }
  };

  // Who is holding the most right now — the person to chase first.
  //
  // This has to sit ABOVE the loading return. React counts hooks per
  // render, so a useMemo below an early return runs on some renders and
  // not others, and the whole app white-screens the moment the data
  // arrives. Hence the null guard inside rather than around it.
  const byHolder = useMemo(() => {
    const map = {};
    (rows || []).forEach((c) => {
      const k = c.holder || "—";
      if (!map[k]) map[k] = { holder: k, units: 0, value: 0, open: 0 };
      map[k].units += Number(c.remaining || 0);
      map[k].value += Number(c.value_out || 0);
      if (c.status !== "Settled") map[k].open += 1;
    });
    return Object.values(map).filter((x) => x.units > 0).sort((a, b) => b.value - a.value);
  }, [rows]);

  if (!rows) return <EmptyRow text="Load ho raha hai..." />;

  const filtered = rows.filter((c) =>
    `${c.ref_no || ""} ${c.holder || ""} ${c.phone || ""}`.toLowerCase().includes(q.toLowerCase())
  );
  const open = rows.filter((c) => c.status !== "Settled");
  const outValue = rows.reduce((t, c) => t + Number(c.value_out || 0), 0);
  const outUnits = rows.reduce((t, c) => t + Number(c.remaining || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 12 }}>
        <StatCard label="Bahar gaya stock" value={`${outUnits} pcs`} sub={`${open.length} consignment khulay hain`} tone={outUnits > 0 ? "negative" : undefined} />
        <StatCard label="Us ki sale value" value={fmt(outValue)} sub="Jo abhi logon ke paas hai" />
        <StatCard label="Sab se zyada kis ke paas" value={byHolder[0]?.holder || "—"} sub={byHolder[0] ? `${byHolder[0].units} pcs · ${fmt(byHolder[0].value)}` : "Kisi ke paas nahi"} />
      </div>

      {creating && (
        <ConsignmentForm
          inventory={inventory} affiliates={affiliates}
          onCancel={() => setCreating(false)}
          onSaved={() => { setCreating(false); notify("Stock issue ho gaya"); load(); reload && reload(); }}
          notify={notify}
        />
      )}

      {settling && (
        <SettleConsignment
          id={settling}
          onCancel={() => setSettling(null)}
          onDone={() => { setSettling(null); load(); reload && reload(); }}
          notify={notify}
        />
      )}

      <Panel
        title="Stock diya hua" addLabel="Stock issue karein" onAdd={() => setCreating(true)}
        count={`${rows.length} consignments`}
        extra={<SearchBox value={q} onChange={setQ} />}
      >
        {filtered.length === 0 ? (
          <EmptyRow text="Abhi tak kisi ko stock nahi diya. 'Stock issue karein' se shuru karein." />
        ) : (
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr>
              <th>Ref</th><th>Kis ke paas</th><th>Date</th><th>Diya</th><th>Wapas</th><th>Becha</th>
              <th>Abhi paas hai</th><th>Value</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td>{c.ref_no}</td>
                  <td>
                    {c.holder || "—"}
                    {c.phone && <div style={{ fontSize: 11, color: COLORS.textFaint }}>{c.phone}</div>}
                  </td>
                  <td style={{ color: COLORS.textFaint, fontSize: 12 }}>{String(c.date).slice(0, 10)}</td>
                  <td className="mn-num">{c.total_out}</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{c.total_returned || "—"}</td>
                  <td className="mn-num" style={{ color: c.total_sold ? COLORS.positive : COLORS.textFaint }}>{c.total_sold || "—"}</td>
                  <td className="mn-num" style={{ color: c.remaining > 0 ? COLORS.accent : COLORS.textFaint }}>{c.remaining}</td>
                  <td className="mn-num">{fmt(c.value_out)}</td>
                  <td><Badge text={c.status} tone={c.status === "Settled" ? "positive" : c.status === "Partial" ? "accent" : "info"} /></td>
                  <td>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                      {c.status !== "Settled" && (
                        <button className="mn-btn" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setSettling(c.id)}>
                          <Check size={11} /> Hisab
                        </button>
                      )}
                      <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => setSettling(c.id)}>Items</button>
                      {canDelete(role) && <DeleteBtn onClick={() => del(c)} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Panel>

      {byHolder.length > 0 && (
        <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
          <SectionHeading title="Kis ke paas kitna maal hai" />
          <div className="mn-tablewrap"><table className="mn-table">
            <thead><tr><th>Naam</th><th>Khulay consignment</th><th>Units</th><th>Value</th></tr></thead>
            <tbody>
              {byHolder.map((h) => (
                <tr key={h.holder}>
                  <td>{h.holder}</td>
                  <td className="mn-num" style={{ color: COLORS.textDim }}>{h.open}</td>
                  <td className="mn-num" style={{ color: COLORS.accent }}>{h.units}</td>
                  <td className="mn-num">{fmt(h.value)}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </div>
      )}
    </div>
  );
}

function ConsignmentForm({ inventory, affiliates, onCancel, onSaved, notify }) {
  const sellers = useSellers();
  // Prefer the full list when it loaded (manager+), fall back to the
  // names-only list so staff get the same dropdown.
  const holderOptions = affiliates.length > 0 ? affiliates : sellers.affiliates;
  const [refNo, setRefNo] = useState("CN-" + Math.floor(1000 + Math.random() * 9000));
  const [affiliateId, setAffiliateId] = useState("");
  const [holderName, setHolderName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState([{ key: genId(), inventoryId: "", name: "", sku: "", qty: 1, unitPrice: 0, unitCost: 0, stock: null, image: null }]);
  const [saving, setSaving] = useState(false);

  const setItem = (key, patch) => setItems((l) => l.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  const addRow = () => setItems((l) => [...l, { key: genId(), inventoryId: "", name: "", sku: "", qty: 1, unitPrice: 0, unitCost: 0, stock: null, image: null }]);
  const removeRow = (key) => setItems((l) => (l.length > 1 ? l.filter((it) => it.key !== key) : l));

  const pick = (key, id) => {
    const inv = inventory.find((x) => x.id === id);
    setItem(key, inv
      ? {
          inventoryId: id, name: inv.name, sku: inv.sku || "",
          unitPrice: Number(inv.price) || 0, unitCost: Number(inv.cost) || 0,
          stock: Number(inv.quantity) || 0,
          // Photo travels with the row so the person packing the bag can
          // check by sight that the right thing is going out.
          image: inv.image || inv.imageUrl || null,
        }
      : { inventoryId: "", name: "", sku: "", stock: null, image: null });
  };

  const totalUnits = items.reduce((t, it) => t + (Number(it.qty) || 0), 0);
  const totalValue = items.reduce((t, it) => t + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0), 0);
  // Catch an over-issue before the server has to reject the whole batch.
  const overIssued = items.filter((it) => it.stock !== null && Number(it.qty) > it.stock);

  const save = async () => {
    const clean = items.filter((it) => String(it.name).trim() && Number(it.qty) > 0);
    if (clean.length === 0) return notify("Kam az kam ek item add karein");
    if (!affiliateId && !holderName.trim()) return notify("Affiliate chunein ya naam likhein");
    if (overIssued.length > 0) return notify(`${overIssued[0].name}: itna stock nahi hai`);
    setSaving(true);
    try {
      await createConsignment({
        refNo, affiliateId: affiliateId || null, holderName: holderName || null,
        phone, date, notes,
        items: clean.map((it) => ({
          inventoryId: it.inventoryId || null, name: it.name, sku: it.sku,
          qty: Number(it.qty), unitPrice: Number(it.unitPrice) || 0, unitCost: Number(it.unitCost) || 0,
        })),
      });
      onSaved();
    } catch (err) {
      notify(`Save failed: ${err.message}`);
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title="Stock issue karein" />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Ref number</label>
          <input className="mn-input" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Affiliate</label>
          <select className="mn-input" value={affiliateId} onChange={(e) => setAffiliateId(e.target.value)}>
            <option value="">— list mein nahi —</option>
            {holderOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Ya naam likhein</label>
          <input className="mn-input" value={holderName} onChange={(e) => setHolderName(e.target.value)} placeholder="Jis ko de rahe hain" disabled={Boolean(affiliateId)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Phone</label>
          <input className="mn-input" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>Date</label>
          <input className="mn-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="mn-tablewrap"><table className="mn-table">
        <thead><tr><th></th><th>Item</th><th>Stock</th><th>Kitne diye</th><th>Rate</th><th>Value</th><th></th></tr></thead>
        <tbody>
          {items.map((it) => {
            const over = it.stock !== null && Number(it.qty) > it.stock;
            return (
              <tr key={it.key}>
                <td><Thumb url={it.image} size={46} /></td>
                <td style={{ minWidth: 200 }}>
                  <select className="mn-input" value={it.inventoryId} onChange={(e) => pick(it.key, e.target.value)}>
                    <option value="">— item chunein —</option>
                    {inventory.map((inv) => (
                      <option key={inv.id} value={inv.id}>
                        {inv.name}{[inv.size, inv.color].filter(Boolean).length ? ` (${[inv.size, inv.color].filter(Boolean).join(" ")})` : ""}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="mn-num" style={{ color: COLORS.textFaint }}>{it.stock === null ? "—" : it.stock}</td>
                <td>
                  <input
                    className="mn-input" type="number" style={{ width: 80, borderColor: over ? COLORS.negative : undefined }}
                    value={it.qty} onChange={(e) => setItem(it.key, { qty: e.target.value })}
                  />
                </td>
                <td><input className="mn-input" type="number" style={{ width: 90 }} value={it.unitPrice} onChange={(e) => setItem(it.key, { unitPrice: e.target.value })} /></td>
                <td className="mn-num">{fmt((Number(it.qty) || 0) * (Number(it.unitPrice) || 0))}</td>
                <td><button onClick={() => removeRow(it.key)} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={14} /></button></td>
              </tr>
            );
          })}
        </tbody>
      </table></div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, flexWrap: "wrap", gap: 8 }}>
        <button className="mn-btn-ghost" onClick={addRow}><Plus size={13} /> Add row</button>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{totalUnits} pcs · <span className="mn-num">{fmt(totalValue)}</span></div>
      </div>

      {overIssued.length > 0 && (
        <div style={{ fontSize: 12, color: COLORS.negative, marginTop: 8 }}>
          Itna stock maujood nahi: {overIssued.map((x) => x.name).join(", ")}
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <input className="mn-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (optional)" />
      </div>
      <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
        <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Stock issue karein"}</button>
        <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
        Issue karte hi ye maal inventory se kam ho jayega — kyunki dukan mein ab maujood nahi. Jab wapas aayega ya bik jayega, <b style={{ color: COLORS.textDim }}>Hisab</b> se record karein.
      </div>
    </div>
  );
}

// The settle screen: what came back, what sold. Both together in one pass,
// because that's how it actually happens — the affiliate walks in with
// some cash and some unsold pieces.
function SettleConsignment({ id, onCancel, onDone, notify }) {
  const [c, setC] = useState(null);
  const [lines, setLines] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getConsignment(id).then((data) => {
      setC(data);
      setLines(Object.fromEntries(data.items.map((it) => [it.id, { returned: "", sold: "" }])));
    }).catch((err) => notify(`Load failed: ${err.message}`));
  }, [id]);

  if (!c) return null;

  const setLine = (itemId, patch) => setLines((l) => ({ ...l, [itemId]: { ...l[itemId], ...patch } }));

  const save = async () => {
    const payload = c.items
      .map((it) => ({
        itemId: it.id,
        returned: Number(lines[it.id]?.returned) || 0,
        sold: Number(lines[it.id]?.sold) || 0,
      }))
      .filter((l) => l.returned > 0 || l.sold > 0);
    if (payload.length === 0) return notify("Kuch record karne ko nahi");

    const bad = payload.find((l) => {
      const item = c.items.find((x) => x.id === l.itemId);
      return l.returned + l.sold > item.remaining;
    });
    if (bad) {
      const item = c.items.find((x) => x.id === bad.itemId);
      return notify(`${item.name}: sirf ${item.remaining} baqi hain`);
    }

    setSaving(true);
    try {
      const res = await settleConsignment(id, payload);
      const back = res.applied.filter((a) => a.returned > 0).map((a) => `${a.name} +${a.returned}`).join(", ");
      notify(back ? `Record ho gaya. Stock wapas: ${back}` : "Record ho gaya");
      onDone();
    } catch (err) {
      notify(`Save failed: ${err.message}`);
    } finally { setSaving(false); }
  };

  const allSettled = c.items.every((it) => it.remaining <= 0);

  return (
    <div style={{ background: COLORS.surface2, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 600 }}>
          {c.ref_no} — {c.holder}
          <span style={{ color: COLORS.textFaint, fontWeight: 400, marginLeft: 8 }}>{String(c.date).slice(0, 10)}</span>
        </span>
        <button onClick={onCancel} style={{ background: "none", border: "none", color: COLORS.textFaint, cursor: "pointer" }}><X size={16} /></button>
      </div>

      <div className="mn-tablewrap"><table className="mn-table">
        <thead><tr>
          <th></th><th>Item</th><th>Diya</th><th>Pehle wapas</th><th>Pehle becha</th><th>Abhi paas hai</th>
          <th>Ab wapas aya</th><th>Ab bika</th>
        </tr></thead>
        <tbody>
          {c.items.map((it) => (
            <tr key={it.id}>
              {/* image_url comes straight from the API — the server joins
                  the photo on from inventory, so a settled item still shows
                  its picture even years later. */}
              <td><Thumb url={it.image_url} size={52} /></td>
              <td>{it.name}{it.sku && <div style={{ fontSize: 11, color: COLORS.textFaint }}>{it.sku}</div>}</td>
              <td className="mn-num">{it.qty_out}</td>
              <td className="mn-num" style={{ color: COLORS.textDim }}>{it.qty_returned || "—"}</td>
              <td className="mn-num" style={{ color: COLORS.textDim }}>{it.qty_sold || "—"}</td>
              <td className="mn-num" style={{ color: it.remaining > 0 ? COLORS.accent : COLORS.positive }}>{it.remaining}</td>
              <td>
                <input
                  className="mn-input" type="number" style={{ width: 75 }} disabled={it.remaining <= 0}
                  value={lines[it.id]?.returned ?? ""} placeholder="0"
                  onChange={(e) => setLine(it.id, { returned: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="mn-input" type="number" style={{ width: 75 }} disabled={it.remaining <= 0}
                  value={lines[it.id]?.sold ?? ""} placeholder="0"
                  onChange={(e) => setLine(it.id, { sold: e.target.value })}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>

      {c.notes && <div style={{ fontSize: 12, color: COLORS.textFaint, marginTop: 10 }}>{c.notes}</div>}

      {allSettled ? (
        <div style={{ fontSize: 13, color: COLORS.positive, marginTop: 14 }}>Is consignment ka poora hisab ho chuka hai.</div>
      ) : (
        <>
          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button className="mn-btn" onClick={save} disabled={saving}>{saving ? "Saving..." : "Hisab save karein"}</button>
            <button className="mn-btn-ghost" onClick={onCancel}>Cancel</button>
          </div>
          <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10 }}>
            Jo maal wapas aya woh inventory mein add ho jayega. Jo bik gaya uska stock pehle hi kam ho chuka hai, is liye dobara kuch nahi hoga — us ki sale POS ya Orders se alag record karein, <b style={{ color: COLORS.textDim }}>Sold by</b> mein isi banday ka naam daal kar.
          </div>
        </>
      )}
    </div>
  );
}

// =====================================================================
// "Sold by" — who the sale actually came through.
//
// billed_by is whoever typed the bill in; this is the person or affiliate
// the customer dealt with. Months later, when someone rings up about an
// order, this is the field that answers "kis ke through gaya tha".
//
// Loads names once and shares them across every screen that needs them,
// so opening POS doesn't refetch the same list on every render.
// =====================================================================
let sellerCache = null;
let sellerPromise = null;

function useSellers() {
  const [sellers, setSellers] = useState(sellerCache);
  useEffect(() => {
    if (sellerCache) return;
    if (!sellerPromise) sellerPromise = listSellers().catch(() => ({ affiliates: [], staff: [] }));
    let alive = true;
    sellerPromise.then((data) => {
      sellerCache = data;
      if (alive) setSellers(data);
    });
    return () => { alive = false; };
  }, []);
  return sellers || { affiliates: [], staff: [] };
}

// Lets a name be picked from the list or typed in free-hand, because there
// is always a walk-in helper or a new referrer who isn't on any list yet.
function SellerPicker({ value, type, onChange, label = "Sold by — kis ke through", compact }) {
  const sellers = useSellers();
  const [custom, setCustom] = useState(false);

  const known = [
    ...sellers.staff.map((n) => ({ name: n, kind: "Staff" })),
    ...sellers.affiliates.map((a) => ({ name: a.name, kind: "Affiliate" })),
  ];
  const isKnown = !value || known.some((k) => k.name === value);

  useEffect(() => { if (value && !isKnown) setCustom(true); }, [value, isKnown]);

  const pick = (name) => {
    if (name === "__other__") { setCustom(true); onChange("", "Other"); return; }
    const match = known.find((k) => k.name === name);
    onChange(name, match ? match.kind : "Other");
  };

  return (
    <div>
      {label && <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>{label}</label>}
      {custom ? (
        <div style={{ display: "flex", gap: 6 }}>
          <input
            className="mn-input" value={value || ""} placeholder="Naam likhein"
            onChange={(e) => onChange(e.target.value, type || "Other")}
          />
          <button className="mn-btn-ghost" style={{ fontSize: 11, padding: "4px 8px" }} onClick={() => { setCustom(false); onChange("", ""); }}>
            List
          </button>
        </div>
      ) : (
        <select className="mn-input" value={value || ""} onChange={(e) => pick(e.target.value)}>
          <option value="">— chunein —</option>
          {sellers.staff.length > 0 && (
            <optgroup label="Apne log">
              {sellers.staff.map((n) => <option key={`s-${n}`} value={n}>{n}</option>)}
            </optgroup>
          )}
          {sellers.affiliates.length > 0 && (
            <optgroup label="Affiliates">
              {sellers.affiliates.map((a) => <option key={`a-${a.id}`} value={a.name}>{a.name}</option>)}
            </optgroup>
          )}
          <option value="__other__">+ Koi aur (naam likhein)</option>
        </select>
      )}
      {!compact && value && (
        <div style={{ fontSize: 10.5, color: COLORS.textFaint, marginTop: 3 }}>
          {type === "Affiliate" ? "Affiliate sale — commission isi ke khate mein" : type === "Staff" ? "Apne staff ki sale" : "List se bahar"}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Backup & restore.
//
// Everything this shop has lives in one database on one hosting account.
// This panel makes that survivable: one click pulls the whole thing down
// as a file the owner keeps, and the same file puts it all back.
// =====================================================================
const kb = (bytes) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

const saveFile = (text, filename, type = "application/json") => {
  const blob = new Blob([text], { type: `${type};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Turns any array of rows into a CSV, quoting whatever needs quoting.
const toCsv = (rows) => {
  if (!rows || rows.length === 0) return "";
  const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const cell = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    // A base64 photo in a spreadsheet cell helps nobody.
    if (s.startsWith("data:image")) return "(photo)";
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\n");
};

function BackupPanel({ notify }) {
  const [status, setStatus] = useState(null);
  const [busy, setBusy] = useState("");
  const [restoreFile, setRestoreFile] = useState(null);
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => { backupStatus().then(setStatus).catch(() => {}); }, []);

  const stamp = todayISO();

  const take = async (includeImages) => {
    setBusy(includeImages ? "full" : "light");
    try {
      const backup = await downloadBackup({ includeImages });
      saveFile(JSON.stringify(backup), `munshi-backup-${stamp}${includeImages ? "" : "-light"}.json`);
      notify("Backup download ho gaya — ab isay Drive ya phone mein save karein");
    } catch (err) {
      notify(`Backup failed: ${err.message}`);
    } finally { setBusy(""); }
  };

  // A spreadsheet pack for reading, not for restoring. Browsers block
  // rapid-fire downloads, so they're spaced out a little.
  const takeCsvPack = async () => {
    setBusy("csv");
    try {
      const backup = await downloadBackup({ includeImages: false });
      const wanted = ["orders", "inventory", "customers", "payments", "expenses", "consignments", "consignment_items", "purchase_orders"];
      let saved = 0;
      for (const table of wanted) {
        const rows = backup.data[table];
        if (!rows || rows.length === 0) continue;
        saveFile(toCsv(rows), `munshi-${table}-${stamp}.csv`, "text/csv");
        saved += 1;
        await new Promise((r) => setTimeout(r, 350));
      }
      notify(`${saved} CSV file download ho gayin`);
    } catch (err) {
      notify(`CSV pack failed: ${err.message}`);
    } finally { setBusy(""); }
  };

  const pickRestore = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!parsed.munshi_backup) return notify("Ye Munshi ka backup file nahi lag raha");
        setRestoreFile(parsed);
      } catch {
        notify("File parh nahi saka — kya ye wahi JSON file hai?");
      }
    };
    reader.readAsText(file);
  };

  const doRestore = async () => {
    if (confirmText !== "RESTORE") return notify('Confirm karne ke liye RESTORE likhein');
    setBusy("restore");
    try {
      const res = await restoreBackup(restoreFile);
      const total = Object.values(res.restored || {}).reduce((t, c) => t + c, 0);
      notify(`${total} record restore ho gaye — page refresh karein`);
      setRestoreFile(null);
      setConfirmText("");
    } catch (err) {
      notify(`Restore failed: ${err.message}`);
    } finally { setBusy(""); }
  };

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 9, padding: 18 }}>
      <SectionHeading title="Backup" />

      {status ? (
        <div style={{ fontSize: 12.5, color: COLORS.textDim, marginBottom: 14 }}>
          Database mein abhi <b style={{ color: COLORS.text }}>{status.totalRows}</b> record hain
          {status.counts.orders ? ` (${status.counts.orders} orders, ${status.counts.inventory || 0} items)` : ""}.
          Tasveerein <b style={{ color: COLORS.text }}>{kb(status.imageBytes)}</b> ki hain.
        </div>
      ) : (
        <div style={{ fontSize: 12.5, color: COLORS.textFaint, marginBottom: 14 }}>Status load ho raha hai...</div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="mn-btn" disabled={Boolean(busy)} onClick={() => take(true)}>
          <FileText size={13} /> {busy === "full" ? "Ban raha hai..." : "Backup download karein"}
        </button>
        <button className="mn-btn-ghost" disabled={Boolean(busy)} onClick={() => take(false)}>
          {busy === "light" ? "..." : "Chhota backup (bina tasveer)"}
        </button>
        <button className="mn-btn-ghost" disabled={Boolean(busy)} onClick={takeCsvPack}>
          {busy === "csv" ? "..." : "Excel ke liye CSV"}
        </button>
      </div>

      <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginTop: 10, lineHeight: 1.6 }}>
        Poore backup mein sab kuch hota hai — orders, inventory, customers, payments, consignments, tasveerein.
        File download karke <b style={{ color: COLORS.textDim }}>Google Drive ya apne phone</b> mein rakh lein;
        sirf server par honay se backup ka koi faida nahi.
        Logins ke passwords is mein nahi jate.
      </div>

      <div style={{ borderTop: `1px solid ${COLORS.borderSoft}`, marginTop: 16, paddingTop: 16 }}>
        <SectionHeading title="Restore" />
        <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginBottom: 10, lineHeight: 1.6 }}>
          Backup file wapas daalne ke liye. Purana data delete nahi hota — jo record file mein hain woh
          add ya update ho jate hain, baqi waise ke waise rehte hain.
        </div>

        <input
          type="file" accept="application/json,.json"
          onChange={(e) => pickRestore(e.target.files[0])}
          style={{ fontSize: 12, color: COLORS.textDim }}
        />

        {restoreFile && (
          <div style={{ marginTop: 12, padding: 12, background: COLORS.surface2, border: `1px solid ${COLORS.accent}`, borderRadius: 7 }}>
            <div style={{ fontSize: 12.5, marginBottom: 8 }}>
              <b>{String(restoreFile.generated_at).slice(0, 10)}</b> ka backup —{" "}
              {Object.values(restoreFile.counts || {}).reduce((t, c) => t + c, 0)} record
              {restoreFile.includes_images === false && " (bina tasveeron ke)"}
            </div>
            <div style={{ fontSize: 11.5, color: COLORS.textFaint, marginBottom: 10 }}>
              {Object.entries(restoreFile.counts || {}).filter(([, c]) => c > 0).map(([t, c]) => `${t}: ${c}`).join(" · ")}
            </div>
            <label style={{ fontSize: 11, color: COLORS.textFaint, display: "block", marginBottom: 4 }}>
              Confirm karne ke liye <b style={{ color: COLORS.accent }}>RESTORE</b> likhein
            </label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                className="mn-input" style={{ maxWidth: 160 }} value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)} placeholder="RESTORE"
              />
              <button className="mn-btn" disabled={busy === "restore" || confirmText !== "RESTORE"} onClick={doRestore}>
                {busy === "restore" ? "Restore ho raha hai..." : "Restore karein"}
              </button>
              <button className="mn-btn-ghost" onClick={() => { setRestoreFile(null); setConfirmText(""); }}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
