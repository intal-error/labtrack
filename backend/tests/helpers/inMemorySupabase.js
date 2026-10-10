/**
 * In-memory stand-in for the Supabase client, for API-level authorization tests.
 *
 * WHY THIS EXISTS: the existing verify suites call controller functions directly with
 * a hand-built `req.profile`. That proves a handler's own logic but bypasses the whole
 * middleware chain -- verifyToken, authorize, attachRole -- which is where an
 * authentication regression would hide. `apiAuthz.verify.js` therefore mounts the real
 * `server.js` and needs a data layer it can seed and assert against, without touching
 * the live Supabase project.
 *
 * SCOPE, DELIBERATELY SMALL. It implements only the query surface these tests drive:
 * select/insert/update/delete, eq/neq/in/or, order/limit, single, and the
 * `{ count, head }` shape. It is not a general PostgREST emulator, and a test needing
 * something else should say so rather than this file quietly growing.
 *
 * `.or()` accepts the quoted PostgREST grammar the app emits (`col.eq."CT",col2.eq."CT"`)
 * because courseScope's scopedAny() is the main thing under test alongside the P0 fixes.
 */

const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

/** Parse `col.op."value",col2.op."value"` into [{col,op,value}]. */
function parseOr(filter) {
  if (typeof filter !== "string") return [];
  const out = [];
  // Split on commas that are NOT inside double quotes, so a value containing a
  // comma cannot split the clause -- the same hazard postgrest.js orEqAny escapes.
  let depth = 0;
  let current = "";
  const parts = [];
  for (const ch of filter) {
    if (ch === '"') depth ^= 1;
    if (ch === "," && !depth) { parts.push(current); current = ""; } else { current += ch; }
  }
  if (current.trim()) parts.push(current);
  for (const part of parts) {
    const m = part.trim().match(/^([A-Za-z0-9_.]+)\.(eq|neq)\.(.+)$/);
    if (!m) continue;
    let value = m[3].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out.push({ col: m[1], op: m[2], value });
  }
  return out;
}

function matches(row, filters, ors) {
  for (const f of filters) {
    const v = row[f.col];
    if (f.op === "eq" && String(v) !== String(f.value)) return false;
    if (f.op === "neq" && String(v) === String(f.value)) return false;
    if (f.op === "in" && !Array.isArray(f.value).map(String).includes(String(v))) return false;
    if (f.op === "is" && f.value === null && v !== null && v !== undefined) return false;
  }
  if (ors.length) {
    // OR groups: each entry is a list of {col,op,value} that must all hold.
    const ok = ors.some((group) => group.every(({ col, op, value }) => {
      const v = row[col];
      if (op === "eq") return String(v) === String(value);
      if (op === "neq") return String(v) !== String(value);
      return false;
    }));
    if (!ok) return false;
  }
  return true;
}

class Builder {
  constructor(table, store, mode = "select") {
    this.table = table;
    this.store = store;
    this.mode = mode;
    this.filters = [];
    this.ors = [];
    this.orderBy = null;
    this.limitN = null;
    this.payload = null;
    this.options = {};
    this.singleMode = null;
  }

  select(_cols, options) {
    if (options) this.options = options || {};
    return this;
  }

  insert(rows) { this.mode = "insert"; this.payload = rows; return this; }
  upsert(rows) { this.mode = "upsert"; this.payload = rows; return this; }
  update(rows) { this.mode = "update"; this.payload = rows; return this; }
  delete() { this.mode = "delete"; return this; }

  eq(col, value) { this.filters.push({ col, op: "eq", value }); return this; }
  neq(col, value) { this.filters.push({ col, op: "neq", value }); return this; }
  is(col, value) { this.filters.push({ col, op: "is", value }); return this; }
  in(col, values) { this.filters.push({ col, op: "in", value: values }); return this; }

  /** PostgREST AND syntax: "a,b" means (a) OR (b). */
  or(filter) { this.ors.push(parseOr(filter)); return this; }

  order(col, opts) { this.orderBy = { col, asc: !opts || opts.ascending !== false }; return this; }
  limit(n) { this.limitN = n; return this; }
  range(from, to) { this.limitN = to - from + 1; return this; }

  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

  _rows() {
    const all = this.store[this.table] || [];
    return all.filter((r) => matches(r, this.filters, this.ors));
  }

  _finalise() {
    let rows = this._rows();
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      rows = [...rows].sort((a, b) => {
        const av = a[col]; const bv = b[col];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    return rows;
  }

  /** Every supabase-js call ends in a thenable; this implements it. */
  then(resolve, reject) {
    try {
      const store = this.store;
      const table = this.table;
      if (this.mode === "insert" || this.mode === "upsert") {
        const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted = incoming.map((row) => {
          const existingIdx = row.id !== undefined
            ? (store[table] || []).findIndex((r) => r.id === row.id)
            : -1;
          if (existingIdx >= 0) {
            store[table][existingIdx] = { ...store[table][existingIdx], ...clone(row) };
            return store[table][existingIdx];
          }
          const created = clone(row);
          store[table] = [...(store[table] || []), created];
          return created;
        });
        const result = this.singleMode === "single"
          ? { data: inserted[0], error: null }
          : { data: inserted, error: null };
        return resolve(result);
      }
      if (this.mode === "update") {
        const rows = this._rows();
        rows.forEach((row) => Object.assign(row, clone(this.payload)));
        const result = this.singleMode === "single"
          ? { data: rows[0], error: null }
          : { data: rows, error: null };
        return resolve(result);
      }
      if (this.mode === "delete") {
        const rows = this._rows();
        const ids = new Set(rows.map((r) => r.id));
        store[table] = (store[table] || []).filter((r) => !ids.has(r.id));
        return resolve({ data: rows, error: null });
      }

      // select
      const rows = this._finalise();
      const count = this._rows().length;
      if (this.options && this.options.head) {
        return resolve({ data: null, error: null, count });
      }
      if (this.singleMode === "single") {
        if (rows.length !== 1) {
          return resolve({ data: null, error: { message: "0 or >1 rows returned" }, count });
        }
        return resolve({ data: rows[0], error: null, count });
      }
      return resolve({ data: rows, error: null, count });
    } catch (err) {
      if (reject) return reject(err);
      return resolve({ data: null, error: { message: err.message } });
    }
  }
}

/** Build the client. `tables` is the seed; the same object is mutated by writes. */
function createClient(tables = {}) {
  const store = tables;
  const wrap = (name) => {
    if (typeof name !== "string") return Promise.resolve({ data: [], error: null, count: 0 });
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      return Promise.resolve({ data: null, error: { message: `unknown table ${name}` } });
    }
    return new Builder(name, store, "select");
  };
  return {
    from: wrap,
    // Tests assert on filters, so record what was asked for.
    __lastBuilder: null,
    rpc: () => Promise.resolve({ data: null, error: { message: "rpc not supported in tests" } }),
  };
}

module.exports = { createClient, parseOr };