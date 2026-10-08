/**
 * Read-only sizing probe for migration 19.
 *
 * WHY: a plain `CREATE INDEX` takes a SHARE lock that BLOCKS inserts, updates and
 * deletes on the table for its whole duration (reads still work). That is fine for a
 * 400-row catalog and a problem for a 400,000-row attendance log where students are
 * scanning in at the same time. The deciding number is the row count, so this asks the
 * database rather than guessing.
 *
 * SELECT-only. Touches nothing.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(here, "..", ".env");

// Minimal .env reader: no dotenv dependency, and no printing of secret values.
const env = {};
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = /^\s*([A-Z_0-9]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const url = env.SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.log("SUPABASE_URL / SERVICE_KEY not set - skipping live sizing probe.");
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// Exactly the tables migration 19 touches.
const TABLES = [
  "transactions",
  "lab_attendance",
  "fines",
  "borrow_requests",
  "incidents",
  "catalog",
  "notifications",
];

console.log("row counts (exact head count, read-only):");
console.log("");

const rows = [];
for (const t of TABLES) {
  const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
  if (error) {
    console.log(`  ${t.padEnd(20)} ERROR: ${error.message}`);
    continue;
  }
  rows.push({ table: t, count: count ?? 0 });
}

const fmt = (n) => n.toLocaleString("en-US");
for (const r of rows.sort((a, b) => b.count - a.count)) {
  let verdict = "";
  if (r.count === 0) verdict = "empty - instant";
  else if (r.count < 10_000) verdict = "fast (<1s), plain CREATE INDEX is fine";
  else if (r.count < 100_000) verdict = "a few seconds - plain CREATE INDEX OK, CONCURRENTLY still nicer";
  else if (r.count < 1_000_000) verdict = "SLOW - use CONCURRENTLY, plain will block writes";
  else verdict = "VERY SLOW - CONCURRENTLY is mandatory";
  console.log(`  ${r.table.padEnd(20)} ${fmt(r.count).padStart(12)}   ${verdict}`);
}

const total = rows.reduce((s, r) => s + r.count, 0);
console.log("");
console.log(`total rows across these tables: ${fmt(total)}`);

const disk = (n) => `${(n * 1024 * 1024 / (1024 * 1024)).toFixed(1)} MB est.`;
console.log(`rough on-disk size of new indexes: ~${(total * 40 / (1024*1024)).toFixed(0)} MB (order of magnitude)`);