const { db, auth } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { invalidateAdminsCache } = require("../utils/adminScope");

const ADMIN_COLLECTIONS = ["admins"];

/**
 * Guards on the Super Admin account itself.
 *
 * WHY "adminLevel === super" AND NOT isSuperAdmin(): a legacy admin with no
 * adminLevel must NOT be treated as one. courseScope.js used to infer exactly that --
 * no adminLevel and no courses read as unrestricted -- and deliberately stopped,
 * because an empty record then meant maximum privilege by accident rather than by
 * appointment, and `scopeCodes() === null` is the widest grant in the codebase. So the
 * freeze on the Super Admin account is tied to the EXPLICIT appointment alone, which is
 * both safer and stricter than the inference it replaced.
 */
const isExplicitSuperAdmin = (profile) => profile?.adminLevel === "super";

/**
 * Applies an account's activation state to BOTH stores, or to neither.
 *
 * Deactivation writes two things that must agree: `disabled` on the Firebase Auth
 * record, and `status` on the Firestore profile. They are separate services, so one
 * can succeed while the other fails, and each half-failed state is dangerous in its own
 * direction:
 *
 *   Auth written, Firestore failed -> the account cannot sign in, while the roster
 *     still lists it Active. The Super Admin believes a working admin exists and no
 *     one does. This is a permanent lockout that only CLI access can undo.
 *
 *   Firestore written, Auth failed -> the roster says Inactive, so it looks handled,
 *     while the account signs in and walks straight through every admin route. That is
 *     exactly the failure this whole path exists to close.
 *
 * So the order is Auth FIRST, and a Firestore failure rolls the Auth write back rather
 * than leaving the pair split. The endpoint reports the failure instead of a cheerful
 * 200, because a caller told "Admin inactive" when nothing happened will never retry.
 *
 * The Firestore `status` field alone would still be enough to gate access --
 * middleware/auth.js reads it on every request and fails closed -- so the Auth mirror is
 * belt-and-braces rather than load-bearing. It is kept because it is what actually
 * stops the account at the front door, and because an account that can still mint a
 * fresh token is an account a stolen credential can use indefinitely.
 */
const setAccountActive = async (uid, active) => {
  try {
    await auth.updateUser(uid, { disabled: !active });
    return true;
  } catch (err) {
    console.error(`Could not ${active ? "enable" : "disable"} the Auth record for ${uid}:`, err.message);
    return false;
  }
};

/** Undo an Auth write when the Firestore half of the pair fails. */
const rollbackAuth = async (uid, wasActive) => {
  try {
    await auth.updateUser(uid, { disabled: !wasActive });
    return true;
  } catch (err) {
    // Loud, because this is the one failure an operator must chase by hand.
    console.error(
      `ROLLBACK FAILED for ${uid}: could not restore the Auth record to ${wasActive ? "enabled" : "disabled"}. ` +
      "The account's Firestore status and its Auth record now disagree. Repair with " +
      "backend/scripts/set-super-admin.js or the Firebase console.",
      err.message,
    );
    return false;
  }
};

/** Writes `status` to the authoritative row and every legacy mirror that exists. */
const writeAccountStatus = async (uid, status) => {
  await db.collection("users").doc(uid).set({ status, updatedAt: new Date() }, { merge: true });
  for (const coll of ADMIN_COLLECTIONS) {
    const docRef = db.collection(coll).doc(uid);
    const doc = await docRef.get();
    if (doc.exists) await docRef.set({ status }, { merge: true });
  }
};

const readProfile = async (uid) => {
  const doc = await db.collection("users").doc(uid).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
};

/** True when the given course id is a real row in `courses`. */
const courseExists = async (courseId) => {
  const { data, error } = await supabase.from("courses").select("id").eq("id", courseId).limit(1);
  if (error) throw new Error(error.message);
  return Boolean(data && data.length > 0);
};

const getAll = async (req, res) => {
  try {
    // Only an EXPLICIT Super Admin enumerates the roster. It exposes every other
    // admin's name, email and contact number, and a Course Admin already has
    // GET /api/auth/profile for their own account.
    //
    // This used to test `adminLevel === "course"` and let everything else fall
    // through, which meant any admin whose record lacked an adminLevel -- a
    // pre-migration admin, or one whose course had been cleared -- was handed the
    // entire roster. That is the fail-open direction, and it is the one courseScope.js
    // spent a migration removing everywhere else. Testing for the exemption rather
    // than the permission is what produced it, so it is now `isExplicitSuperAdmin`.
    if (!isExplicitSuperAdmin(req.profile)) {
      const own = await readProfile(req.user.uid);
      return res.json(own ? [own] : []);
    }

    const admins = [];
    // Read from users collection where role=admin
    const usersSnap = await db.collection("users").where("role", "==", "admin").get();
    usersSnap.forEach((doc) => admins.push({ id: doc.id, ...doc.data() }));

    // Also include any admins only in the admins collection (legacy)
    const adminsSnap = await db.collection("admins").get();
    adminsSnap.forEach((doc) => {
      if (!admins.find((a) => a.id === doc.id)) {
        admins.push({ id: doc.id, collection: "admins", ...doc.data() });
      }
    });

    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getActiveAdmins = async (req, res) => {
  try {
    // Same fail-closed rule as getAll, for the same reason: this feeds the incident
    // and borrow-request reassignment pickers, so an over-wide read here is an
    // over-wide list of who can be handed another admin's work.
    if (!isExplicitSuperAdmin(req.profile)) {
      const own = await readProfile(req.user.uid);
      return res.json(own && (own.status || "active") === "active" ? [own] : []);
    }

    const snap = await db.collection("users").where("role", "==", "admin").get();
    const admins = snap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((a) => (a.status || "active") === "active");
    res.json(admins);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { firstName, lastName, email, password, contact, position, courseId, adminLevel } = req.body;
    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({ error: "Required fields missing" });
    }

    // Rejected explicitly rather than ignored. adminController is not the only
    // caller-facing path to these fields, and an ignored adminLevel would let a
    // future caller believe it had created a Super Admin when it had not.
    if (adminLevel === "super") {
      return res.status(400).json({
        error: "A Super Admin cannot be created through the app. Run backend/scripts/set-super-admin.js to appoint one.",
      });
    }

    // The zod schema defaults this, so an absent value means "Course Admin"
    // rather than an ambiguous unassigned account. Only an explicit unknown tier
    // is refused.
    if (adminLevel !== "course") {
      return res.status(400).json({ error: `Unknown admin level "${adminLevel}"` });
    }

    if (!courseId) {
      return res.status(400).json({ error: "A Course Admin must be assigned a course" });
    }
    if (!(await courseExists(courseId))) {
      return res.status(400).json({ error: `Unknown course "${courseId}"` });
    }

    const userRecord = await auth.createUser({ email, password, displayName: `${firstName} ${lastName}` });

    // Set custom claims so authorize() middleware works. Deliberately still just
    // { role } -- adminLevel and courseId are NOT claims. They are read from the
    // Firestore profile on every request instead, so changing an admin's course
    // takes effect immediately rather than at token expiry.
    await auth.setCustomUserClaims(userRecord.uid, { role: "admin" });

    const adminData = {
      firstName,
      lastName,
      email,
      contact: contact || "",
      position: position || "",
      role: "admin",
      adminLevel: "course",
      courseId,
      // Legacy course-assignment fields are written empty rather than omitted, so
      // courseScope.js resolves this account from courseId alone and never from
      // the old inference.
      assignedCourse: "",
      assignedCourses: [],
      assignedYear: "",
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in users collection so AuthContext can read the role
    await db.collection("users").doc(userRecord.uid).set(adminData);

    // Also store in admins collection for backward compatibility. It must carry
    // adminLevel/courseId too: middleware/auth.js resolveProfile falls back to
    // this collection, and a row found there without them reads as a legacy
    // unrestricted admin.
    await db.collection("admins").doc(userRecord.uid).set({
      firstName: firstName,
      lastName: lastName,
      contact: contact || "",
      position: position || "",
      email,
      role: "admin",
      adminLevel: "course",
      courseId,
      assignedCourse: "",
      assignedCourses: [],
      assignedYear: "",
      status: "active",
      createdAt: new Date(),
    });

    invalidateAdminsCache();

    res.status(201).json({ id: userRecord.uid, message: "Course Admin created", courseId, adminLevel: "course" });
  } catch (err) {
    if (err.code === "auth/email-already-in-use") {
      return res.status(409).json({ error: "Email already registered" });
    }
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;

    const isSelf = req.user.uid === id;
    const callerIsSuper = req.profile?.adminLevel === "super";

    // Self-service, or the Super Admin acting on the roster. This used to be
    // `uid !== id` alone, which meant the Super Admin could edit nobody but
    // themselves -- so reassigning a Course Admin to another course, the one
    // admin operation only they may perform, was unreachable from the UI.
    if (!isSelf && !callerIsSuper) {
      return res.status(403).json({ error: "You can only edit your own account" });
    }

    const target = await readProfile(id);
    if (!target) return res.status(404).json({ error: "Admin not found" });

    const { firstName, lastName, contact, position, password, courseId } = req.body;

    // adminLevel is never written by this endpoint, in either direction, so the
    // only thing to do with it is refuse it. A Course Admin must not be able to
    // promote themselves, and nothing reachable from the UI may demote the Super
    // Admin to a Course Admin -- the script that appointed them is the only place
    // that tier changes.
    if (req.body.adminLevel !== undefined && req.body.adminLevel !== "course") {
      return res.status(400).json({
        error: "Admin level cannot be changed here. Run backend/scripts/set-super-admin.js to appoint a Super Admin.",
      });
    }

    if (courseId !== undefined) {
      // The Super Admin's whole value is that they are not scoped to a course, so
      // assigning one to them is meaningless and reassigning them is not an edit.
      if (isExplicitSuperAdmin(target)) {
        return res.status(403).json({ error: "The Super Admin account cannot be reassigned to a course" });
      }
      if (!callerIsSuper) {
        return res.status(403).json({ error: "Only the Super Admin can reassign an admin to a different course" });
      }
      if (courseId && !(await courseExists(courseId))) {
        return res.status(400).json({ error: `Unknown course "${courseId}"` });
      }
    }

    // Validate password BEFORE any Firestore writes
    if (password) {
      if (password.length < 8) {
        return res.status(400).json({ error: "Password must be at least 8 characters" });
      }
      if (!/[A-Z]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one uppercase letter" });
      }
      if (!/[a-z]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one lowercase letter" });
      }
      if (!/[0-9]/.test(password)) {
        return res.status(400).json({ error: "Password must contain at least one number" });
      }
      try {
        await auth.updateUser(id, { password });
      } catch (e) {
        console.warn("Could not update auth password:", e.message);
      }
    }

    // Only fields the caller actually sent. Firestore rejects an explicit
    // undefined under merge, and writing firstName/lastName unconditionally
    // turned a courseId-only request into a name wipe.
    const updates = { updatedAt: new Date() };
    if (firstName !== undefined) updates.firstName = firstName;
    if (lastName !== undefined) updates.lastName = lastName;
    if (contact !== undefined) updates.contact = contact;
    if (position !== undefined) updates.position = position;

    if (courseId !== undefined) {
      // An admin clearing their own course is allowed (it is a self-edit), but
      // the account then sees nothing at all, which courseScope treats as
      // fail-closed rather than unrestricted. Preserved rather than blocked: the
      // alternative is an admin permanently unable to fix their own profile.
      const nextCourseId = courseId || "";
      updates.courseId = nextCourseId;
      updates.assignedCourse = nextCourseId;
      updates.assignedCourses = nextCourseId ? [nextCourseId] : [];
    }

    await db.collection("users").doc(id).set(updates, { merge: true });

    // Also update in admins collection (legacy)
    for (const coll of ADMIN_COLLECTIONS) {
      const docRef = db.collection(coll).doc(id);
      const doc = await docRef.get();
      if (doc.exists) {
        await docRef.set(updates, { merge: true });
        break;
      }
    }

    // The course roster is memoised for a minute; a reassignment has to be
    // visible immediately or the old course's admin keeps routing work here.
    invalidateAdminsCache();

res.json({ message: "Admin updated", courseId: target.courseId ?? null });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const toggleStatus = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.uid === id) {
      return res.status(400).json({ error: "Cannot deactivate your own account" });
    }

    const current = await readProfile(id);
    if (!current) return res.status(404).json({ error: "Admin not found" });

    // Deactivating the Super Admin would leave nobody able to create or reassign
    // a Course Admin, which is unrecoverable without CLI access.
    if (isExplicitSuperAdmin(current)) {
      return res.status(403).json({ error: "The Super Admin account cannot be deactivated" });
    }

    // Reassignment is the only way a Course Admin changes course, so it is the
    // only admin mutation another admin may perform.
    if (!isExplicitSuperAdmin(req.profile)) {
      return res.status(403).json({ error: "Only the Super Admin can manage other admins" });
    }

    const wasActive = (current.status || "active") === "active";
    const newStatus = wasActive ? "inactive" : "active";

    if (wasActive) {
      // The last-active-admin guard only ever bites on the way DOWN. On the way up it
      // is skipped, which is what makes this endpoint usable for recovering an account
      // in either direction.
      const activeAdminsSnap = await db.collection("users")
        .where("role", "==", "admin")
        .where("status", "==", "active")
        .get();
      if (activeAdminsSnap.size <= 1) {
        return res.status(400).json({ error: "Cannot deactivate the last active admin" });
      }
    }

    // Auth first, Firestore second, roll the Auth write back if Firestore fails. See
    // setAccountActive for why that order and that rollback, and why the alternative
    // -- mark them inactive, report success, hope the Auth write landed -- is the one
    // outcome that must never happen.
    if (!(await setAccountActive(id, newStatus === "active"))) {
      return res.status(502).json({
        error: `Could not ${newStatus === "active" ? "reactivate" : "deactivate"} this account: the Firebase Authentication update failed. Nothing was changed, so it still has the access it had before.`,
      });
    }

    try {
      await writeAccountStatus(id, newStatus);
    } catch (err) {
      // Logged before the rollback so the cause is recoverable even if the rollback
      // itself succeeds -- the operator otherwise sees a clean 500 and a healthy pair,
      // with no sign either write ever happened.
      console.error(`Could not persist the account status for ${id}:`, err.message);
      const restored = await rollbackAuth(id, wasActive);
      return res.status(500).json({
        error: restored
          ? "Could not save the account status, and the authentication change was rolled back. Nothing was changed -- please try again."
          : "Could not save the account status AND the authentication change could not be rolled back. This account's two records now disagree; see the server log. Do not retry blindly.",
      });
    }

    invalidateAdminsCache();

    res.json({ message: `Admin ${newStatus}`, status: newStatus });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/**
 * DELETE /api/admin/:id -- deactivate and revoke, WITHOUT destroying the record.
 *
 * It is called "delete" and it is not one, and that naming is the source of two of the
 * bugs adminLifecycle.verify.js exists to pin, so it is worth being explicit:
 *
 *   - The `users` and `admins` rows are deliberately KEPT. incidentController.js:548
 *     and borrowRequestController.js:498 look admins up by uid and read
 *     `status === "inactive"` to refuse handing them new work; deleting the row would
 *     turn that refusal into a crash and orphan the incident history behind it.
 *   - Because the rows survive, this and PUT /:id/toggle-status now produce the SAME
 *     end state: inactive, and unable to sign in. There used to be a difference, and it
 *     was the bug -- this endpoint disabled the Auth record and the toggle did not, so
 *     "Deactivate" revoked nothing, and "Delete" was irreversible by accident.
 *
 * Both paths go through setAccountActive(), so an account can be deactivated and then
 * reactivated through either endpoint.
 */
const remove = async (req, res) => {
  try {
    const { id } = req.params;

    if (req.user.uid === id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    const current = await readProfile(id);
    if (!current) return res.status(404).json({ error: "Admin not found" });

    if (isExplicitSuperAdmin(current)) {
      return res.status(403).json({ error: "The Super Admin account cannot be deleted" });
    }

    if (!isExplicitSuperAdmin(req.profile)) {
      return res.status(403).json({ error: "Only the Super Admin can manage other admins" });
    }

    const wasActive = (current.status || "active") === "active";

    if (wasActive) {
      const activeAdminsSnap = await db.collection("users")
        .where("role", "==", "admin")
        .where("status", "==", "active")
        .get();
      if (activeAdminsSnap.size <= 1) {
        return res.status(400).json({ error: "Cannot delete the last active admin" });
      }
    }

    // Same ordering and rollback contract as toggleStatus. This handler used to wrap
    // the Auth write in `try { ... } catch {}`, so a failed revocation still answered
    // 200 "Admin deactivated" for a deactivation that had not happened.
    if (!(await setAccountActive(id, false))) {
      return res.status(502).json({
        error: "Could not deactivate this account: the Firebase Authentication update failed. Nothing was changed, so it still has the access it had before.",
      });
    }

    try {
      await writeAccountStatus(id, "inactive");
    } catch (err) {
      console.error(`Could not persist the account status for ${id}:`, err.message);
      const restored = await rollbackAuth(id, wasActive);
      return res.status(500).json({
        error: restored
          ? "Could not save the account status, and the authentication change was rolled back. Nothing was changed -- please try again."
          : "Could not save the account status AND the authentication change could not be rolled back. This account's two records now disagree; see the server log. Do not retry blindly.",
      });
    }

    invalidateAdminsCache();
    res.json({ message: "Admin deactivated", status: "inactive" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getActiveAdmins, create, update, toggleStatus, remove };
