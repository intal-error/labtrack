/**
 * Executable tests for firestore.rules.
 *
 * WHY THIS FILE EXISTS AT ALL: every write the application makes goes through the
 * firebase-admin SDK, which BYPASSES Firestore security rules. Nothing else in the
 * repo ever evaluated them, so the rules were untested prose that nobody would
 * notice breaking. These run against the Firestore emulator so the rules are
 * actually executed, and so a future edit that reopens an escalation fails CI
 * instead of shipping.
 *
 * The two holes this closes, both reachable by any signed-in user with devtools:
 *
 *   1. `/users/{userId}` update protected only the `role` key, so a Course Admin
 *      could write adminLevel:"super" into their OWN profile. courseScope trusts
 *      adminLevel, so that granted every course.
 *   2. `/users/{userId}` create allowed any fields, so a client could create its
 *      own document with role:"admin" and satisfy isAdmin() immediately.
 *
 * Run via: npm run verify:rules -w backend   (wraps `firebase emulators:exec`)
 * Run directly only while an emulator is listening on 127.0.0.1:8080.
 */

const fs = require("fs");
const path = require("path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

const RULES_PATH = path.join(__dirname, "..", "..", "firestore.rules");

const SUPER = "uid-super";
const COURSE_CT = "uid-course-ct";
const COURSE_MT = "uid-course-mt";
const STUDENT = "uid-student";
const OTHER_STUDENT = "uid-student-2";
const COURSE_NO_LEVEL = "uid-course-nolevel";
const COURSE_NO_COURSES = "uid-course-nocourses";
const COURSE_BAD_CODE = "uid-course-badcode";
const COURSE_EMPTY_LIST = "uid-course-emptylist";
const COURSE_MULTI = "uid-course-multi";
// Section 1 needs its own targets. A full set() REPLACES a document, so reusing the
// shared STUDENT fixture there rewrote it to {role:"admin",adminLevel:"super"} and
// every later "student" assertion then ran against an account that was secretly a
// Super Admin -- passing or denying for the wrong reason. Isolation is not tidiness
// here; a contaminated fixture makes the whole suite lie.
const SEC1_TARGET = "uid-sec1-target";
const PROMOTEE = "uid-promotee";
// Separate doc: section 1 deletes OTHER_STUDENT as the Super Admin, and section 3
// needs its own student so that delete has a `resource` to evaluate. Reusing one
// doc across both read as a rules failure rather than a test-ordering bug.
const COURSE_DELETE_STUDENT = "uid-student-3";

let failures = 0;
let passes = 0;

async function check(label, promise, shouldSucceed) {
  try {
    if (shouldSucceed) {
      await assertSucceeds(promise);
    } else {
      await assertFails(promise);
    }
    passes += 1;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      ${err.message.split("\n")[0]}`);
  }
}

/**
 * For assertions about the VALUE that comes back, rather than whether the call was
 * permitted. assertSucceeds only checks that a promise did not reject, so passing it
 * a `.then(s => s.data().role === "student")` would report PASS whether the boolean
 * was true or false -- which is how a canary silently stops checking anything.
 */
async function checkValue(label, promise, expected) {
  let actual;
  try {
    actual = await promise;
  } catch (err) {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      request was refused: ${err.message.split("\n")[0]}`);
    return;
  }
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    passes += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      expected ${JSON.stringify(expected)}  actual ${JSON.stringify(actual)}`);
  }
}

(async () => {
  const rules = fs.readFileSync(RULES_PATH, "utf8");

  const testEnv = await initializeTestEnvironment({
    projectId: "demo-labtrack-rules",
    firestore: { rules, host: "127.0.0.1", port: 8080 },
  });

  try {
    // Seed with rules disabled: this is how a real project's data looks, written by
    // the Admin SDK, which never consults the rules.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await db.doc(`users/${SUPER}`).set({
        role: "admin", adminLevel: "super", courseId: null,
        firstName: "Super", lastName: "Admin",
      });
      await db.doc(`users/${COURSE_CT}`).set({
        role: "admin", adminLevel: "course", courseId: "CT",
        firstName: "Course", lastName: "CT",
      });
      await db.doc(`users/${COURSE_MT}`).set({
        role: "admin", adminLevel: "course", courseId: "MT",
        firstName: "Course", lastName: "MT",
      });
      await db.doc(`users/${STUDENT}`).set({
        role: "student", course: "CT", firstName: "Stu", lastName: "Dent",
      });
      await db.doc(`users/${OTHER_STUDENT}`).set({
        role: "student", course: "CT", firstName: "Oth", lastName: "Er",
      });
      await db.doc(`users/${COURSE_DELETE_STUDENT}`).set({
        role: "student", course: "CT", firstName: "Del", lastName: "Etable",
      });
      await db.doc(`users/${SEC1_TARGET}`).set({
        role: "student", course: "CT", firstName: "Sec", lastName: "One",
      });
      await db.doc(`users/${PROMOTEE}`).set({
        role: "admin", adminLevel: "course", courseId: "CT",
        firstName: "Prom", lastName: "Otee",
      });
      await db.doc("admins/uid-course-ct").set({ email: "ct@x", assignedCourses: ["CT"] });
      await db.doc("settings/general").set({ schoolName: "SLSU" });
      await db.doc("labRooms/room-1").set({ name: "Lab 1", course: "CT" });

      // ── Course-scoped read fixtures ──
      // Two course-less admins, to pin the difference that matters most below: an
      // admin with NO adminLevel is inferred super by courseScope.js (legacy), but
      // the rules must NOT mirror that inference.
      await db.doc(`users/${COURSE_NO_LEVEL}`).set({
        role: "admin", assignedCourses: ["MT"],
      });
      await db.doc(`users/${COURSE_NO_COURSES}`).set({ role: "admin" });

      // Adversarial course assignments. A misspelled code must NOT widen access to
      // everything, and an empty list must NOT behave like "no restriction".
      await db.doc(`users/${COURSE_BAD_CODE}`).set({
        role: "admin", adminLevel: "course", courseId: "ZZZ",
      });
      await db.doc(`users/${COURSE_EMPTY_LIST}`).set({
        role: "admin", adminLevel: "course", courseId: null, assignedCourses: [],
      });
      // A legacy multi-course admin: rules must honour every listed course.
      await db.doc(`users/${COURSE_MULTI}`).set({
        role: "admin", assignedCourses: ["CT", "MT"],
      });

      for (const [id, coll, data] of [
        // Fixtures use `reporter_course` and `reported_by`, matching what the application
        // actually writes (incidentController.js insertData). An earlier version of
        // these fixtures used `course`, which no code writes -- so the rule's
        // predicate was being tested against a field that does not exist.
        ["inc-ct", "incidents", { title: "Broken glass", reporter_course: "CT", reported_by: OTHER_STUDENT, reporter_name: "Someone Else", reporter_school_id: "S-2" }],
        ["inc-mt", "incidents", { title: "Spill", reporter_course: "MT", reported_by: STUDENT }],
        ["mnt-ct", "maintenance", { item: "Projector", course: "CT" }],
        ["mnt-mt", "maintenance", { item: "Bench", course: "MT" }],
        // Both transaction shapes matter: a CT student's loan of CT equipment, and
        // an MT student's loan of CT equipment, which a CT admin must still see.
        ["txn-ct-borrower", "transactions", { course: "CT", equipment_course: "CT" }],
        ["txn-mt-borrower-ct-kit", "transactions", { course: "MT", equipment_course: "CT" }],
        ["txn-mt-borrower-mt-kit", "transactions", { course: "MT", equipment_course: "MT" }],
        ["room-ct", "labRooms", { name: "Networking Lab", course: "CT" }],
        ["room-mt", "labRooms", { name: "Machine Shop", course: "MT" }],
        ["room-unassigned", "labRooms", { name: "Storage", course: null }],
        ["item-ct", "catalog", { name: "Oscilloscope", course: "CT" }],
        ["item-mt", "catalog", { name: "Lathe", course: "MT" }],
        ["item-nocourse", "catalog", { name: "Unassigned item", course: null }],
      ]) {
        await db.doc(`${coll}/${id}`).set(data);
      }
    });

    const asSuper = testEnv.authenticatedContext(SUPER).firestore();
    const asCourseCT = testEnv.authenticatedContext(COURSE_CT).firestore();
    const asCourseMT = testEnv.authenticatedContext(COURSE_MT).firestore();
    const asStudent = testEnv.authenticatedContext(STUDENT).firestore();
    const asAnon = testEnv.unauthenticatedContext().firestore();
    const asNoLevel = testEnv.authenticatedContext(COURSE_NO_LEVEL).firestore();
    const asNoCourses = testEnv.authenticatedContext(COURSE_NO_COURSES).firestore();
    const asBadCode = testEnv.authenticatedContext(COURSE_BAD_CODE).firestore();
    const asEmptyList = testEnv.authenticatedContext(COURSE_EMPTY_LIST).firestore();
    const asMulti = testEnv.authenticatedContext(COURSE_MULTI).firestore();

    console.log("--- 1. Super Admin can administer the system ---");
    await check("super admin CAN write a users/ document", asSuper.doc(`users/${SEC1_TARGET}`).set({ firstName: "Renamed" }), true);
    await check("super admin CAN write the admins/ collection", asSuper.doc("admins/new-admin").set({ email: "n@x" }), true);
    await check("super admin CAN update an existing admins/ doc", asSuper.doc("admins/uid-course-ct").set({ email: "ct@x", courseId: "CT" }), true);
    await check("super admin CAN set privileged fields on ANOTHER user", asSuper.doc(`users/${PROMOTEE}`).set({ role: "admin", adminLevel: "super", courseId: null }), true);
    await check("super admin CAN read settings", asSuper.doc("settings/general").get(), true);
    await check("super admin CAN delete a student record", asSuper.doc(`users/${OTHER_STUDENT}`).delete(), true);
    await check("super admin CANNOT delete ITSELF", asSuper.doc(`users/${SUPER}`).delete(), false);
    await check("super admin CAN update its OWN course field", asSuper.doc(`users/${SUPER}`).update({ courseId: "CT" }), true);
    // Canary: if section 1 ever touches a fixture another section depends on, the
    // remaining sections would keep passing while testing nothing. Assert both the
    // shared student and the Super fixture are still intact.
    await checkValue("  CANARY: super fixture kept its tier", asSuper.doc(`users/${SUPER}`).get().then(s => s.data().adminLevel), "super");
    await checkValue("  CANARY: shared student fixture is uncontaminated", asSuper.doc(`users/${STUDENT}`).get().then(s => s.data().role), "student");

    console.log("--- 2. Course Admin cannot reach or grant Super Admin ---");
    await check("course admin CANNOT write admins/", asCourseCT.doc("admins/new-admin").set({ email: "hack@x" }), false);
    await check("course admin CANNOT update an existing admins/ doc", asCourseCT.doc("admins/uid-course-ct").set({ courseId: "MT" }), false);
    await check("course admin CANNOT promote ITSELF (adminLevel)", asCourseCT.doc(`users/${COURSE_CT}`).set({ adminLevel: "super" }), false);
    await check("course admin CANNOT promote ITSELF (courseId -> all)", asCourseCT.doc(`users/${COURSE_CT}`).set({ courseId: null }), false);
    await check("course admin CANNOT promote ITSELF (role)", asCourseCT.doc(`users/${COURSE_CT}`).set({ role: "admin", adminLevel: "super" }), false);
    await check("course admin CANNOT promote a PEER", asCourseCT.doc(`users/${COURSE_MT}`).set({ adminLevel: "super" }), false);
    await check("course admin CANNOT flip a student's role", asCourseCT.doc(`users/${STUDENT}`).set({ role: "admin" }), false);
    await check("course admin CANNOT delete another ADMIN", asCourseCT.doc(`users/${COURSE_MT}`).delete(), false);
    await check("course admin CANNOT delete itself", asCourseCT.doc(`users/${COURSE_CT}`).delete(), false);
    // A second, differently-scoped Course Admin proves the guards are per-account
    // rather than something about being any admin: MT cannot promote CT either.
    await check("a DIFFERENT course admin cannot write admins/ either", asCourseMT.doc("admins/new-admin").set({ email: "hack2@x" }), false);
    await check("a course admin cannot promote an admin in ANOTHER course", asCourseMT.doc(`users/${COURSE_CT}`).set({ adminLevel: "super" }), false);
    await check("a course admin cannot edit another course admin's profile", asCourseMT.doc(`users/${COURSE_CT}`).update({ firstName: "Hacked" }), false);

    console.log("--- 3. Course Admin keeps the normal capabilities ---");
    // update(), not set(): a full set() REPLACES the document, so it would strip
    // role/adminLevel/courseId. That is correctly refused -- see the two tests below.
    await check("course admin CAN edit its OWN non-privileged fields", asCourseCT.doc(`users/${COURSE_CT}`).update({ firstName: "Renamed", contact: "123" }), true);
    await check("course admin CAN read its OWN profile", asCourseCT.doc(`users/${COURSE_CT}`).get(), true);
    await check("course admin CAN read admin profiles", asCourseCT.doc(`users/${SUPER}`).get(), true);
    await check("course admin CAN write catalog", asCourseCT.doc("catalog/item-1").set({ name: "Microscope" }), true);
    await check("course admin CAN read lab rooms", asCourseCT.doc("labRooms/room-1").get(), true);
    await check("course admin CAN delete a STUDENT record", asCourseCT.doc(`users/${COURSE_DELETE_STUDENT}`).delete(), true);
    await check("course admin CANNOT silently drop its own tier with a full set()", asCourseCT.doc(`users/${COURSE_CT}`).set({ firstName: "Only" }), false);
    await check("  and its tier survived the attempt", asCourseCT.doc(`users/${COURSE_CT}`).get().then(s => s.data().adminLevel), true);

    console.log("--- 4. Student cannot modify privileged fields ---");
    await check("student CANNOT set its own adminLevel", asStudent.doc(`users/${STUDENT}`).set({ adminLevel: "super" }), false);
    await check("student CANNOT set its own role", asStudent.doc(`users/${STUDENT}`).set({ role: "admin" }), false);
    await check("student CANNOT promote ANOTHER user", asStudent.doc(`users/${OTHER_STUDENT}`).set({ adminLevel: "super" }), false);
    await check("student CANNOT write admins/", asStudent.doc("admins/new-admin").set({ email: "x@x" }), false);
    await check("student CANNOT edit another profile", asStudent.doc(`users/${OTHER_STUDENT}`).set({ firstName: "Hacked" }), false);
    await check("student CAN still edit its OWN non-privileged fields", asStudent.doc(`users/${STUDENT}`).update({ firstName: "Renamed", contact: "999" }), true);
    await check("student CANNOT strip its own role with a full set()", asStudent.doc(`users/${STUDENT}`).set({ firstName: "Only" }), false);
    await checkValue("  CANARY: that refused write left the student intact",
      asSuper.doc(`users/${STUDENT}`).get().then(s => s.data().role), "student");
    await check("student CAN read its OWN profile", asStudent.doc(`users/${STUDENT}`).get(), true);
    await check("student CANNOT read settings", asStudent.doc("settings/general").get(), false);
    await check("student CANNOT create an admin-privileged profile for itself",
      asStudent.doc(`users/${STUDENT}`).set({ role: "admin", adminLevel: "super" }), false);
    // Second canary: every denied write above must have left the fixture untouched.
    await checkValue("  CANARY: student still has no adminLevel",
      asSuper.doc(`users/${STUDENT}`).get().then(s => s.data().adminLevel === undefined), true);

    console.log("--- 5. Unauthenticated is denied ---");
    await check("anon CANNOT read a profile", asAnon.doc(`users/${SUPER}`).get(), false);
    await check("anon CANNOT read settings", asAnon.doc("settings/general").get(), false);
    await check("anon CANNOT write a profile", asAnon.doc(`users/${STUDENT}`).set({ role: "admin" }), false);
    await check("anon CANNOT write admins/", asAnon.doc("admins/x").set({ email: "x@x" }), false);

    console.log("--- 6. Course Admin tier is independent of a legacy no-level admin ---");
    // An admin with no adminLevel is resolved by courseScope as "super if it holds
    // no course". The rules must NOT mirror that inference, or every legacy
    // course-less admin would gain every course. See adminController.js isExplicitSuperAdmin.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc("users/uid-legacy").set({ role: "admin", assignedCourses: [] });
    });
    const asLegacy = testEnv.authenticatedContext("uid-legacy").firestore();
    await check("legacy no-level, no-course admin CANNOT write admins/", asLegacy.doc("admins/x").set({ email: "x@x" }), false);
    await check("legacy no-level, no-course admin CANNOT set adminLevel", asLegacy.doc("users/uid-legacy").set({ adminLevel: "super" }), false);

    console.log("--- 7. course-scoped READS: incidents / maintenance ---");
    await check("super admin CAN read any course's incident", asSuper.doc("incidents/inc-mt").get(), true);
    await check("course admin CAN read its OWN course's incident", asCourseCT.doc("incidents/inc-ct").get(), true);
    await check("course admin CANNOT read another course's incident", asCourseCT.doc("incidents/inc-mt").get(), false);
    await check("course admin CAN read its OWN maintenance", asCourseCT.doc("maintenance/mnt-ct").get(), true);
    await check("course admin CANNOT read another course's maintenance", asCourseCT.doc("maintenance/mnt-mt").get(), false);
    // Deliberately NOT tightened. `allow create` stays open to any signed-in user
    // because students are the ones filing incidents, and cutting their read access
    // without a product decision risks breaking that workflow. Whether a student
    // should see every incident in the building is an OPEN question, tracked
    // separately -- not something to change quietly inside a security fix.
    // CHANGED. This previously asserted a student CAN read every incident, which was
    // the open gap the rules fix closed: `allow read: if request.auth != null` let any
    // signed-in student enumerate the whole collection, including other students'
    // reporter_name, reporter_school_id and reporter_course. Students keep their own
    // reports through the REST /api/incidents/mine endpoint, which is how the app
    // reads them -- no frontend code imports the Firestore SDK.
    await check("a STUDENT cannot list incidents", asStudent.collection("incidents").get(), false);
    await check("a STUDENT cannot read another student's incident",
      asStudent.doc("incidents/inc-ct").get(), false);
    await check("a STUDENT can read their OWN incident",
      asStudent.doc("incidents/inc-mt").get(), true);
    await check("a STUDENT cannot forge an incident attributed to someone else",
      asStudent.doc("incidents/forged").set({ reporter_course: "CT", reported_by: OTHER_STUDENT }), false);
    await check("a STUDENT cannot delete an incident", asStudent.doc("incidents/inc-ct").delete(), false);

    console.log("--- 8. course-scoped READS: transactions (borrower OR equipment) ---");
    await check("course admin CAN read a loan by its own students", asCourseCT.doc("transactions/txn-ct-borrower").get(), true);
    await check("course admin CAN read a loan of ITS OWN equipment", asCourseCT.doc("transactions/txn-mt-borrower-ct-kit").get(), true);
    await check("course admin CANNOT read a wholly other-course loan", asCourseCT.doc("transactions/txn-mt-borrower-mt-kit").get(), false);
    await check("super admin CAN read every loan", asSuper.doc("transactions/txn-mt-borrower-mt-kit").get(), true);

    console.log("--- 9. course-scoped READS: lab rooms ---");
    await check("course admin CAN read its OWN room", asCourseCT.doc("labRooms/room-ct").get(), true);
    await check("course admin CANNOT read another course's room", asCourseCT.doc("labRooms/room-mt").get(), false);
    await check("course admin CANNOT read an UNASSIGNED room", asCourseCT.doc("labRooms/room-unassigned").get(), false);
    await check("super admin CAN read an unassigned room", asSuper.doc("labRooms/room-unassigned").get(), true);

    console.log("--- 10. course-less admins are NOT given every course ---");
    // The point of the whole exercise. courseScope.isSuperAdmin() infers super for a
    // no-level, course-less admin (legacy behaviour), but the rules must not, or a
    // stray profile becomes an unrestricted reader the moment it is used directly.
    // Section 10's subject changed when isScopedAdmin() replaced isCourseAdmin(): a
    // PRE-MIGRATION admin (no adminLevel, but holding courses) is now scoped too.
    // Only the no-level AND no-course shape -- which courseScope calls super -- stays
    // on the unrestricted branch, and no current account has that shape.
    await check("legacy no-level admin WITH courses is now scoped", asNoLevel.doc("incidents/inc-ct").get(), false);
    await check("  but still reads its own course", asNoLevel.doc("incidents/inc-mt").get(), true);
    await check("OPEN GAP: no-level AND no-course admin remains unrestricted", asNoCourses.doc("incidents/inc-ct").get(), true);

    console.log("--- 11. list queries are scoped, not just single reads ---");
    // A rule that only guards `get` but leaves `list` open lets a caller enumerate
    // everything, so list is asserted separately.
    //
    // THE REAL BEHAVIOUR, which is not what the first draft of this test assumed.
    // A `list` rule that depends on resource.data cannot be proven to hold for an
    // UNFILTERED query, so Firestore refuses the whole query rather than filtering
    // it row by row. That refusal is the secure outcome: a Course Admin cannot
    // enumerate the collection at all through a direct client. To read their own
    // rows they must constrain the query by course, which does pass. No application
    // code takes this path -- the frontend imports no Firestore SDK -- so this is
    // defence in depth for a direct client only.
    await check("course admin CANNOT run an UNFILTERED incident list", asCourseCT.collection("incidents").get(), false);
    await check("course admin CANNOT run an UNFILTERED transaction list", asCourseCT.collection("transactions").get(), false);
    await check("course admin CANNOT run an UNFILTERED room list", asCourseCT.collection("labRooms").get(), false);
    await checkValue("course admin CAN list its OWN course when it filters by it",
      asCourseCT.collection("incidents").where("reporter_course", "==", "CT").get().then(s => s.docs.map(d => d.id)),
      ["inc-ct"]);
    await check("  but filtering by ANOTHER course is still refused",
      asCourseCT.collection("incidents").where("reporter_course", "==", "MT").get(), false);
    await checkValue("super admin's unfiltered incident list returns everything",
      asSuper.collection("incidents").get().then(s => s.docs.map(d => d.id).sort()), ["inc-ct", "inc-mt"]);

    console.log("--- 12. catalog is course-scoped for ADMINS, open to students ---");
    await check("super admin CAN read any course's catalog item", asSuper.doc("catalog/item-mt").get(), true);
    await check("course admin CAN read its OWN course's item", asCourseCT.doc("catalog/item-ct").get(), true);
    await check("course admin CANNOT read another course's item", asCourseCT.doc("catalog/item-mt").get(), false);
    await check("course admin CANNOT read a NULL-course item", asCourseCT.doc("catalog/item-nocourse").get(), false);
    await check("super admin CAN read a NULL-course item", asSuper.doc("catalog/item-nocourse").get(), true);
    // Students browse the catalog to find borrowable equipment. This must not regress.
    await check("STUDENT CAN still read a catalog item (legitimate feature)", asStudent.doc("catalog/item-ct").get(), true);
    await check("STUDENT CAN still read a NULL-course catalog item", asStudent.doc("catalog/item-nocourse").get(), true);
    await check("anon CANNOT read the catalog", asAnon.doc("catalog/item-ct").get(), false);

    console.log("--- 13. isScopedAdmin(): legacy admins are now scoped too ---");
    // The gap this closes: a pre-migration admin has no adminLevel, so the old
    // isCourseAdmin() left it on the unrestricted branch.
    await check("legacy no-level admin with courses is NOT unrestricted", asNoLevel.doc("catalog/item-ct").get(), false);
    await check("  it can read its OWN course", asNoLevel.doc("catalog/item-mt").get(), true);
    await check("legacy no-level admin is scoped on labRooms too", asNoLevel.doc("labRooms/room-ct").get(), false);
    await check("legacy multi-course admin honours EVERY listed course (CT)", asMulti.doc("catalog/item-ct").get(), true);
    await check("legacy multi-course admin honours EVERY listed course (MT)", asMulti.doc("catalog/item-mt").get(), true);

    console.log("--- 14. invalid or missing course assignments must not widen access ---");
    await check("a MISSPELLED course code cannot read any real course", asBadCode.doc("catalog/item-ct").get(), false);
    await check("  and cannot read a NULL-course item either", asBadCode.doc("catalog/item-nocourse").get(), false);
    await check("an EMPTY course list is fail-closed, not unrestricted", asEmptyList.doc("catalog/item-ct").get(), false);
    await check("  and on incidents too", asEmptyList.doc("incidents/inc-ct").get(), false);
    // Documented residual gap: NO adminLevel AND no courses. courseScope calls that
    // super; the rules cannot. Asserted so it is never forgotten.
    await check("OPEN GAP: no-level + no-course admin is still unrestricted", asNoCourses.doc("catalog/item-ct").get(), true);
  } catch (err) {
    failures += 1;
    console.log(`FAIL  suite aborted: ${err.message}`);
  } finally {
    await testEnv.cleanup();
  }

  console.log("");
  if (failures) {
    console.log(`${failures} FAILED, ${passes} passed`);
    process.exit(1);
  }
  console.log(`firestore.rules: all ${passes} checks passed`);
})().catch((err) => {
  console.error("firestoreRules suite crashed:", err.message);
  process.exit(1);
});