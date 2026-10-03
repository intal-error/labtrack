// Verifies the client half of the incident-report workflow: that the transition
// table the UI offers matches the one the server enforces, that the report form
// catches what the old `required`-attribute form let through, and — the check
// that would have caught the shipped bug — that the default form the UI pre-fills
// is actually accepted by the real server schema.
//
// WHY THIS FILE EXISTS: the workflow's rules are duplicated across two packages
// (frontend/src/constants/incidents.js and the backend's controller + validate.js)
// because the client cannot import CommonJS and the server cannot import ESM.
// There is no shared module, so nothing forces them to agree. If the client
// offers a transition the server rejects, the handler gets a 400 on a button that
// looked legitimate; if the two disagree about a field, the user fills in what
// the UI happily accepts and gets "Validation failed" for a form they believe is
// complete.
//
// That last one actually shipped: the server compared the END of the selected
// day against now, so TODAY was rejected for the entire day — and today is what
// the form pre-fills. No report could be filed without backdating by a day. The
// client compared calendar-day strings, so it happily allowed today. The two
// rules disagreed and the schema had no test at all, because the controller
// tests call the controller directly and bypass validate().
//
// The parity block below closes that loop by executing the actual backend schema
// against the form the UI actually produces, rather than restating its rules.
//
// Run: node tests/incidentWorkflow.verify.js   (or: npm run verify -w frontend)

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Loads a frontend source file by stripping its import/export syntax.
 *
 * WHY: relative imports in this codebase are extensionless (Vite resolves them,
 * plain `node` does not), and backend/tests/regressions.verify.js established the
 * eval bridge for exactly this reason. Adding ".js" to the specifiers instead
 * would work, but it diverges from every other module in the repo — and the
 * regressions suite records a past outage caused by a specifier that gained the
 * extension. So the dependencies are injected as function parameters, which is
 * also what makes it explicit which parts of constants/incidents.js the
 * validation module actually depends on.
 */
function loadFrontendModule(relativePath, inject = {}, exportNames = []) {
  let src = readFileSync(resolve(here, relativePath), "utf8");
  src = src
    .replace(/^import\s+[^;]*?from\s+["'][^"']+["'];?$/gm, "")
    .replace(/^export\s+/gm, "")
    .concat(`\nmodule.exports = { ${exportNames.join(", ")} };\n`);
  const names = Object.keys(inject);
  const module_ = { exports: {} };
  new Function(...names, "module", "exports", src)(...names.map((n) => inject[n]), module_, module_.exports);
  return module_.exports;
}

const constants = loadFrontendModule(
  "../src/constants/incidents.js",
  {},
  [
    "INCIDENT_TRANSITIONS",
    "INCIDENT_STATUSES",
    "INCIDENT_STATUS_LABELS",
    "INCIDENT_TRANSITION_LABELS",
    "INCIDENT_STATUS_TONE",
    "INCIDENT_TYPE_OPTIONS",
    "OPEN_INCIDENT_STATUSES",
    "MAX_INCIDENT_PHOTOS",
    "MIN_DESCRIPTION_LENGTH",
    "emptyIncidentForm",
    "todayISO",
    "SEVERITY_OPTIONS",
  ]
);

const {
  INCIDENT_TRANSITIONS,
  INCIDENT_STATUSES,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TRANSITION_LABELS,
  INCIDENT_STATUS_TONE,
  INCIDENT_TYPE_OPTIONS,
  OPEN_INCIDENT_STATUSES,
  MAX_INCIDENT_PHOTOS,
  MIN_DESCRIPTION_LENGTH,
  emptyIncidentForm,
  todayISO,
} = constants;

const { validateIncidentForm, validateIncidentTransition, hasErrors } = loadFrontendModule(
  "../src/utils/incidentValidation.js",
  {
    INCIDENT_TYPE_OPTIONS,
    SEVERITY_OPTIONS: constants.SEVERITY_OPTIONS,
    MAX_INCIDENT_PHOTOS,
    MIN_DESCRIPTION_LENGTH,
    todayISO,
  },
  ["validateIncidentForm", "validateIncidentTransition", "hasErrors"]
);

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

// ── The two tables must agree ───────────────────────────────────────────────
// Read the server's table out of its source rather than hard-coding it here, so
// this check fails the moment one side is edited without the other.
const controllerSource = readFileSync(
  resolve(here, "../../backend/src/controllers/incidentController.js"),
  "utf8"
);
const serverTable = controllerSource.match(/const INCIDENT_TRANSITIONS = \{[\s\S]*?\n\};/);

console.log("--- client and server agree on the state machine ---");
check("server transition table is readable", Boolean(serverTable), true);
if (serverTable) {
  // The literal uses bare keys, so quote them before parsing.
  const parsed = JSON.parse(
    serverTable[0]
      .replace("const INCIDENT_TRANSITIONS =", "")
      .replace(/;$/, "")
      .replace(/^(\s*)(\w+):/gm, '$1"$2":')
      .replace(/,(\s*[}\]])/g, "$1")
  );
  check("transitions match the server exactly", INCIDENT_TRANSITIONS, parsed);
}

console.log("--- the client table is well formed on its own ---");
check("every status has an entry", Object.keys(INCIDENT_TRANSITIONS).sort(), [...INCIDENT_STATUSES].sort());
const unknownTargets = INCIDENT_STATUSES.flatMap((s) => INCIDENT_TRANSITIONS[s]).filter((t) => !INCIDENT_STATUSES.includes(t));
check("no transition targets an unknown status", unknownTargets, []);
const unlabelled = INCIDENT_STATUSES.flatMap((s) => INCIDENT_TRANSITIONS[s]).filter((t) => !INCIDENT_TRANSITION_LABELS[t]);
check("every offered transition has a button label", unlabelled, []);
const untoned = INCIDENT_STATUSES.filter((s) => !INCIDENT_STATUS_TONE[s]);
check("every status has a badge tone", untoned, []);
const unlabelledStatus = INCIDENT_STATUSES.filter((s) => !INCIDENT_STATUS_LABELS[s]);
check("every status has a display label", unlabelledStatus, []);
check("resolved is terminal", INCIDENT_TRANSITIONS.resolved, []);
check("the open statuses are the pre-verdict ones", OPEN_INCIDENT_STATUSES, ["pending", "under_review"]);

// ── Form validation ─────────────────────────────────────────────────────────
console.log("--- the report form catches what the server would reject ---");
check("an empty form is invalid", hasErrors(validateIncidentForm({})), true);

const valid = {
  catalogId: "c1",
  incidentDate: todayISO(),
  type: "damage",
  severity: "medium",
  description: "The casing cracked while I was using it on the bench.",
  photos: [],
};
check("a well-formed report passes", hasErrors(validateIncidentForm(valid)), false);

check("a missing item is caught", "catalogId" in validateIncidentForm({ ...valid, catalogId: "" }), true);
check("a short description is caught", "description" in validateIncidentForm({ ...valid, description: "broke it" }), true);
check(
  "a description one char short is caught",
  "description" in validateIncidentForm({ ...valid, description: "x".repeat(MIN_DESCRIPTION_LENGTH - 1) }),
  true
);
check(
  "a description exactly at the minimum passes",
  "description" in validateIncidentForm({ ...valid, description: "x".repeat(MIN_DESCRIPTION_LENGTH) }),
  false
);
check("a future date is caught", "incidentDate" in validateIncidentForm({ ...valid, incidentDate: "2099-01-01" }), true);
check("today is allowed", "incidentDate" in validateIncidentForm({ ...valid, incidentDate: todayISO() }), false);
check("a past date is allowed", "incidentDate" in validateIncidentForm({ ...valid, incidentDate: "2020-01-01" }), false);
check("a malformed date is caught", "incidentDate" in validateIncidentForm({ ...valid, incidentDate: "01/02/2026" }), true);
check("an off-vocabulary type is caught", "type" in validateIncidentForm({ ...valid, type: "explosion" }), true);
check("an off-vocabulary severity is caught", "severity" in validateIncidentForm({ ...valid, severity: "catastrophic" }), true);
check(
  "too many photos is caught",
  "photos" in validateIncidentForm({ ...valid, photos: ["a", "b", "c", "d"] }),
  true
);
check(
  "exactly the photo cap is fine",
  "photos" in validateIncidentForm({ ...valid, photos: Array(MAX_INCIDENT_PHOTOS).fill("u") }),
  false
);

// Legacy types must stay displayable but must never be submittable.
console.log("--- legacy types are readable but not offered ---");
check("every offered type is in the vocabulary", INCIDENT_TYPE_OPTIONS.every((t) => Boolean(t.label && t.value)), true);
const legacy = "accident";
check("a legacy type is rejected on submit", "type" in validateIncidentForm({ ...valid, type: legacy }), true);

// ── Rejection needs a reason ────────────────────────────────────────────────
console.log("--- rejecting a report demands a reason ---");
check("rejection without a note is blocked", validateIncidentTransition("rejected", ""), "Please give a reason for rejecting this report");
check("rejection with whitespace only is blocked", validateIncidentTransition("rejected", "   "), "Please give a reason for rejecting this report");
check("rejection with a note passes", validateIncidentTransition("rejected", "Item was fine."), null);
check("other transitions need no note", validateIncidentTransition("under_review", ""), null);
check("resolution needs no note", validateIncidentTransition("resolved", ""), null);

// ── The default form is actually usable ───────────────────────────────────────
console.log("--- the default form is pre-filled with legal values ---");
const blank = emptyIncidentForm();
check("the default form passes validation except for what the student must supply",
  Object.keys(validateIncidentForm(blank)).sort(),
  ["catalogId", "description"]);
check("the default date is today", blank.incidentDate, todayISO());

// ── Client ↔ server parity, against the REAL backend schema ─────────────────
// The client and the server each hold their own copy of these rules, so the
// checks above only prove the client is internally consistent. These execute
// backend/src/middleware/validate.js itself (CommonJS, via createRequire) and
// feed it the payload IncidentReportForm.jsx actually POSTs.
//
// The decisive assertion is "the form's own defaults are accepted by the
// server": it is precisely what failed in the field, where the schema rejected
// today's date — the value the form itself had pre-filled.
console.log("--- the payload the UI sends is accepted by the real server schema ---");
const backendRequire = createRequire(import.meta.url);
const { incidentCreateSchema } = backendRequire(resolve(here, "../../backend/src/middleware/validate.js"));

// Mirrors IncidentReportForm.handleSubmit: it posts these keys and nothing else.
const payloadFrom = (form) => ({
  catalogId: form.catalogId,
  incidentDate: form.incidentDate,
  type: form.type,
  severity: form.severity,
  description: String(form.description || "").trim(),
  photos: form.photos || [],
});

const accepts = (form) => incidentCreateSchema.safeParse(payloadFrom(form)).success;
const rejects = (form) => !accepts(form);

const filled = { ...emptyIncidentForm(), catalogId: "c1", description: "x".repeat(20) };

check("the form's defaults plus the student's two choices are accepted", accepts(filled), true);
check("the shipped default date (today) is accepted by the server", accepts({ ...filled, incidentDate: todayISO() }), true);
check("yesterday is accepted by the server", accepts({ ...filled, incidentDate: "2020-01-01" }), true);
check("tomorrow is refused by the server", rejects({ ...filled, incidentDate: "2099-01-01" }), true);

// The client and the server must agree on which forms are submittable. Where
// the client says yes and the server says no, the user gets a 400 on a form
// they were told was fine.
console.log("--- client and server never disagree about what is submittable ---");
const candidates = [
  { ...filled },
  { ...filled, incidentDate: "2020-06-15" },
  { ...filled, incidentDate: "2099-12-31" },
  { ...filled, catalogId: "" },
  { ...filled, type: "explosion" },
  { ...filled, type: "accident" },
  { ...filled, severity: "catastrophic" },
  { ...filled, description: "too short" },
  { ...filled, description: "x".repeat(20) },
  { ...filled, photos: ["a", "b", "c", "d"] },
  { ...filled, photos: ["a", "b", "c"] },
];
const disagreements = candidates.filter((form) => {
  const clientOk = !hasErrors(validateIncidentForm(form));
  return clientOk !== accepts(form);
});
check("every candidate is judged the same by client and server", disagreements.length, 0);

// The date rule in particular is where the two copies historically diverged, so
// assert it directly rather than relying on the sweep above to notice.
console.log("--- the date rule agrees on both sides ---");
const dateRule = [
  ["today", todayISO(), true],
  ["yesterday", "2020-01-01", true],
  ["a future date", "2099-01-01", false],
];
dateRule.forEach(([label, value, expected]) => {
  const clientOk = !("incidentDate" in validateIncidentForm({ ...filled, incidentDate: value }));
  const serverOk = accepts({ ...filled, incidentDate: value });
  check(`${label}: client accepts = ${expected}`, clientOk, expected);
  check(`${label}: server accepts = ${expected}`, serverOk, expected);
});

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);