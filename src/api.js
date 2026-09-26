// Talks to the munshi-backend API. Replaces the old window.storage calls.
//
// Set VITE_API_BASE_URL in your .env (e.g. https://api.zairascollection.com)
// when building with Vite. If you're using a different bundler, swap the
// `BASE_URL` line below for however your tooling exposes env vars.
const BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Exported so <img> tags can turn a relative image_url into a full src.
export const API_BASE_URL = BASE_URL.replace(/\/$/, "");

const TOKEN_KEY = "munshi_token";

// Token is kept in localStorage. This file only ever runs as part of the
// real hosted app (not inside a Claude.ai artifact preview), so normal
// browser storage is fine here — unlike an artifact, this won't be
// sandboxed, and a page refresh should keep the user logged in.
export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* storage unavailable, fine to no-op */ }
}

async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

// --- Auth ---
export async function login(email, password) {
  return request("/auth/login", { method: "POST", body: { email, password } });
}
export async function me() {
  return request("/auth/me");
}
export async function changePassword(oldPassword, newPassword) {
  return request("/auth/change-password", { method: "POST", body: { oldPassword, newPassword } });
}
export async function createUser({ name, email, password, role }) {
  return request("/auth/users", { method: "POST", body: { name, email, password, role } });
}
export async function listUsers() {
  return request("/auth/users");
}
export async function removeUser(id) {
  return request(`/auth/users/${id}`, { method: "DELETE" });
}

// --- Field name mapping between the UI's camelCase and the DB's snake_case ---
// Only fields that actually differ need an entry; everything else passes through.
const FIELD_MAPS = {
  orders: {
    orderNo: "order_no", amountPaid: "amount_paid", dueDate: "due_date",
    billedBy: "billed_by", returnReason: "return_reason",
    deliveryCharge: "delivery_charge", returnCharge: "return_charge",
    confirmationStatus: "confirmation_status", confirmedAt: "confirmed_at",
    soldBy: "sold_by", soldByType: "sold_by_type", consignmentId: "consignment_id",
    refundAmount: "refund_amount", returnedAt: "returned_at", deliveredAt: "delivered_at",
  },
  "ad-spend": {},
  suppliers: { contactPerson: "contact_person" },
  employees: { paidFrom: "account_id" },
  affiliates: { paidFrom: "account_id" },
  expenses: { accountId: "account_id" },
  inventory: { parentName: "parent_name", supplierId: "supplier_id", alertEnabled: "alert_enabled", imageUrl: "image_url" },
  accounts: {},
};

// Fields that come back from Postgres as strings (NUMERIC) and should be
// coerced to numbers so the UI's arithmetic and formatting work as before.
const NUMERIC_FIELDS = {
  inventory: ["quantity", "reorder", "cost", "price"],
  orders: ["qty", "sell", "cost", "amountPaid", "deliveryCharge", "returnCharge", "refundAmount"],
  "ad-spend": ["amount"],
  suppliers: [],
  employees: ["salary"],
  affiliates: ["rate", "sales", "commission"],
  accounts: ["balance"],
  expenses: ["amount"],
};

function toApi(resource, obj) {
  const map = FIELD_MAPS[resource] || {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (k === "id") continue; // server assigns/owns the id
    out[map[k] || k] = v === "" ? null : v;
  }
  return out;
}

function fromApi(resource, row) {
  if (!row) return row;
  const map = FIELD_MAPS[resource] || {};
  const reverse = Object.fromEntries(Object.entries(map).map(([a, b]) => [b, a]));
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    out[reverse[k] || k] = v;
  }
  // affiliates/employees keep paidFrom populated even when payment is
  // "Pending" so the badge logic in the UI still has something to show;
  // the backend clears account_id on markPending, matching that.
  const numeric = NUMERIC_FIELDS[resource] || [];
  for (const f of numeric) {
    if (out[f] !== undefined && out[f] !== null) out[f] = Number(out[f]);
  }
  return out;
}

// --- Generic resource CRUD ---
export const api = {
  list: (resource) => request(`/${resource}`).then((rows) => rows.map((r) => fromApi(resource, r))),
  create: (resource, item) =>
    request(`/${resource}`, { method: "POST", body: toApi(resource, item) }).then((r) => fromApi(resource, r)),
  update: (resource, id, item) =>
    request(`/${resource}/${id}`, { method: "PUT", body: toApi(resource, item) }).then((r) => fromApi(resource, r)),
  remove: (resource, id) => request(`/${resource}/${id}`, { method: "DELETE" }),
};

// --- Finance (owner only) ---
export async function financeSummary() {
  return request("/finance/summary");
}
export async function financeLedger() {
  return request("/finance/ledger");
}

// --- WooCommerce manual sync trigger (owner only) ---
export async function syncWooCommerce(days) {
  return request("/sync/woocommerce", { method: "POST", body: { days } });
}
export async function sendLowStockAlert() {
  return request("/alerts/low-stock", { method: "POST" });
}
// The history feed. `action` is "added" | "deleted" | "edited"; `changedBy`
// matches a person's name. All three filters are optional and combine.
export async function getAuditLog({ resource, changedBy, action } = {}) {
  const qs = new URLSearchParams();
  if (resource) qs.set("resource", resource);
  if (changedBy) qs.set("changedBy", changedBy);
  if (action) qs.set("action", action);
  const suffix = qs.toString();
  return request(`/audit-log${suffix ? `?${suffix}` : ""}`);
}

// Corrects which products a bill was for. Old bills recorded only a name,
// and many dresses here share one, so this is how a bill gets tied to the
// real product — and therefore the right photo — once and for all.
// `updateTotals` is off unless asked: fixing a picture must not silently
// change what the customer was charged.
export async function setOrderItems(id, items, updateTotals = false) {
  return request(`/orders/${id}/items`, { method: "PUT", body: { items, updateTotals } });
}

// Which backend build is actually running. Needs no token — it is there so
// "the fix isn't working" can be answered with a fact instead of a guess.
export async function getVersion() {
  return request("/version");
}

// Distinct names that appear in the history, for the "Changed by" filter.
export async function getAuditPeople() {
  return request("/audit-log/people");
}

// --- Returns ---
// One call marks the order Returned, records the courier's return charge
// and any refund, and (optionally) puts the stock back into inventory.
export async function returnOrder(id, { reason, refundAmount = 0, returnCharge, restock = true }) {
  return request(`/orders/${id}/return`, {
    method: "POST",
    body: { reason, refundAmount, returnCharge, restock },
  });
}

// --- COD / cost settings (everyone reads, owner writes) ---
export async function getSettings() {
  return request("/settings");
}
export async function saveSettings(patch) {
  return request("/settings", { method: "PUT", body: patch });
}

// --- Profit analytics (manager + owner) ---
export async function getAnalytics(from, to) {
  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  return request(`/analytics${qs.toString() ? `?${qs}` : ""}`);
}

// --- Month-end analysis sheet ---
export async function getMonthlySheet(month) {
  return request(`/reports/sheet${month ? `?month=${month}` : ""}`);
}
export async function getSavedSheets() {
  return request("/reports/saved");
}
export async function getSavedSheet(month) {
  return request(`/reports/saved/${month}`);
}

// --- Customers (ledger + risk) ---
export async function listCustomers() {
  return request("/customers");
}
export async function customerRisk(phone) {
  return request(`/customers/risk/${encodeURIComponent(phone)}`);
}
export async function saveCustomer(phone, patch) {
  return request(`/customers/${encodeURIComponent(phone)}`, { method: "PUT", body: patch });
}

// --- Purchase orders ---
export async function listPurchases() {
  return request("/purchases");
}
export async function getPurchase(id) {
  return request(`/purchases/${id}`);
}
export async function createPurchase(po) {
  return request("/purchases", { method: "POST", body: po });
}
export async function receivePurchase(id) {
  return request(`/purchases/${id}/receive`, { method: "POST" });
}
export async function removePurchase(id) {
  return request(`/purchases/${id}`, { method: "DELETE" });
}

// --- WhatsApp ---
export async function whatsappHealth() {
  return request("/whatsapp/health");
}
export async function sendConfirmation(orderId) {
  return request(`/whatsapp/confirm/${orderId}`, { method: "POST" });
}
export async function sendConfirmationBulk(ids) {
  return request("/whatsapp/confirm-bulk", { method: "POST", body: { ids } });
}
export async function setConfirmationStatus(orderId, status) {
  return request(`/whatsapp/status/${orderId}`, { method: "PUT", body: { status } });
}
export async function sendDigestNow() {
  return request("/alerts/digest", { method: "POST" });
}

// --- Push stock to the website ---
export async function pushStockToWebsite() {
  return request("/sync/stock", { method: "POST" });
}

// --- Order payments (udhaar clearing) ---
export async function listPayments(orderId) {
  return request(`/orders/${orderId}/payments`);
}
export async function addPayment(orderId, { amount, method, accountId, date, note }) {
  return request(`/orders/${orderId}/payment`, {
    method: "POST",
    body: { amount, method, accountId, date, note },
  });
}
export async function removePayment(orderId, paymentId) {
  return request(`/orders/${orderId}/payment/${paymentId}`, { method: "DELETE" });
}

// --- Undo a return that was marked by mistake ---
export async function undoReturn(orderId, status) {
  return request(`/orders/${orderId}/undo-return`, { method: "POST", body: { status } });
}

// --- Consignments (affiliate ko diya hua stock) ---
export async function listConsignments() {
  return request("/consignments");
}
export async function getConsignment(id) {
  return request(`/consignments/${id}`);
}
export async function createConsignment(payload) {
  return request("/consignments", { method: "POST", body: payload });
}
export async function settleConsignment(id, lines) {
  return request(`/consignments/${id}/settle`, { method: "POST", body: { lines } });
}
export async function removeConsignment(id) {
  return request(`/consignments/${id}`, { method: "DELETE" });
}
// Names only — safe for staff, unlike the full /affiliates list.
export async function listSellers() {
  return request("/consignments/sellers");
}
export async function holderSummary(name) {
  return request(`/consignments/holder/${encodeURIComponent(name)}/summary`);
}

// --- Backup & restore ---
export async function backupStatus() {
  return request("/backup/status");
}
// Not using request(): this one is a file download, not JSON we parse.
export async function downloadBackup({ includeImages = true } = {}) {
  const res = await fetch(`${BASE_URL}/backup/export${includeImages ? "" : "?images=0"}`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`Backup failed (${res.status})`);
  return res.json();
}
export async function restoreBackup(backup) {
  return request("/backup/restore", { method: "POST", body: { backup, confirm: "RESTORE" } });
}
