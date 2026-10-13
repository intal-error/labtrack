// Auto-assignment: who may be handed a request or a report for a given course.
//
// ── THE BUG THIS PINS ─────────────────────────────────────────────────────────
//
// Borrow Request Details was reported showing an admin from an UNRELATED COURSE.
// `autoAssignAdmin` had this shape:
//
//     let candidates = admins;                       // the WHOLE roster
//     if (course) {
//       const matched = admins.filter((a) => isAdminForCourse(a, course));
//       if (matched.length > 0) candidates = matched;
//     }
//     candidates.sort(byWorkload);
//     return candidates[0];
//
// Two defects:
//
//   1. When no admin covered the course, `matched` was empty and `candidates` stayed as
//      every active admin -- including Course Admins of other courses. Workload then
//      picked whoever was least busy, typically an MT admin for a BIT request. That
//      admin can never see the row: getAllRequests filters by `scopeCodes(req)`. So the
//      request was assigned to someone who would never be shown it, while looking
//      handled to everyone else.
//
//   2. A Super Admin can never be in `matched`. `isAdminForCourse` is
//      `getAdminCourses(a).includes(course)` and `getAdminCourses` returns `[]` for a
//      Super Admin (no courseId), so the one tier that can service ANY course was
//      excluded from the matched set while competing in the unrestricted fallback.
//
// The fix ranks in tiers: course-matched admin -> unrestricted Super Admin -> nothing.
//
// Run: node tests/autoAssign.verify.js
//
// Style follows the rest of backend/tests: CommonJS, with Firestore and Supabase
// replaced through require.cache before adminScope is loaded.

let failures = 0;
function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

// ── Stub Firestore and Supabase before adminScope resolves them ──────────────

const CT = "CT";
const MT = "MT";
const BIT = "BIT";

/** The roster `getActiveAdminsList` will return. Mutated between cases. */
let ROSTER = [];
/** Rows the workload query reports as still open. */
let OPEN_ROWS = [];

const docsFor = () => ({
  docs: ROSTER.map((a) => ({ id: a.id, data: () => { const copy = { ...a }; delete copy.id; return copy; } })),
  empty: ROSTER.length === 0,
});

const firebasePath = require.resolve("../src/config/firebase");
require.cache[firebasePath] = {
  id: firebasePath,
  filename: firebasePath,
  loaded: true,
  exports: {
    db: { collection: () => ({ where: () => ({ get: async () => docsFor() }) }) },
    admin: { apps: [{}], initializeApp: () => {} },
    FieldPath: { documentId: () => "__name__" },
  },
  children: [],
  paths: [],
};

const supabasePath = require.resolve("../src/config/supabase");
require.cache[supabasePath] = {
  id: supabasePath,
  filename: supabasePath,
  loaded: true,
  exports: {
    supabase: {
      from: () => ({
        select: () => ({
          in: async () => ({ data: OPEN_ROWS, error: null }),
        }),
      }),
    },
  },
  children: [],
  paths: [],
};

const { autoAssignAdmin, invalidateAdminsCache } = require("../src/utils/adminScope");

const WORKLOAD = { table: "borrow_requests", workloadColumn: "assigned_admin_id", workloadStatuses: ["pending"] };

const ADMIN = (id, firstName, lastName, extra = {}) => ({
  id,
  role: "admin",
  firstName,
  lastName,
  status: "active",
  ...extra,
});

function setRoster(admins, openRows = []) {
  ROSTER = admins;
  OPEN_ROWS = openRows;
  // The roster is memoised for a minute; without this the next case would read the
  // previous case's admins and every assertion would be meaningless.
  invalidateAdminsCache();
}

(async () => {
  // ── 1. THE REPORTED BUG ────────────────────────────────────────────────────

  console.log("--- a course with no handler is never given another course's admin ---");
  setRoster(
    [
      ADMIN("ct-1", "Cruz", "Tapis", { adminLevel: "course", courseId: CT }),
      ADMIN("mt-1", "Dela", "Cruz", { adminLevel: "course", courseId: MT }),
    ],
    [{ assigned_admin_id: "ct-1" }, { assigned_admin_id: "ct-1" }, { assigned_admin_id: "mt-1" }]
  );
  {
    // BIT has no admin. The OLD code fell back to the whole roster and workload
    // balancing handed it to the least busy Course Admin -- which is how a BIT request
    // ended up showing an MT admin.
    const picked = await autoAssignAdmin(BIT, WORKLOAD);
    check("nothing is assigned when no admin covers the course", picked === null, `got ${picked && picked.id}`);
    check(
      "  and specifically not the other course's Course Admin",
      picked?.id !== "ct-1" && picked?.id !== "mt-1",
      `got ${picked?.id}`
    );
  }

  console.log("--- an unrestricted Super Admin is eligible ---");
  setRoster([
    ADMIN("ct-1", "Cruz", "Tapis", { adminLevel: "course", courseId: CT }),
    ADMIN("mt-1", "Dela", "Cruz", { adminLevel: "course", courseId: MT }),
    ADMIN("super-1", "Admin", "Super", { adminLevel: "super" }),
  ]);
  {
    // `getAdminCourses` returns [] for a Super Admin, so `isAdminForCourse` is false for
    // them and they were excluded from `matched`. They can see every course, so they
    // are the right fallback -- but only when nobody actually owns the course.
    const picked = await autoAssignAdmin(BIT, WORKLOAD);
    check("a Super Admin is chosen instead of nobody", picked?.id === "super-1", `got ${picked?.id}`);
  }

  // ── 2. Normal assignment still behaves ─────────────────────────────────────

  console.log("--- a matching admin still wins ---");
  setRoster([
    ADMIN("bit-1", "Bituin", "Admin", { adminLevel: "course", courseId: BIT }),
    ADMIN("mt-1", "Dela", "Cruz", { adminLevel: "course", courseId: MT }),
    ADMIN("super-1", "Admin", "Super", { adminLevel: "super" }),
  ]);
  {
    const picked = await autoAssignAdmin(BIT, WORKLOAD);
    check("the course-matched admin beats the Super Admin", picked?.id === "bit-1", `got ${picked?.id}`);
  }

  setRoster(
    [
      ADMIN("bit-1", "Bituin", "Admin", { adminLevel: "course", courseId: BIT }),
      ADMIN("bit-2", "Balang", "Admin", { adminLevel: "course", courseId: BIT }),
    ],
    [{ assigned_admin_id: "bit-1" }, { assigned_admin_id: "bit-1" }, { assigned_admin_id: "bit-2" }]
  );
  {
    const picked = await autoAssignAdmin(BIT, WORKLOAD);
    check("among matches, the least loaded one is chosen", picked?.id === "bit-2", `got ${picked?.id}`);
  }

  console.log("--- inactive admins are never candidates ---");
  setRoster([
    ADMIN("bit-off", "Off", "Duty", { adminLevel: "course", courseId: BIT, status: "inactive" }),
    ADMIN("super-1", "Admin", "Super", { adminLevel: "super" }),
  ]);
  {
    const picked = await autoAssignAdmin(BIT, WORKLOAD);
    check("an inactive admin is not assigned", picked?.id !== "bit-off", `got ${picked?.id}`);
  }

  // ── 3. The shared roster must not be reordered ────────────────────────────
  //
  // `getActiveAdminsList` returns `adminsCache.list` itself, not a copy. An in-place
  // `candidates.sort(...)` therefore reordered the cached roster for every other caller
  // in the process until the TTL expired.

  console.log("--- the cached roster is not mutated ---");
  {
    const roster = [
      ADMIN("ct-1", "Cruz", "Tapis", { adminLevel: "course", courseId: CT }),
      ADMIN("mt-1", "Dela", "Cruz", { adminLevel: "course", courseId: MT }),
      ADMIN("mt-2", "Dalis", "Cruz", { adminLevel: "course", courseId: MT }),
    ];
    setRoster(roster, [
      { assigned_admin_id: "ct-1" },
      { assigned_admin_id: "ct-1" },
      { assigned_admin_id: "ct-1" },
    ]);
    const before = roster.map((a) => a.id).join(",");
    await autoAssignAdmin(MT, WORKLOAD);
    const after = roster.map((a) => a.id).join(",");
    check("assignment does not reorder the shared roster", before === after, `before [${before}] after [${after}]`);
  }

  // ── 4. Degenerate inputs ───────────────────────────────────────────────────

  console.log("--- degenerate inputs ---");
  setRoster([]);
  check("an empty roster assigns nobody", (await autoAssignAdmin(BIT, WORKLOAD)) === null);

  setRoster([ADMIN("ct-1", "Cruz", "Tapis", { adminLevel: "course", courseId: CT })]);
  check("a single matching admin is returned", (await autoAssignAdmin(CT, WORKLOAD))?.id === "ct-1");

  setRoster([
    ADMIN("ct-1", "Cruz", "Tapis", { adminLevel: "course", courseId: CT }),
    ADMIN("mt-1", "Dela", "Cruz", { adminLevel: "course", courseId: MT }),
  ], [{ assigned_admin_id: "ct-1" }]);
  {
    // No course to match on, so the whole roster is fair game and the least loaded wins.
    const picked = await autoAssignAdmin("", WORKLOAD);
    check("with no course, the least loaded admin is chosen", picked?.id === "mt-1", `got ${picked?.id}`);
  }

  console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
})();