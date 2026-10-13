const { supabase } = require("../config/supabase");
const { db, FieldPath } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const { scopeCodes } = require("../middleware/courseScope");

// Firestore's hard cap on `in` queries; enrichFines chunks its reads to this.
const FIRESTORE_IN_CHUNK = 30;

/**
 * Which courses may see and act on this fine?
 *
 * A fine has two legitimate audiences, matching how transactions are already scoped:
 * `scopedAny(["course","equipment_course"])` treats "your student borrowed" OR "it is your
 * equipment" as in-scope. Fines need the same rule, or damage to a course's own equipment
 * would be invisible to the course that owns the item whenever the borrower is from
 * somewhere else -- the exact cross-course case the lab model is built around.
 *
 * Returns the set of courses that may view this fine. An EMPTY set means the fine's
 * owner cannot be established (no user profile, no transaction, neither carrying a
 * course). That case resolves to nobody, which fails CLOSED: such a fine stays visible to
 * the Super Admin only, exactly like a row whose course is the IMPOSSIBLE_COURSE sentinel.
 */
function fineCourseScope(fine) {
  return [fine.course, fine.equipmentCourse].filter((c) => c && String(c).trim());
}

/** True when this request may see the given enriched fine. */
function fineVisibleTo(req, fine) {
  const codes = scopeCodes(req);
  if (codes === null) return true; // Super Admin, or a non-admin (students use /my).
  const owned = fineCourseScope(fine);
  if (owned.length === 0) return false; // unresolvable -> Super Admin only
  return owned.some((c) => codes.includes(c));
}

/**
 * Whether this request may MODIFY the given fine.
 *
 * Same audience rule as reading, applied before any write. Without it a Course Admin
 * could pay or waive another course's fine simply by knowing its id, which needs no
 * privilege at all -- just an enumeration of /api/fines that used to return every course.
 */
function assertFineWritable(req, res, fine) {
  if (fineVisibleTo(req, fine)) return true;
  // 404 rather than 403: a 403 confirms the fine exists, leaking the thing the scope hides.
  res.status(404).json({ error: "Fine not found" });
  return false;
}

async function enrichFines(fines) {
  if (fines.length === 0) return [];

  const userIds = [...new Set(fines.map((f) => f.user_id).filter(Boolean))];
  const txIds = [...new Set(fines.map((f) => f.transaction_id).filter(Boolean))];

  // Batched into chunked `in` queries, and reading only the transaction columns that
  // are actually surfaced. It used to be one Firestore doc read per distinct student
  // and a select("*") on the transaction lookup; callers now paginate before
  // enriching, so N is the page size.
const [userSnaps, txResult] = await Promise.all([
    (async () => {
      const snaps = [];
      for (let i = 0; i < userIds.length; i += FIRESTORE_IN_CHUNK) {
        const chunk = userIds.slice(i, i + FIRESTORE_IN_CHUNK);
        if (chunk.length === 0) continue;
        snaps.push(
          await db.collection("users").where(FieldPath.documentId(), "in", chunk).get()
        );
      }
      return snaps.flatMap((s) => s.docs);
    })(),
    txIds.length > 0
      ? supabase
          .from("transactions")
          .select("id,due_date,borrowed_at,timestamp,returned_at,status,catalog_id,course,equipment_course,school_id,first_name,last_name")
          .in("id", txIds)
      : { data: [], error: null },
  ]);

  const userMap = {};
  userSnaps.forEach((snap) => {
    if (snap.exists) {
      const d = snap.data();
      userMap[snap.id] = {
        userName: `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || snap.id,
        schoolId: d.schoolId || d.schoolID || "",
        course: d.course || "",
        userRole: d.role || "",
      };
    }
  });

  const txMap = {};
  (txResult.data || []).forEach((tx) => {
    txMap[tx.id] = {
      dueDate: tx.due_date || null,
      borrowedAt: tx.borrowed_at || tx.timestamp || null,
      returnedAt: tx.returned_at || null,
      transactionStatus: tx.status || "",
      itemId: tx.catalog_id || "",
      course: tx.course || "",
      // The course that OWNS the equipment, which is not necessarily the borrower's.
// Carried separately rather than folded into `course`, because a fine has two
      // legitimate audiences and collapsing them picks a winner by accident. Note this
      // reads the RAW row (`equipment_course`); the fine mapping further down reads the
      // txMap entry, which is camelCase. The two spellings are not interchangeable.
      equipmentCourse: tx.equipment_course || "",
        schoolId: tx.school_id || "",
      borrowerName: `${tx.first_name || ""} ${tx.last_name || ""}`.trim() || "",
    };
  });

  return fines.map((f) => {
    const user = userMap[f.user_id] || {};
    const tx = txMap[f.transaction_id] || {};
    return {
      ...f,
      userName: user.userName || tx.borrowerName || f.user_id || "Unknown",
      schoolId: user.schoolId || tx.schoolId || "",
      course: user.course || tx.course || "",
      userRole: user.userRole || "",
      // The course that OWNS the equipment -- the transaction's equipment_course, and ONLY
// that. Falling back to the borrower's course here would be exactly the conflation this
// split exists to prevent: a BIT student damaging a CTV multimeter must not make the
// fine look CTV's just because the borrower happens to be in another course. With no
// equipment_course the field stays "" and only the borrower's course sees the fine.
equipmentCourse: tx.equipmentCourse || "",
      dueDate: tx.dueDate || null,
      borrowedAt: tx.borrowedAt || null,
      returnedAt: tx.returnedAt || null,
      transactionStatus: tx.transactionStatus || "",
      itemId: tx.itemId || "",
    };
  });
}

const getAllFines = async (req, res) => {
try {
    // Two different orderings, chosen by whether a JS-only filter is in play.
    //
    // NO JS-only filter (the common case): filter -> paginate -> enrich.
    //   `status` is the only predicate and it is indexed, so SQL can paginate, and
    //   enrichFines then costs one lookup for the 25 rows on screen instead of one
    //   per row in the table.
    //
    // WITH search or course: paginate -> enrich -> filter is IMPOSSIBLE, because the
    //   fields those filters match on do not exist until enrichment has run.
    //
    // The bug this replaces: the rescan branch re-queried unpaged, then sliced
    // (`fullRes.data.slice(...)`) BEFORE calling enrichFines/filter. So page 1 was
    // whatever 25 rows happened to sit at that offset in the UNFILTERED table -- if
    // the only "ana" rows were at offset 300, page 1 came back empty and the user
    // had to click through to page 13 to find them. `total` came from the same
    // unfiltered length, so the pager advertised those empty pages as real ones.
    // Filtering a slice is not filtering a result set.
    //
    // Cost note: the rescan branch must enrich every candidate row, which is why it
    // is gated on `search || course` rather than always taken. If this endpoint ever
    // outgrows that, the fix is denormalising userName/schoolId/course onto the fines
    // table so the filter becomes indexable -- not silently capping the scan, which
    // would truncate results and hide rows with no indication anything was missing.
    let query = supabase.from("fines").select("*", { count: "exact" });

    // `search` spans fields that only exist on the ENRICHED shape (userName,
    // schoolId come from Firestore; course from the user or their transaction). It
    // cannot be pushed down at all.
    const search = req.query.search ? String(req.query.search).toLowerCase() : "";
    const matchesSearch = (f) =>
      !search ||
      [f.userName, f.item_name, f.schoolId, f.transaction_id, f.first_name, f.last_name, f.course].some(
        (v) => v && String(v).toLowerCase().includes(search)
      );
    // course can only be compared AFTER enrichment, same reason as search.
    const wantedCourse = req.query.course && req.query.course !== "All" ? req.query.course : "";
    const matchesCourse = (f) => !wantedCourse || f.course === wantedCourse;

    if (req.query.status && req.query.status !== "All") {
      query = query.eq("status", req.query.status);
    }
    query = query.order("created_at", { ascending: false });

    const { paginate, page, limit } = parsePagination(req);

    // A Course Admin's scope is a JS-only predicate, and the single most important one:
    // fines has NO course column (ownership lives on the user and the transaction), so it
    // cannot be pushed into SQL at all. It therefore forces the rescan branch on EVERY
    // paginated request from a Course Admin, not just when a search term is present.
    const scopeCodesNow = scopeCodes(req);
    const mustRescanForScope = scopeCodesNow !== null;
    const needsRescan = (Boolean(search || wantedCourse) || mustRescanForScope) && paginate;

    // A JS-only filter has to be applied BEFORE we know which page we are on.
    // So when one is present, the SQL range is skipped entirely and the whole
    // candidate set is enriched and filtered first.
    if (!needsRescan && paginate) query = query.range((page - 1) * limit, page * limit);

    const { data: fines, error, count } = await query;
    if (error) throw new Error(error.message);

    let total = count || 0;

    // The JS-only filter ALWAYS runs, on every branch.
    //
    // It is tempting to push it inside the `needsRescan` branch, but that silently
    // drops search and course for unpaginated callers (exports, the admin overview),
    // which are then served the whole table regardless of the query string. The
    // predicate is a cheap array scan over the enriched rows, so it costs nothing
    // when search and course are empty -- matchesSearch returns true immediately.
    //
    // The SCOPE filter is different and must not be: it is authorization, not a filter.
    // Running it only in the rescan branch would hand an unpaginated caller -- the
    // export and the admin overview -- every course's fines.
    const matchesScope = (f) => fineVisibleTo(req, f);
    let enriched = (await enrichFines(fines || [])).filter(
      (f) => matchesSearch(f) && matchesCourse(f) && matchesScope(f)
    );

    if (paginate) {
      // Only the rescan branch needs to re-slice: it is the one where SQL did NOT
      // apply the range, so `enriched` is the entire filtered set rather than a page.
      if (needsRescan) {
        // `count` came from the un-enriched, unfiltered query, so it cannot know
        // about a search term, a course, or the caller's scope. Reporting it anyway made
        // the pager advertise pages that were empty -- and would have leaked the SIZE of
        // another course's fines to a Course Admin reading the total.
        total = enriched.length;
        enriched = enriched.slice((page - 1) * limit, page * limit);
      }
      // Otherwise SQL already ranged, so `enriched` IS the page and `count` is the
      // honest total for the status-only predicate.
      return res.json(paginatedResponse(transformKeys(enriched), total, page, limit));
    }

    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyFines = async (req, res) => {
  try {
    const uid = req.user.uid;

    const { data: fines, error } = await supabase
      .from("fines")
      .select("*")
      .eq("user_id", uid)
      .order("created_at", { ascending: false });

    if (error) throw error;

    let enriched = await enrichFines(fines || []);

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      enriched = enriched.filter(
        (f) =>
          (f.item_name && f.item_name.toLowerCase().includes(q)) ||
          (f.transaction_id && f.transaction_id.toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      enriched = enriched.filter((f) => f.status === req.query.status);
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      return res.json(paginatedResponse(transformKeys(enriched), enriched.length, page, limit));
    }

    res.json(transformKeys(enriched));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const checkRestriction = async (req, res) => {
  try {
    const { userId } = req.params;

    const { data: pendingFines, error: finesError } = await supabase
      .from("fines")
      .select("total_fine")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (finesError) throw finesError;

    let totalPending = 0;
    (pendingFines || []).forEach((fine) => {
      totalPending += Number(fine.total_fine) || 0;
    });

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("fine_restriction_threshold")
      .eq("id", "appSettings")
      .single();

    if (settingsError && settingsError.code !== "PGRST116") throw settingsError;
    const threshold = Number(settings?.fine_restriction_threshold) || 50;

    res.json({
      isRestricted: totalPending >= threshold,
      totalPending,
      threshold,
      pendingCount: (pendingFines || []).length,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getOverdueCount = async (req, res) => {
  try {
    const { data: borrowedTx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("action", "borrowed");

    if (error) throw error;

    const now = new Date();
    const overdueUserIds = new Set();

    (borrowedTx || []).forEach((tx) => {
      if (tx.status === "returned") return;
      const dueDate = tx.due_date ? new Date(tx.due_date) : null;
      if (dueDate && now > dueDate && tx.user_id) {
        overdueUserIds.add(tx.user_id);
      }
    });

    res.json({ overdueBorrowers: overdueUserIds.size });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const payFine = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: fine, error: fetchError } = await supabase
      .from("fines")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !fine) return res.status(404).json({ error: "Fine not found" });
    if (fine.status === "paid") return res.status(400).json({ error: "Fine already paid" });

    // Scope check BEFORE the write. This handler is mounted on authorize("admin") alone,
    // so without this any admin could settle any fine by id -- and /api/fines used to
    // return every course's fines, so the ids were freely enumerable. Enriching the one
    // row costs the same reads the list view already makes; it is not a new cost class.
    const [payTarget] = await enrichFines([fine]);
    if (!assertFineWritable(req, res, payTarget)) return;

    const { error } = await supabase
      .from("fines")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        paid_by: req.user.uid,
      })
      .eq("id", id);

    if (error) throw error;

    if (fine.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: fine.user_id,
        type: "success",
        title: "Fine Settled",
        message: `Your \u20b1${fine.total_fine} fine for "${fine.item_name}" has been marked as paid.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    res.json({ message: "Fine marked as paid" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const waiveFine = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ error: "Waiver reason is required" });
    }

    const { data: fine, error: fetchError } = await supabase
      .from("fines")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !fine) return res.status(404).json({ error: "Fine not found" });

    // Same guard as payFine: a waiver is a write against another course's record and must
    // not be reachable by id alone.
    const [waiveTarget] = await enrichFines([fine]);
    if (!assertFineWritable(req, res, waiveTarget)) return;

    const { error } = await supabase
      .from("fines")
      .update({
        status: "waived",
        waived_by: req.user.uid,
        waive_reason: reason.trim(),
        waived_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) throw error;

    if (fine.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: fine.user_id,
        type: "info",
        title: "Fine Waived",
        message: `Your fine for "${fine.item_name}" (\u20b1${fine.total_fine}) has been waived by the laboratory administrator.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    res.json({ message: "Fine waived" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createFineForOverdue = async (transactionId) => {
  try {
    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", transactionId)
      .single();

    if (txError || !tx) return;
    if (tx.action !== "borrowed") return;
    if (tx.status === "returned") return;

    const { data: existing } = await supabase
      .from("fines")
      .select("id")
      .eq("transaction_id", transactionId)
      .eq("status", "pending");

    if (existing && existing.length > 0) return;

    const dueDate = tx.due_date ? new Date(tx.due_date) : null;
    if (!dueDate) return;

    const now = new Date();
    if (now <= dueDate) return;

    const daysOverdue = Math.ceil((now - dueDate) / (1000 * 60 * 60 * 24));
    if (daysOverdue < 1) return;

    const { data: settings } = await supabase
      .from("settings")
      .select("fine_per_day")
      .eq("id", "appSettings")
      .single();

    const finePerDay = Number(settings?.fine_per_day) || 5;
    const totalFine = daysOverdue * finePerDay;

    await supabase.from("fines").insert({
      id: randomUUID(),
      user_id: tx.user_id || "",
      transaction_id: transactionId,
      item_name: tx.item_name || "Unknown Item",
      days_overdue: daysOverdue,
      fine_per_day: finePerDay,
      total_fine: totalFine,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (tx.user_id) {
      await supabase.from("notifications").insert({
        id: randomUUID(),
        target_user_id: tx.user_id,
        type: "warning",
        title: "Fine Issued",
        message: `A fine of \u20b1${totalFine} has been issued for "${tx.item_name}" (${daysOverdue} days overdue). Please return the item and settle the fine.`,
        read: false,
        dismissed_by: [],
        link: "/fines",
        created_at: new Date().toISOString(),
      });
    }

    console.log(`Fine created for transaction ${transactionId}: \u20b1${totalFine} (${daysOverdue} days overdue)`);
  } catch (err) {
    console.error(`Failed to create fine for transaction ${transactionId}:`, err.message);
  }
};

module.exports = { getAllFines, getMyFines, checkRestriction, getOverdueCount, payFine, waiveFine, createFineForOverdue };
