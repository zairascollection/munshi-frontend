// The logic that decides what actually reaches the server.
//
// It lives here rather than inside App.jsx so it can be tested directly
// against the real backend — a mistake in either function silently loses
// data, which is exactly what happened with inventory photos.

// Fields whose value is a file the user picks. They are special: the list
// endpoint deliberately does not return the photo itself (it returns a
// cacheable URL instead), so the form never holds the current image.
// Sending the field regardless would overwrite a real photo with a blank.
export const FILE_FIELDS = new Set(["image"]);

// Explicit "the user pressed Remove photo". Needed because the row from the
// list always has image: null — so a null on its own cannot be told apart
// from "this form never loaded the photo in the first place".
export const REMOVE_FILE = "__munshi_remove_file__";

// Fields the server computes and sends down with each row. They must
// never travel back up — there is no column behind them, and an order's
// resolved `items` would be rejected or, worse, stored.
export const SERVER_DERIVED = new Set(["imageUrl", "image_url", "items"]);

// null, undefined and "" all mean "nothing here". The form turns a null
// column into "" for its inputs, and without this they would look like a
// change on every single save.
const isBlank = (v) => v === null || v === undefined || v === "";

// Builds the starting values for a form.
export function initialFormValues(fields, initialValues) {
  const vals = {};
  for (const f of fields) {
    const existing = initialValues ? initialValues[f.key] : undefined;
    if (FILE_FIELDS.has(f.key)) {
      // Left out entirely unless there is a real value — see diffForSync.
      if (!isBlank(existing)) vals[f.key] = existing;
      continue;
    }
    vals[f.key] = existing ?? f.default ?? "";
  }
  return vals;
}

// Works out what changed between the record we had and the record the user
// just saved, and returns only that. Sending the whole record instead would
// re-upload a 150 KB photo whenever someone ticks a checkbox, and would
// blank out any column the form never loaded.
export function diffForSync(before, after) {
  const patch = {};
  if (!before || !after) return patch;

  for (const key of Object.keys(after)) {
    // Derived by the server, never writable: the photo URL, and the line
    // items an order's product summary was resolved into.
    if (SERVER_DERIVED.has(key)) continue;

    const value = after[key];

    if (FILE_FIELDS.has(key)) {
      if (value === REMOVE_FILE) patch[key] = null;      // user removed it
      else if (!isBlank(value) && value !== before[key]) patch[key] = value; // user picked a new one
      continue;                                           // otherwise untouched
    }

    // Treat every flavour of empty as equal, so "" against a null column
    // is not reported as a change.
    if (isBlank(value) && isBlank(before[key])) continue;
    if (before[key] !== value) patch[key] = value;
  }
  return patch;
}

// The payload for a brand new record. Same file rule: a photo the user
// never picked is left out rather than sent as an empty string.
export function createPayload(item) {
  const out = {};
  for (const [k, v] of Object.entries(item)) {
    if (SERVER_DERIVED.has(k)) continue;
    if (FILE_FIELDS.has(k)) {
      if (v === REMOVE_FILE || isBlank(v)) continue;
      out[k] = v;
      continue;
    }
    out[k] = v;
  }
  return out;
}

// Rows the UI created optimistically carry a locally generated id until the
// server answers with a real UUID. Anything that is not a UUID is one of
// those, and must never be sent to the server as a record id.
export function isTempId(id) {
  return !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(id || ""));
}
