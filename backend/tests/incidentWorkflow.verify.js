// Verifies the incident-report workflow: auto-assignment to the reporter's
// course handler, course-scoped visibility, the legal-transition state machine,
// the append-only event timeline, and the identity fields that must be resolved
// server-side.
//
// WHY THIS FILE EXISTS: the incident feature this replaces trusted req.body for
// the reporter's name and course and for the item name, assigned nothing to
// anybody (the assigned_to column was never written), let ANY admin see and
// mutate every report regardless of course, and offered a generic PUT that could
// rewrite any column of a filed report. Each of those is a security or
// data-integrity bug, and each is asserted below against the real controller.
//
// Run: node tests/incidentWorkflow.verify.js   (or: npm run verify -w backend)

process.env.SUPABASE_URL = "https://placeholder.supabase.co";
process.env.SUPABASE_SERVICE_KEY = "placeholder-key";

const supabasePath = require.resolve("../src/config/supabase");
const firebasePath = require.resolve("../src/config/firebase");

// ── Seed data ───────────────────────────────────────────────────────────────

const CATALOG = [
  { id: "c1", item_name: "Digital Multimeter", course: "BIT", category: "Instrument" },
  { id: "c2", item_name: "Soldering Station", course: "BSCS", category: "Tool" },
];

const USERS = {
  // Students
  s1: { id: "s1", firstName: "Ana", lastName: "Dela Cruz", course: "BIT", year: "4th Year", role: "student", status: "active", schoolId: "23-000039" },
  s2: { id: "s2", firstName: "Ben", lastName: "Reyes", course: "BSCS", year: "3rd Year", role: "student", status: "active", schoolId: "23-000040" },
  // Course handler for BIT only
  hBit: { id: "hBit", firstName: "Cara", lastName: "Lim", role: "admin", status: "active", assignedCourses: ["BIT"] },
  // Course handler for BSCS only
  hBscs: { id: "hBscs", firstName: "Dan", lastName: "Ocho", role: "admin", status: "active", assignedCourses: ["BSCS"] },
  // No assignedCourses => super-admin
  root: { id: "root", firstName: "Eve", lastName: "Santos", role: "admin", status: "active", assignedCourses: [] },
};

function makeIncident(o) {
  return {
    id: "i1",
    title: "Damaged item: Digital Multimeter",
    type: "damage",
    description: "The casing cracked while I was using it on the bench.",
    severity: "medium",
    reported_by: "s1",
    reporter_name: "Ana Dela Cruz",
    reporter_role: "student",
    reporter_school_id: "23-000039",
    reporter_course: "BIT",
    reporter_year: "4th Year",
    status: "pending",
    assigned_to: "hBit",
    assigned_to_name: "Cara Lim",
    item_name: "Digital Multimeter",
    item_course: "BIT",
    catalog_id: "c1",
    incident_date: "2026-10-01",
    photos: [],
    reassignment_history: [],
    resolution: "",
    created_at: "2026-10-01T09:00:00.000Z",
    updated_at: "2026-10-01T09:00:00.000Z",
    ...o,
  };
}

const state = {
  tables: {
    incidents: [makeIncident({})],
    incident_events: [],
    catalog: CATALOG,
    notifications: [],
  },
  // Recorded side effects, so the assertions can prove an event was written or a
  // notification fanned out rather than inferring it from the returned row.
  insertedIncidents: [],
  insertedEvents: [],
  updates: [],
  deletes: [],
};

function resetDb() {
  state.tables.incidents = [makeIncident({})];
  state.tables.incident_events = [];
  state.tables.notifications = [];
  state.insertedIncidents = [];
  state.insertedEvents = [];
  state.updates = [];
  state.deletes = [];
}

// ── Minimal query-builder stub ──────────────────────────────────────────────
// Supports the chain the controller actually uses: select/in/eq/gte/lte/order
// for reads, insert/update/delete for writes. A fluent, thenable object is
// enough; PostgREST does not do anything here that needs real semantics.

function from(table) {
  const all = () => state.tables[table] || [];
  let filtered = null;
  let mutation = null;
  let payload = null;
  let insertedRow = null;

  const scoped = () => (filtered === null ? all() : filtered);

  function runMutation() {
    if (mutation === "insert") {
      const rows = Array.isArray(payload) ? payload : [payload];
      rows.forEach((row) => {
        const copy = { ...row };
        // all() returns the live array, so this is the only push needed. Adding
        // a second push for notifications here silently doubled the fan-out and
        // made the count assertions meaningless.
        all().push(copy);
        insertedRow = copy;
        if (table === "incidents") state.insertedIncidents.push(copy);
        if (table === "incident_events") state.insertedEvents.push(copy);
      });
      return { data: insertedRow, error: null };
    }
    if (mutation === "update") {
      scoped().forEach((row) => {
        Object.assign(row, payload);
        if (table === "incidents") state.updates.push({ id: row.id, patch: payload });
      });
      return { data: null, error: null };
    }
    if (mutation === "delete") {
      const doomed = scoped();
      const ids = new Set(doomed.map((r) => r.id));
      state.deletes.push({ table, ids: [...ids] });
      const remaining = all().filter((r) => !ids.has(r.id));
      state.tables[table] = remaining;
      filtered = [];
      return { data: null, error: null };
    }
    return { data: scoped(), error: null };
  }

  const addFilter = (fn) => {
    const base = filtered === null ? all() : filtered;
    filtered = base.filter(fn);
    return chain;
  };

  const chain = {
    select: () => chain,
    in: (k, vals) => addFilter((r) => vals.map(String).includes(String(r[k]))),
    eq: (k, v) => addFilter((r) => String(r[k]) === String(v)),
    is: (k, v) => addFilter((r) => (r[k] ?? null) === v),
    gte: (k, v) => addFilter((r) => String(r[k]) >= String(v)),
    lte: (k, v) => addFilter((r) => String(r[k]) <= String(v)),
    order: () => chain,
    insert: (data) => {
      mutation = "insert";
      payload = data;
      return chain;
    },
    update: (data) => {
      mutation = "update";
      payload = data;
      return chain;
    },
    delete: () => {
      mutation = "delete";
      return chain;
    },
    single: () => {
      if (mutation === "insert") return Promise.resolve(runMutation());
      return Promise.resolve({ data: scoped()[0] || null, error: null });
    },
    maybeSingle: () => Promise.resolve({ data: scoped()[0] || null, error: null }),
    then: (resolve, reject) => {
      try {
        resolve(runMutation());
      } catch (e) {
        reject(e);
      }
    },
  };

  return chain;
}

require.cache[supabasePath] = {
  id: supabasePath, filename: supabasePath, loaded: true,
  exports: { supabase: { from } },
};

require.cache[firebasePath] = {
  id: firebasePath, filename: firebasePath, loaded: true,
  exports: {
    admin: {},
    auth: {},
    db: {
      collection: (name) => ({
        // Only the users collection is exercised here.
        where: () => ({ get: async () => ({ docs: [] }) }),
        doc: (id) => ({
          get: async () => {
            const doc = name === "users" ? USERS[id] : null;
            return doc ? { exists: true, data: () => doc, id } : { exists: false, data: () => undefined, id };
          },
        }),
      }),
    },
  },
};

const controller = require("../src/controllers/incidentController");
const { INCIDENT_TRANSITIONS } = controller;
const { validate, incidentCreateSchema } = require("../src/middleware/validate");

// adminScope reads the admin list straight from Firestore, so the collection
// stub above needs a real .where(...).get() for the role query. Patch it in now
// that the module is loaded (the stub object is shared by reference).
const firebaseConfig = require(firebasePath);
const realCollection = firebaseConfig.db.collection;
firebaseConfig.db.collection = (name) => {
  const base = realCollection(name);
  if (name !== "users") return base;
  return {
    where: (field, op, value) => ({
      get: async () => ({
        docs: Object.values(USERS)
          .filter((u) => (field !== "role" ? true : u.role === value))
          .map((u) => ({ id: u.id, data: () => u })),
      }),
    }),
    doc: (id) => base.doc(id),
  };
};

// ── Harness ─────────────────────────────────────────────────────────────────

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

function makeRes() {
  const res = { statusCode: 200, body: null };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

// `setup` runs AFTER the reset, so a test that needs a specific starting state
// (a resolved report, two reports, a pre-seeded timeline) passes it here rather
// than assigning before the call, which the reset would undo.
async function call(handler, { uid, role = "student", body, query = {}, params = {}, setup } = {}) {
  resetDb();
  if (setup) setup();
  const res = makeRes();
  await handler({ user: { uid, role }, body: body || {}, query, params }, res);
  return res;
}

const ids = (rows) => rows.map((r) => r.id).sort();

/** Local calendar day, matching constants/incidents.js -> todayISO(). */
function todayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function shiftDays(isoDate, days) {
  const d = new Date(`${isoDate}T00:00:00`);
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Runs the real middleware, so these assertions cover the schema and the 400
// envelope rather than just safeParse.
function runSchema(body) {
  const res = makeRes();
  let passed = false;
  validate(incidentCreateSchema)({ body }, res, () => { passed = true; });
  return { passed, statusCode: res.statusCode, details: (res.body && res.body.details) || [] };
}

const failsOn = (body, field) => runSchema(body).details.some((d) => d.startsWith(`${field}:`));

(async () => {
  // ── The request schema ───────────────────────────────────────────────────
  // Everything below this point calls the controller directly, which bypasses
  // validate() entirely. Before this section the schema had NO coverage, which
  // is how the incidentDate rule below shipped rejecting the form's own default.
  console.log("--- the schema accepts what the form actually sends ---");

  const legal = {
    catalogId: "c1",
    incidentDate: todayISO(),
    type: "damage",
    severity: "medium",
    description: "The casing cracked while I was using it on the bench.",
    photos: [],
  };

  check("a well-formed report is accepted", runSchema(legal).passed, true);

  console.log("--- the regression: TODAY must be accepted, not just yesterday ---");
  // The rule used to parse `T23:59:59` and demand that instant be in the past,
  // so today was rejected for the whole day. Since today is what the form
  // pre-fills, no report could be filed without backdating by a day.
  check("today is accepted", runSchema({ ...legal, incidentDate: todayISO() }).passed, true);
  check("yesterday is accepted", runSchema({ ...legal, incidentDate: shiftDays(todayISO(), -1) }).passed, true);
  check("last year is accepted", runSchema({ ...legal, incidentDate: "2020-01-01" }).passed, true);
  check("tomorrow is still refused", runSchema({ ...legal, incidentDate: shiftDays(todayISO(), 1) }).passed, false);
  check("and it names the date rule",
    failsOn({ ...legal, incidentDate: shiftDays(todayISO(), 1) }, "incidentDate"), true);
  check("a far-future date is refused", runSchema({ ...legal, incidentDate: "2099-01-01" }).passed, false);
  check("a malformed date is refused", runSchema({ ...legal, incidentDate: "01/02/2026" }).passed, false);
  check("a missing date is refused", runSchema({ ...legal, incidentDate: undefined }).passed, false);

  console.log("--- the default form the UI pre-fills must pass end to end ---");
  // Mirrors frontend/src/constants/incidents.js -> emptyIncidentForm() plus the
  // two fields the student still has to choose. If the schema and the form ever
  // disagree again, this is the assertion that catches it.
  const shippedDefaults = {
    catalogId: "c1",
    incidentDate: todayISO(),
    type: "damage",
    severity: "medium",
    description: "x".repeat(20),
    photos: [],
  };
  check("the shipped default form is accepted", runSchema(shippedDefaults).passed, true);
  check("the minimum-length description is accepted",
    runSchema({ ...shippedDefaults, description: "x".repeat(20) }).passed, true);
  check("one character short is refused",
    runSchema({ ...shippedDefaults, description: "x".repeat(19) }).passed, false);

  console.log("--- every other field guard ---");
  check("a missing item is refused", runSchema({ ...legal, catalogId: "" }).passed, false);
  check("and it names the item field", failsOn({ ...legal, catalogId: "" }, "catalogId"), true);
  check("an off-vocabulary type is refused", runSchema({ ...legal, type: "explosion" }).passed, false);
  check("a legacy type is refused", runSchema({ ...legal, type: "irregularity" }).passed, false);
  check("an off-vocabulary severity is refused", runSchema({ ...legal, severity: "catastrophic" }).passed, false);
  check("four photos are refused", runSchema({ ...legal, photos: ["a", "b", "c", "d"] }).passed, false);
  check("three photos are fine", runSchema({ ...legal, photos: ["a", "b", "c"] }).passed, true);
  check("omitting photos is fine", runSchema({ ...legal, photos: undefined }).passed, true);
  check("the 400 body names the fields",
    runSchema({ ...legal, catalogId: "", type: "explosion" }).details.length >= 2, true);

  console.log("--- identity fields are stripped, not accepted ---");
  // create() resolves these server-side; if they were ever added to the schema a
  // client could send them again.
  const parsed = incidentCreateSchema.parse({
    ...legal,
    reporterName: "Someone Else",
    reporter_course: "BIT",
    itemName: "Some Other Item",
    status: "resolved",
  });
  check("reporterName is not carried through", "reporterName" in parsed, false);
  check("reporter_course is not carried through", "reporter_course" in parsed, false);
  check("itemName is not carried through", "itemName" in parsed, false);
  check("a client cannot preset the status", parsed.status, undefined);

  // ── The transition table itself ──────────────────────────────────────────
  console.log("--- the state machine is total and closed ---");
  const known = ["approved", "pending", "rejected", "resolved", "under_review"];
  check("every status has an entry", Object.keys(INCIDENT_TRANSITIONS).sort(), known);
  const unknownTargets = known.flatMap((s) => INCIDENT_TRANSITIONS[s]).filter((t) => !known.includes(t));
  check("no transition targets an unknown status", unknownTargets, []);
  check("resolved is terminal", INCIDENT_TRANSITIONS.resolved, []);
  check("pending cannot jump straight to approved", INCIDENT_TRANSITIONS.pending.includes("approved"), false);
  check("approved cannot go back to review", INCIDENT_TRANSITIONS.approved.includes("under_review"), false);
  check("rejected can be reopened", INCIDENT_TRANSITIONS.rejected.includes("under_review"), true);

  // ── Course-scoped visibility ─────────────────────────────────────────────
  console.log("--- a course handler only sees their own course ---");
  const mixedCourses = () => {
    state.tables.incidents = [
      makeIncident({ id: "bit1", reporter_course: "BIT", status: "pending" }),
      makeIncident({ id: "bscs1", reporter_course: "BSCS", status: "pending" }),
      makeIncident({ id: "nocourse", reporter_course: "", status: "pending" }),
    ];
  };
  const bitList = await call(controller.getAll, { uid: "hBit", role: "admin", setup: mixedCourses });
  check("BIT handler sees only BIT", ids(bitList.body), ["bit1"]);

  const rootList = await call(controller.getAll, { uid: "root", role: "admin", setup: mixedCourses });
  check("super-admin (no assignedCourses) sees all", ids(rootList.body).length, 3);

  const studentList = await call(controller.getAll, { uid: "s1", role: "student" });
  check("students cannot use the staff list", studentList.statusCode, 403);

  // A handler must never be shown a report with no course on it. Failing closed
// here is the whole point: an unassignable row would otherwise be invisible to
// the very person who has to resolve it.
  const nocourse = await call(controller.getAll, { uid: "hBscs", role: "admin", setup: mixedCourses });
  check("the BSCS handler sees only BSCS", ids(nocourse.body), ["bscs1"]);
  check("a report with no course is not leaked to a handler", ids(nocourse.body).includes("nocourse"), false);

  // ── Identity is resolved server-side, never from the body ───────────────
  console.log("--- a client cannot forge who filed the report, or which item ---");
  const forged = await call(controller.create, {
    uid: "s2",
    role: "student",
    body: {
      catalogId: "c1",
      incidentDate: "2026-10-01",
      type: "damage",
      severity: "medium",
      description: "A description long enough to pass validation checks.",
      photos: [],
      // All of this used to be trusted straight from req.body.
      reporterName: "Someone Else",
      reporter_role: "admin",
      reporterCourse: "BIT",
      reporter_course: "BIT",
      itemName: "Some Other Item",
      reported_by: "hBit",
      status: "resolved",
    },
  });
  check("create succeeds", forged.statusCode, 201);
  const filed = state.insertedIncidents[0] || {};
  check("reporter name comes from Firestore", filed.reporter_name, "Ben Reyes");
  check("reporter course comes from Firestore", filed.reporter_course, "BSCS");
  check("reporter id comes from the token", filed.reported_by, "s2");
  check("item name comes from the catalog", filed.item_name, "Digital Multimeter");
  check("item course comes from the catalog", filed.item_course, "BIT");
  check("status is always pending on create", filed.status, "pending");
  check("client-supplied status is ignored", filed.status === "resolved", false);

  console.log("--- assignment follows the reporter's course ---");
  // Ben is BSCS, so the BSCS handler is chosen even though the item is BIT gear.
  check("assigned to the BSCS handler", filed.assigned_to, "hBscs");
  check("handler name is denormalised", filed.assigned_to_name, "Dan Ocho");
  check("a submitted event is written", state.insertedEvents.length >= 1, true);
  check("the event records the filing", state.insertedEvents[0].event_type, "submitted");
  check("only the responsible handler is notified", state.tables.notifications.length, 1);
  check("notification targets the handler", state.tables.notifications[0].target_user_id, "hBscs");

  console.log("--- an unknown catalog item is rejected, not silently filed ---");
  const missing = await call(controller.create, {
    uid: "s1",
    role: "student",
    body: {
      catalogId: "does-not-exist",
      incidentDate: "2026-10-01",
      type: "damage",
      severity: "low",
      description: "A description long enough to pass validation checks.",
      photos: [],
    },
  });
  check("unknown item is a 404", missing.statusCode, 404);
  check("nothing was written", state.insertedIncidents.length, 0);

  // ── The transition state machine ─────────────────────────────────────────
  console.log("--- illegal transitions are refused ---");
  const illegal = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { status: "approved" },
  });
  check("pending -> approved is a 400", illegal.statusCode, 400);
  check("the error names the current status", /Pending/.test(illegal.body.error), true);
  check("no event was written", state.insertedEvents.length, 0);
  check("no notification was sent", state.tables.notifications.length, 0);

  const same = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { status: "pending" },
  });
  check("setting the current status is a 400", same.statusCode, 400);

  console.log("--- legal transitions write the event and notify the student ---");
  const started = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { status: "under_review" },
  });
  check("pending -> under_review is allowed", started.statusCode, 200);
  check("one event was appended", state.insertedEvents.length, 1);
  check("event records the transition",
    [state.insertedEvents[0].from_status, state.insertedEvents[0].to_status],
    ["pending", "under_review"]);
  check("event records the handler", state.insertedEvents[0].actor_name, "Cara Lim");
  check("student was notified", state.tables.notifications[0].target_user_id, "s1");
  check("notification names the new status", /Under Review/.test(state.tables.notifications[0].title), true);

  console.log("--- rejection requires a reason, so the student is told why ---");
  const bareReject = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { status: "rejected" },
  });
  check("rejection without a note is a 400", bareReject.statusCode, 400);
  check("no event written", state.insertedEvents.length, 0);

  const reject = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" },
    body: { status: "rejected", note: "Item was returned undamaged the same day." },
  });
  check("rejection with a note is allowed", reject.statusCode, 200);

  console.log("--- resolution records the closing outcome ---");
  const resolved = await call(controller.updateStatus, {
    uid: "hBit", role: "admin", params: { id: "i1" },
    body: { status: "resolved", note: "Replacement issued from stock." },
    setup: () => { state.tables.incidents = [makeIncident({ status: "approved" })]; },
  });
  check("approved -> resolved is allowed", resolved.statusCode, 200);
  check("resolution text is stored",
    state.tables.incidents[0].resolution, "Replacement issued from stock.");

  // ── Course scoping on every mutation ─────────────────────────────────────
  console.log("--- a handler cannot act on another course's report ---");
  const crossCourse = await call(controller.updateStatus, {
    uid: "hBscs", role: "admin", params: { id: "i1" }, body: { status: "under_review" },
  });
  check("cross-course update is a 403", crossCourse.statusCode, 403);
  check("nothing changed", state.insertedEvents.length, 0);

  const crossRemark = await call(controller.addRemark, {
    uid: "hBscs", role: "admin", params: { id: "i1" }, body: { note: "not my course" },
  });
  check("cross-course remark is a 403", crossRemark.statusCode, 403);

  const crossDelete = await call(controller.remove, {
    uid: "hBit", role: "admin", params: { id: "i1" },
  });
  check("a course handler cannot delete", crossDelete.statusCode, 403);

  console.log("--- a super-admin can, so can the rightful handler ---");
  const rootDelete = await call(controller.remove, {
    uid: "root", role: "admin", params: { id: "i1" },
  });
  check("super-admin deletes a pending report", rootDelete.statusCode, 200);
  check("the events went with it",
    state.deletes.map((d) => d.table).sort(), ["incident_events", "incidents"]);

  console.log("--- but not one that already carries a verdict ---");
  const lateDelete = await call(controller.remove, {
    uid: "root", role: "admin", params: { id: "i1" },
    setup: () => { state.tables.incidents = [makeIncident({ status: "resolved" })]; },
  });
  check("deleting a resolved report is a 400", lateDelete.statusCode, 400);
  check("the report survives", state.tables.incidents.length, 1);

  // ── Remarks ──────────────────────────────────────────────────────────────
  console.log("--- remarks are appended, and are closed once resolved ---");
  const emptyRemark = await call(controller.addRemark, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { note: "   " },
  });
  check("an empty remark is a 400", emptyRemark.statusCode, 400);

  const remark = await call(controller.addRemark, {
    uid: "hBit", role: "admin", params: { id: "i1" },
    body: { note: "Checked the bench, damage is consistent with the report." },
  });
  check("a remark is accepted", remark.statusCode, 200);
  check("it is written as a remark event", state.insertedEvents[0].event_type, "remark");
  check("it does NOT move the status", state.tables.incidents[0].status, "pending");
  check("the student is notified", state.tables.notifications[0].target_user_id, "s1");

  const lateRemark = await call(controller.addRemark, {
    uid: "hBit", role: "admin", params: { id: "i1" }, body: { note: "one more thing" },
    setup: () => { state.tables.incidents = [makeIncident({ status: "resolved" })]; },
  });
  check("a remark on a resolved report is a 400", lateRemark.statusCode, 400);

  // ── Reassignment ─────────────────────────────────────────────────────────
  console.log("--- reassignment validates the target handler ---");
  const toStudent = await call(controller.reassign, {
    uid: "root", role: "admin", params: { id: "i1" }, body: { newHandlerId: "s1" },
  });
  check("cannot assign to a student", toStudent.statusCode, 400);

  const wrongCourse = await call(controller.reassign, {
    uid: "root", role: "admin", params: { id: "i1" }, body: { newHandlerId: "hBscs" },
  });
  check("cannot assign outside the reporter's course", wrongCourse.statusCode, 400);

  const good = await call(controller.reassign, {
    uid: "root", role: "admin", params: { id: "i1" },
    body: { newHandlerId: "root", reason: "handler on leave" },
  });
  check("a super-admin may take it", good.statusCode, 200);
  check("the history records the move", state.tables.incidents[0].reassignment_history.length, 1);
  check("history names the previous handler",
    state.tables.incidents[0].reassignment_history[0].previous_admin_name, "Cara Lim");
  check("reassignment writes an event", state.insertedEvents[0].event_type, "reassigned");
  check("the new handler is notified", state.tables.notifications[0].target_user_id, "root");

  // ── The student's own view ───────────────────────────────────────────────
  console.log("--- a student sees their own reports and nobody else's ---");
  const twoReports = () => {
    state.tables.incidents = [
      makeIncident({ id: "mine", reported_by: "s1" }),
      makeIncident({ id: "theirs", reported_by: "s2" }),
    ];
  };
  const mine = await call(controller.getMine, { uid: "s1", setup: twoReports });
  check("only their own", ids(mine.body), ["mine"]);

  const theirs = await call(controller.getOne, { uid: "s1", params: { id: "theirs" }, setup: twoReports });
  check("reading someone else's report is a 403", theirs.statusCode, 403);

  const own = await call(controller.getOne, { uid: "s1", params: { id: "mine" }, setup: twoReports });
  check("reading their own is a 200", own.statusCode, 200);
  check("the timeline is embedded", Array.isArray(own.body.events), true);

  // ── Timeline read ────────────────────────────────────────────────────────
  console.log("--- the detail endpoint returns the trail in order ---");
  const detail = await call(controller.getOne, {
    uid: "s1", params: { id: "i1" },
    setup: () => {
      state.tables.incident_events = [
        { id: "e2", incident_id: "i1", event_type: "status_change", from_status: "pending", to_status: "under_review", actor_name: "Cara Lim", created_at: "2026-10-01T10:00:00.000Z" },
        { id: "e1", incident_id: "i1", event_type: "submitted", to_status: "pending", actor_name: "Ana Dela Cruz", created_at: "2026-10-01T09:00:00.000Z" },
        { id: "x9", incident_id: "other", event_type: "remark", created_at: "2026-10-01T11:00:00.000Z" },
      ];
    },
  });
  check("only this report's events", detail.body.events.map((e) => e.id), ["e2", "e1"]);
  check("both spellings are exposed", detail.body.reporter_course !== undefined, true);
  check("camelCase is available to the UI", detail.body.reporterCourse, "BIT");

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
})();