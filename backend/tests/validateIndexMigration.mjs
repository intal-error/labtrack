/**
 * Validates 19-performance-indexes.sql against the declared schema.
 *
 * WHY: a typo in a column name makes the statement fail. Because every index is a
 * separate statement, a failure halfway through leaves the earlier indexes created
 * and the rest missing -- a half-migrated database that looks fine until a specific
 * query is slow. This catches that BEFORE it reaches Supabase.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const schemaDir = path.join(here, "..", "src", "schema");

// Build the declared column set per table from every schema file.
const tables = {};
for (const f of fs.readdirSync(schemaDir).filter((f) => f.endsWith(".sql")).sort()) {
  const txt = fs.readFileSync(path.join(schemaDir, f), "utf8");
  const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_]+)\s*\(([\s\S]*?)\n\)\s*;/gi;
  for (const m of txt.matchAll(re)) {
    const cols = [...m[2].matchAll(/^\s*([a-z_][a-z0-9_]*)\s+[a-z]/gim)].map((x) => x[1]);
    tables[m[1]] = [...new Set(cols)];
  }
}

const mig = fs.readFileSync(path.join(schemaDir, "19-performance-indexes.sql"), "utf8");
const stmtRe = /CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z0-9_]+)\s+ON\s+([a-z_]+)\s*\(([^)]*)\)([\s\S]*?);/gi;

let problems = 0;
let checked = 0;
const seen = new Map();

console.log("tables discovered from schema files:", Object.keys(tables).length);
console.log("");

for (const s of mig.matchAll(stmtRe)) {
  const [, name, tbl, colList, tail] = s;
  checked++;

  if (seen.has(name)) {
    console.log(`  DUPLICATE INDEX NAME: ${name}`);
    problems++;
  }
  seen.set(name, true);

  if (!tables[tbl]) {
    console.log(`  MISSING TABLE: ${name} -> ${tbl}`);
    problems++;
    continue;
  }

  const cols = colList.split(",").map((c) => c.trim().split(/\s+/)[0].replace(/"/g, ""));
  const missing = cols.filter((c) => !tables[tbl].includes(c));
  if (missing.length) {
    console.log(`  MISSING COLUMN: ${name} on ${tbl} -> ${missing.join(", ")}`);
    problems++;
    continue;
  }

  const w = /WHERE\s+([\s\S]*)$/i.exec(tail);
  if (w) {
    const known = new Set([...cols, ...tables[tbl]]);
    const predCols = [...w[1].matchAll(/([a-z_][a-z0-9_]*)\s*(?:=|<>|<|>)/gi)].map((x) => x[1]);
    const unknown = [...new Set(predCols)].filter(
      (c) => !known.has(c) && !["and", "or", "not", "true", "false", "is", "null"].includes(c),
    );
    if (unknown.length) {
      console.log(`  UNKNOWN COLUMN IN PARTIAL PREDICATE: ${name} -> ${unknown.join(", ")}`);
      problems++;
      continue;
    }
    console.log(`  OK  ${name}  (${tbl} : ${cols.join(", ")})  [partial]`);
  } else {
    console.log(`  OK  ${name}  (${tbl} : ${cols.join(", ")})`);
  }
}

console.log("");
console.log(`statements in file: ${checked}`);
console.log(`problems: ${problems}`);
console.log(problems === 0 ? "\nALL INDEXES VALID" : "\nDO NOT RUN - fix the problems above");
process.exit(problems === 0 ? 0 : 1);