/**
 * Content hash of every profile document, for proving that a change touched only
 * what it was supposed to.
 *
 * WHY THIS EXISTS: after the Super Admin is configured, "nothing else changed" is a
 * claim that is easy to assert and impossible to check by eye -- there are 29
 * profile documents. This writes a stable, sorted, per-document SHA-256 so the
 * before and after runs can be diffed mechanically.
 *
 * Timestamps are deliberately EXCLUDED from the hash, with a reported count
 * instead. Two runs milliseconds apart would otherwise always differ, which trains
 * you to ignore the diff. `updatedAt` changing is legitimate when a document was
 * genuinely rewritten; what must never change is every other field.
 *
 * Usage:
 *   node scripts/profile-snapshot.js --out before.json
 *   node scripts/profile-snapshot.js --out after.json
 *   node scripts/profile-snapshot.js --diff before.json after.json
 */
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const admin = require("firebase-admin");

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
  }),
});
const db = admin.firestore();

const COLLECTIONS = ["users", "admins"];

/**
 * Canonical JSON: object keys sorted at every depth.
 *
 * Plain JSON.stringify would make the hash depend on key insertion order, and
 * Firestore returns field order that reflects how the document was written, not
 * how it is logically shaped. Re-saving a document with the same fields in a
 * different order would then look like a change.
 */
const stable = (v) => {
  if (v === null || typeof v !== "object") return JSON.stringify(v);
  if (Array.isArray(v)) return "[" + v.map(stable).join(",") + "]";
  return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stable(v[k])).join(",") + "}";
};

// The volatile bookkeeping fields, checked separately rather than hashed.
const VOLATILE = new Set(["updatedAt", "createdAt"]);

const hashDoc = (data) => {
  const kept = {};
  for (const k of Object.keys(data).sort()) if (!VOLATILE.has(k)) kept[k] = data[k];
  return crypto.createHash("sha256").update(stable(kept)).digest("hex");
};

async function capture() {
  const docs = {};
  for (const coll of COLLECTIONS) {
    const snap = await db.collection(coll).get();
    for (const d of snap.docs) {
      docs[`${coll}/${d.id}`] = {
        email: d.data().email || null,
        role: d.data().role || null,
        adminLevel: d.data().adminLevel || null,
        courseId: d.data().courseId === undefined ? null : d.data().courseId,
        hash: hashDoc(d.data()),
      };
    }
  }
  return {
    capturedAt: new Date().toISOString(),
    note: "Hashes exclude createdAt/updatedAt so two runs can be compared directly.",
    total: Object.keys(docs).length,
    docs,
  };
}

function diff(before, after) {
  const b = before.docs;
  const a = after.docs;
  const added = Object.keys(a).filter((k) => !(k in b));
  const removed = Object.keys(b).filter((k) => !(k in a));
  const modified = Object.keys(a).filter((k) => k in b && a[k].hash !== b[k].hash);
  const unchanged = Object.keys(a).filter((k) => k in b && a[k].hash === b[k].hash);

  console.log(`  before: ${Object.keys(b).length} docs`);
  console.log(`  after : ${Object.keys(a).length} docs`);
  console.log("");
  console.log(`  ADDED (${added.length}):`);
  for (const k of added) console.log(`    + ${k.padEnd(56)} ${a[k].email}  role=${a[k].role} level=${a[k].adminLevel} course=${a[k].courseId}`);
  console.log(`  REMOVED (${removed.length}):`);
  for (const k of removed) console.log(`    - ${k.padEnd(56)} ${b[k].email}`);
  console.log(`  MODIFIED (${modified.length}):`);
  for (const k of modified) {
    const fields = [];
    for (const f of new Set([...Object.keys(b[k]), ...Object.keys(a[k])])) {
      if (JSON.stringify(b[k][f]) !== JSON.stringify(a[k][f])) fields.push(`${f}: ${JSON.stringify(b[k][f])} -> ${JSON.stringify(a[k][f])}`);
    }
    console.log(`    ~ ${k.padEnd(56)} ${a[k].email}  ${fields.join("; ")}`);
  }
  console.log(`  UNCHANGED (${unchanged.length})`);
  return { added, removed, modified, unchanged };
}

(async () => {
  const argv = process.argv.slice(2);
  const opt = (n) => {
    const i = argv.indexOf(n);
    return i !== -1 && i + 1 < argv.length ? argv[i + 1] : undefined;
  };

  if (argv.includes("--diff")) {
    const [x, y] = [opt("--diff"), argv[argv.indexOf("--diff") + 2]];
    const before = JSON.parse(fs.readFileSync(x, "utf8"));
    const after = JSON.parse(fs.readFileSync(y, "utf8"));
    console.log(`=== DIFF ${x} -> ${y} ===`);
    const r = diff(before, after);
    console.log("");
    console.log(`  verdict: ${r.added.length} added, ${r.removed.length} removed, ${r.modified.length} modified, ${r.unchanged.length} unchanged`);
    process.exit(0);
  }

  const out = opt("--out");
  const snap = await capture();
  const target = out ? path.resolve(out) : path.join(process.cwd(), "backups", "profile-snapshot.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(snap, null, 2), "utf8");
  console.log(`captured ${snap.total} documents -> ${target}`);
})().catch((err) => {
  console.error(`ERR ${err.message}`);
  process.exit(1);
});