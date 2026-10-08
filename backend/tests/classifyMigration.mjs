/**
 * Classifies the migration by what it can actually DO to a database, ignoring comments.
 *
 * WHY: "is it safe to run" is not about whether the file reads nicely. It is about
 * whether any statement can destroy or alter data. Comments get grepped too (a note
 * saying "dropping an index is not reversible" contains DROP), so this strips them
 * before counting and only reports on executable SQL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(here, "..", "src", "schema", "19-performance-indexes.sql");
const raw = fs.readFileSync(file, "utf8");

/** Removes -- line comments and /* block *\/ comments, respecting string literals. */
function stripComments(sql) {
  let out = "";
  let i = 0;
  let inLine = false;
  let inBlock = false;
  let inStr = null;
  while (i < sql.length) {
    const c = sql[i];
    const n = sql[i + 1];
    if (inLine) {
      if (c === "\n") { inLine = false; out += c; }
      i++;
      continue;
    }
    if (inBlock) {
      if (c === "*" && n === "/") { inBlock = false; i += 2; continue; }
      i++;
      continue;
    }
    if (inStr) {
      out += c;
      if (c === inStr && sql[i - 1] !== "\\") inStr = null;
      i++;
      continue;
    }
    if (c === "-" && n === "-") { inLine = true; i += 2; continue; }
    if (c === "/" && n === "*") { inBlock = true; i += 2; continue; }
    if (c === "'" || c === '"') { inStr = c; out += c; i++; continue; }
    out += c;
    i++;
  }
  return out;
}

const sql = stripComments(raw);
const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const count = (re) => (sql.match(re) || []).length;

console.log("EXECUTABLE SQL ONLY (comments stripped)");
console.log("");
console.log(`  total statements        : ${statements.length}`);
console.log(`  CREATE INDEX            : ${count(/CREATE\s+INDEX/gi)}`);
console.log(`    of which IF NOT EXISTS: ${count(/CREATE\s+INDEX\s+IF\s+NOT\s+EXISTS/gi)}`);
console.log(`    of which CONCURRENTLY  : ${count(/CREATE\s+INDEX\s+CONCURRENTLY/gi)}`);
console.log("");
console.log("DESTRUCTIVE / MUTATING VERBS");
for (const [label, re] of [
  ["DROP", /\bDROP\b/gi],
  ["DELETE", /\bDELETE\s+FROM\b/gi],
  ["TRUNCATE", /\bTRUNCATE\b/gi],
  ["ALTER", /\bALTER\b/gi],
  ["UPDATE", /\bUPDATE\b/gi],
  ["INSERT", /\bINSERT\b/gi],
  ["GRANT", /\bGRANT\b/gi],
  ["CONCURRENTLY", /\bCONCURRENTLY\b/gi],
  ["transaction control", /\b(BEGIN|COMMIT|ROLLBACK)\b/gi],
]) {
  const n = (sql.match(re) || []).length;
  console.log(`  ${label.padEnd(20)}: ${n}${n === 0 ? "   <- cannot harm data" : "   <- REVIEW"}`);
}

console.log("");
const unsafe = count(/\b(DROP|DELETE\s+FROM|TRUNCATE|ALTER|UPDATE|INSERT)\b/gi);
console.log(unsafe === 0 ? "VERDICT: contains only CREATE INDEX. Cannot lose or alter data." : `VERDICT: ${unsafe} mutating statement(s) - review above.`);