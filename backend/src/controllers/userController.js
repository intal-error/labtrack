const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { scopeCodes } = require("../middleware/courseScope");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");

const USERS = "users";

// Firestore's hard limit on `in`. See the same constant in
// transactionController.js. Only a legacy admin with more than 30 assigned
// courses can reach it, which is why this is chunked rather than refused.
const FIRESTORE_IN_CHUNK = 30;

/**
 * Paginated student roster for a course.
 *
 * WHY FIRESTORE AND NOT POSTGRES: student profiles are the one dataset that has
 * never lived in Supabase. `users/{uid}` is authoritative for identity, and
 * duplicating it into a second store to make a query easier would create two
 * sources of truth for school_id / course / year.
 *
 * WHY NO orderBy: Firestore would need a composite index on
 * (role, course, <sort field>) for an ordered paginated query, and every such
 * index is one more thing to create in the console before this endpoint works.
 * The window is therefore read with a bounded limit and sorted in JS. That is the
 * right trade for a per-course roster of hundreds; it is the wrong one for a
 * whole-school list of tens of thousands, which is why the Super Admin path
 * requires an explicit course filter rather than defaulting to everyone.
 */
const listStudents = async (req, res) => {
  try {
    const { page, limit, paginate } = parsePagination(req);
    const codes = scopeCodes(req);

    // ?course= narrows the SUPER ADMIN's view. For a Course Admin it is ignored
    // rather than honoured, because honouring it would let them request another
    // course and receive an empty list that looks like a bug -- or, worse, receive
    // data if the scope were ever removed.
    const requestedCourse = (req.query.course || "").trim();

    let courses;
    if (codes === null) {
      courses = requestedCourse ? [requestedCourse] : null;
    } else if (codes.length === 0) {
      // Fail closed: an admin with no course is not an error, it is an empty
      // roster. Returned as a paginated envelope when the caller paginated, and as
      // a bare empty array otherwise, so both shapes match the normal path.
      if (paginate) return res.json(paginatedResponse([], 0, page, limit));
      return res.json([]);
    } else {
      courses = codes;
    }

    const base = db.collection(USERS).where("role", "==", "student");
    const queries =
      courses === null
        ? [base]
        : courses.length <= FIRESTORE_IN_CHUNK
          ? [base.where("course", "in", courses)]
          : chunk(courses, FIRESTORE_IN_CHUNK).map((part) => base.where("course", "in", part));

    // Firestore caps `in` at 30 values, and a legacy admin can hold more than that
    // across assignedCourses. The chunks are DISJOINT (a student has exactly one
    // `course` string), so merging them and summing the counts is exact rather
    // than a de-duplication that has to happen afterwards.
    const [counted, docs] = await Promise.all([
      Promise.all(queries.map((q) => q.count().get())),
      Promise.all(queries.map((q) => q.get())),
    ]);
    const total = counted.reduce((sum, r) => sum + (r.data().count || 0), 0);

    const merged = docs.flatMap((snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));

    const search = (req.query.search || "").trim().toLowerCase();
    let matched = search
      ? merged.filter((u) =>
          `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase().includes(search) ||
          (u.schoolId || "").toLowerCase().includes(search)
        )
      : merged;

    // Firestore's document order is stable for a given set of keys but arbitrary
    // by name, so the sort happens here and the page slice is taken from it. With
    // no orderBy the window is read wide enough to cover the requested page.
    matched.sort((a, b) =>
      `${a.firstName || ""} ${a.lastName || ""}`.localeCompare(`${b.firstName || ""} ${b.lastName || ""}`)
    );

    const pageRows = paginate
      ? matched.slice((page - 1) * limit, page * limit)
      : matched;

    const counts = await borrowCounts(pageRows);
    const rows = pageRows.map((r) => transformStudent(r, counts));

    // Bare array when the caller asked for no pagination, matching every other
    // endpoint in this codebase. paginatedResponse() with a null page/limit would
    // otherwise emit totalPages: NaN, because Math.ceil(total / null) is NaN.
    if (!paginate) return res.json(rows);

    res.json(paginatedResponse(rows, search ? matched.length : total, page, limit));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Open and settled borrow counts for one page of students.
 *
 * ONE query for the whole page, keyed on user_id, because the alternative is a
 * round trip per student -- and this endpoint is paginated precisely so that a
 * course with thousands of students never asks for all of them at once. Counts
 * are still school-wide per student: a student's loan history is theirs, and
 * slicing it by the reading admin's course would under-report what they owe.
 */
async function borrowCounts(rows) {
  const ids = rows.map((r) => r.id).filter(Boolean);
  if (ids.length === 0) return new Map();
  if (ids.length > FIRESTORE_IN_CHUNK * 10) return new Map();

  const { data, error } = await supabase
    .from("transactions")
    .select("user_id, action, status")
    .in("user_id", ids);
  if (error) return new Map();

  const counts = new Map(ids.map((id) => [id, { open: 0, returned: 0 }]));
  for (const row of data || []) {
    const entry = counts.get(row.user_id);
    if (!entry) continue;
    if (row.action === "borrowed" && row.status === "borrowed") entry.open += 1;
    else if (row.action === "returned") entry.returned += 1;
  }
  return counts;
}

function transformStudent(row, counts) {
  const c = counts.get(row.id) || { open: 0, returned: 0 };
  return {
    id: row.id,
    firstName: row.firstName || "",
    lastName: row.lastName || "",
    schoolId: row.schoolId || row.employeeId || row.schoolID || row.studentID || "",
    course: row.course || "",
    year: row.year || "",
    section: row.section || "",
    email: row.email || "",
    contact: row.contact || "",
    status: row.status || "active",
    profileURL: row.profileURL || "",
    openBorrows: c.open,
    totalReturns: c.returned,
  };
}

// Mirrors the browser-side BorrowerLookup that this replaced.
//
// The old client loop tried, in order: the code as a document id, then equality
// against each of schoolId / employeeId / schoolID / studentID / barcode / qrCode,
// for up to two sanitised variants of the payload. That is up to thirteen
// Firestore round trips from the browser, and it only worked because the client
// shipped the Firestore SDK (215 kB of the entry chunk).
//
// Everything arrives here in one request as comma-separated candidate lists, so
// the worst case is one sequential pass of indexed lookups instead, and the
// Firestore SDK is off the client entirely.
//
// Deliberately NOT authorize("admin"): a student scans their own ID at the
// scanner, so this is any-signed-in-user. It reveals only the caller's own
// document, and only for code-derived lookups.
const resolveCode = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code || typeof code !== "string") {
      return res.status(400).json({ error: "code is required" });
    }

    // WHY THE PROJECTION BELOW IS LOAD-BEARING.
    //
    // This handler used to answer with the whole user document. That turned a lookup
    // endpoint into a profile oracle: FIELDS below tries schoolId / employeeId / studentID
    // / barcode / qrCode, so anyone who could guess an ID got back email, course, year,
    // section and everything else on the profile. Paired with an attendance endpoint
    // that took its subject from the request body, that made forged attendance a
    // two-request sequence.
    //
    // The equipment scanner (components/scanner/BorrowerLookup) only ever reads a name to
    // put on the borrow form, so that is all that is returned. Nothing else about the
    // person -- and no document data -- leaves this endpoint.
    const project = (id, data) => ({
      user: {
        id,
        firstName: data.firstName || "",
        lastName: data.lastName || "",
      },
    });

    const split = (value) =>
      typeof value === "string" ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];

    const docIds = split(req.query.ids);
    const fieldCandidates = split(req.query.candidates);

    if (docIds.length === 0 && fieldCandidates.length === 0) {
      return res.status(400).json({ error: "no lookup candidates" });
    }

    // 1. Document-id match. Our own generated codes land here, so it goes first.
    for (const id of docIds) {
      if (!canUseAsDocId(id)) continue;
      const snap = await db.collection(USERS).doc(id).get();
      if (snap.exists) return res.json(project(snap.id, snap.data()));
    }

    // 2. Field equality. Firestore serves these from its automatic indexes, and
    //    they run concurrently because none depends on another.
    const FIELDS = ["schoolId", "employeeId", "schoolID", "studentID", "barcode", "qrCode"];
    const lookups = [];
    for (const field of FIELDS) {
      for (const candidate of fieldCandidates) {
        lookups.push(
          db.collection(USERS).where(field, "==", candidate).limit(1).get()
            .then((snap) => ({ snap, field, candidate }))
            .catch((err) => {
              // One unavailable field must not abandon the whole lookup -- the old
              // client caught per-field for exactly this reason.
              console.warn(`resolveCode: query on field "${field}" failed:`, err.message);
              return null;
            })
        );
      }
    }

    const results = (await Promise.all(lookups)).filter(Boolean);
    const hit = results.find((r) => !r.snap.empty);
    if (hit) {
      const doc = hit.snap.docs[0];
      return res.json(project(doc.id, doc.data()));
    }

    res.json({ user: null });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Same validation the client applied before calling canUseAsDocId.
function canUseAsDocId(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 128 && !/[/\\]/.test(value);
}

const search = async (req, res) => {
  try {
    const { firstName, lastName } = req.query;
    if (!firstName || !lastName) return res.status(400).json({ error: "firstName and lastName required" });

    const queryFirst = firstName.trim().toLowerCase();
    const queryLast = lastName.trim().toLowerCase();

    // Use Firestore prefix range query instead of loading all users
    const firstSnap = await db
      .collection(USERS)
      .where("firstName", ">=", queryFirst)
      .where("firstName", "<=", queryFirst + "\uf8ff")
      .limit(20)
      .get();

    // Filter by lastName from the small result set
    const matched = firstSnap.docs.filter((doc) => {
      const u = doc.data();
      return String(u.lastName || "").toLowerCase().includes(queryLast);
    });

    if (matched.length === 0) return res.status(404).json({ error: "No person found" });

    const userDoc = matched[0];
    const u = userDoc.data();

    const [borrowedResult, returnedResult] = await Promise.all([
      supabase.from("transactions").select("*").eq("user_id", userDoc.id).eq("action", "borrowed"),
      supabase.from("transactions").select("*").eq("user_id", userDoc.id).eq("action", "returned"),
    ]);

    const borrowed = (borrowedResult.data || []).filter((d) => d.status === "borrowed");
    const returned = (returnedResult.data || []).filter((d) => d.status === "returned");

    res.json({
      user: { id: userDoc.id, ...u },
      borrowed,
      returned,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

// Exports sit at the END of the file. They were previously on top, which reads
// fine until a new handler is added above `search`/`resolveCode` -- both are
// `const`, so referencing them from a `module.exports` that runs first throws a
// temporal-dead-zone ReferenceError at require time rather than at call time.
module.exports = { search, resolveCode, listStudents };
