const { db } = require("../config/firebase");
const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const {
  getAdminCourses,
  isSuperAdmin,
  getTargetCourseAdmins,
  getActiveAdminsList,
  autoAssignAdmin,
  canHandleIncident,
  displayName,
  notify,
} = require("../utils/adminScope");

const TABLE = "incidents";
const EVENTS_TABLE = "incident_events";

/**
 * Incident reports: a student reports a damaged or lost borrowed item, it is
 * assigned to whoever handles their course, that handler reviews it, and the
 * student follows along.
 *
 *   pending ──> under_review ──> approved ──> resolved
 *      │             │                              ▲
 *      └──> rejected ┘  (rejected ──> under_review, reopened)
 *      └──> resolved
 *
 * Legal transitions only. Every one of them, every handler remark and every
 * reassignment is appended to incident_events, which is what the student reads
 * and what makes the case auditable. `incidents.status` stays the denormalised
 * current value so list queries do not have to aggregate.
 */
const INCIDENT_TRANSITIONS = {
  pending: ["under_review", "rejected", "resolved"],
  under_review: ["approved", "rejected", "resolved"],
  approved: ["resolved"],
  rejected: ["under_review"],
  resolved: [],
};

const OPEN_STATUSES = ["pending", "under_review"];

// Reports stay on a handler's queue while pending or under review; approved and
// rejected are verdicts, resolved is closed. Same shape as the borrowing queue,
// which only counts `pending` (see BORROW_WORKLOAD in borrowRequestController).
const INCIDENT_WORKLOAD = {
  table: TABLE,
  workloadColumn: "assigned_to",
  workloadStatuses: OPEN_STATUSES,
};

const ADMIN_LINK = "/incident-reports";
const STUDENT_LINK = "/my-activity?tab=incidents";

const TYPE_LABELS = {
  damage: "Damaged item",
  lost: "Lost item",
  malfunction: "Item malfunctioned",
  accident: "Accident",
  irregularity: "Irregularity",
  other: "Other",
};

function labelForStatus(status) {
  return (
    {
      pending: "Pending",
      under_review: "Under Review",
      approved: "Approved",
      rejected: "Rejected",
      resolved: "Resolved",
    }[status] || status
  );
}

/** Today as a plain calendar date. See the timezone note on the DATE columns. */
function todayISO() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

async function fetchIncident(id) {
  const { data, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
  if (error || !data) return null;
  return data;
}

async function fetchEvents(incidentIds) {
  if (incidentIds.length === 0) return new Map();
  const { data } = await supabase
    .from(EVENTS_TABLE)
    .select("*")
    .in("incident_id", incidentIds)
    .order("created_at", { ascending: true });
  const grouped = new Map();
  (data || []).forEach((event) => {
    const list = grouped.get(event.incident_id) || [];
    list.push(event);
    grouped.set(event.incident_id, list);
  });
  return grouped;
}

async function appendEvent(entry) {
  const { error } = await supabase.from(EVENTS_TABLE).insert({
    id: randomUUID(),
    incident_id: entry.incidentId,
    event_type: entry.eventType,
    from_status: entry.fromStatus || null,
    to_status: entry.toStatus || null,
    note: entry.note || null,
    actor_id: entry.actorId || null,
    actor_name: entry.actorName || null,
    actor_role: entry.actorRole || null,
    created_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

/** Course-scoped read for admins. Super-admins (no assignedCourses) see all. */
async function getAll(req, res) {
  try {
    if (req.user?.role !== "admin") {
      return res.status(403).json({ error: "Only course handlers can view all incident reports" });
    }

    // authorize("admin") already read this document to check the role and left it
    // on req.profile, so re-reading it here was a second Firestore round trip on
    // every list render. Falling back to {} keeps the pre-middleware behaviour
    // (fail closed) if this handler is ever called without the middleware.
    const reviewer = req.profile || {};

    let query = supabase.from(TABLE).select("*");

    if (!isSuperAdmin(reviewer)) {
      // Fail closed: an unscoped course handler gets nothing rather than
      // everything. Handlers are scoped, not merely deprioritised.
      const courses = getAdminCourses(reviewer);
      if (courses.length === 0) return res.json([]);
      query = query.in("reporter_course", courses);
    }

    if (req.query.status && req.query.status !== "all") {
      query = query.eq("status", req.query.status);
    }
    if (req.query.severity && req.query.severity !== "all") {
      query = query.eq("severity", req.query.severity);
    }
    if (req.query.assignedTo) {
      query = query.eq("assigned_to", req.query.assignedTo);
    }
    if (req.query.unassigned === "true") {
      // Rows are written with "" rather than NULL when no handler was found
      // (matching borrow_requests), so an empty string is the sentinel here.
      query = query.eq("assigned_to", "");
    }
    if (req.query.dateFrom) {
      query = query.gte("incident_date", req.query.dateFrom);
    }
    if (req.query.dateTo) {
      query = query.lte("incident_date", req.query.dateTo);
    }

    // Reported date first (the incident itself), then filing time for reports
    // filed the same day. The old ordering was created_at only, which buried
    // older incidents that were still open.
    query = query.order("incident_date", { ascending: false, nullsFirst: false });
    query = query.order("created_at", { ascending: false });

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    let items = rows || [];

    if (req.query.search) {
      const q = req.query.search.toLowerCase().trim();
      if (q) {
        items = items.filter(
          (item) =>
            (item.title || "").toLowerCase().includes(q) ||
            (item.description || "").toLowerCase().includes(q) ||
            (item.item_name || "").toLowerCase().includes(q) ||
            (item.reporter_name || "").toLowerCase().includes(q) ||
            (item.reporter_school_id || "").toLowerCase().includes(q) ||
            (item.assigned_to_name || "").toLowerCase().includes(q)
        );
      }
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(items));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/** The student's own tracking view: status plus the handler's remarks. */
async function getMine(req, res) {
  try {
    const { data: rows, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("reported_by", req.user.uid)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    let items = rows || [];

    if (req.query.status && req.query.status !== "all") {
      items = items.filter((i) => i.status === req.query.status);
    }

    const { page, limit, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice((page - 1) * limit, page * limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(items));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/**
 * One report plus its timeline. The student may read their own; an admin may
 * read it only if they handle the reporter's course.
 */
async function getOne(req, res) {
  try {
    const incident = await fetchIncident(req.params.id);
    if (!incident) return res.status(404).json({ error: "Incident report not found" });

    if (req.user?.role !== "admin") {
      if (incident.reported_by !== req.user.uid) {
        return res.status(403).json({ error: "Not authorized to view this report" });
      }
    } else {
      const reviewer = req.profile || {};
      if (!canHandleIncident(reviewer, incident)) {
        return res.status(403).json({ error: "You are not the handler for this course" });
      }
    }

    const events = await fetchEvents([incident.id]);
    res.json(transformKeys({ ...incident, events: events.get(incident.id) || [] }));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

async function create(req, res) {
  try {
    const { catalogId, incidentDate, type, severity, description, photos } = req.body;
    // Identity and course come from Firestore, never the request body. Trusting
    // req.body here is what let a client label any report as any other student.
    // attachRole put the document on req.profile; this is the same read, not a
    // second one, so the 404 below still fires for a uid in neither collection.
    const user = req.profile;
    if (!user) return res.status(404).json({ error: "User not found" });
    const uid = user.id;

    // Item name and its owning course likewise come from the catalog, so a
    // report cannot claim a different item than the one selected.
    const { data: item, error: itemError } = await supabase
      .from("catalog")
      .select("id, item_name, course, category")
      .eq("id", catalogId)
      .single();
    if (itemError || !item) return res.status(404).json({ error: "Catalog item not found" });

    // Assignment follows the student's own course, which is what the workflow
    // promises. item.course is stored alongside so the handler can see when a
    // student damaged another course's equipment and reassign if needed.
    const reporterCourse = user.course || "";
    const handler = await autoAssignAdmin(reporterCourse, INCIDENT_WORKLOAD);

    const now = new Date().toISOString();
    const insertData = {
      id: randomUUID(),
      title: `${TYPE_LABELS[type] || "Incident"}: ${item.item_name}`,
      type,
      category: item.category || "",
      description,
      severity,
      reported_by: uid,
      reporter_name: displayName(user),
      reporter_role: user.role || "student",
      reporter_school_id: user.schoolId || user.employeeId || "",
      reporter_course: reporterCourse,
      reporter_year: user.year || "",
      item_name: item.item_name,
      item_course: item.course || "",
      catalog_id: item.id,
      incident_date: incidentDate,
      photos: Array.isArray(photos) ? photos : [],
      status: "pending",
      assigned_to: handler?.id || "",
      assigned_to_name: handler ? displayName(handler) : "",
      assigned_at: handler ? now : null,
      reassignment_history: [],
      resolution: "",
      created_at: now,
      updated_at: now,
    };

    const { data: created, error: insertError } = await supabase
      .from(TABLE)
      .insert(insertData)
      .select()
      .single();
    if (insertError) throw new Error(insertError.message);

    await appendEvent({
      incidentId: created.id,
      eventType: "submitted",
      toStatus: "pending",
      actorId: uid,
      actorName: displayName(user),
      actorRole: user.role || "student",
    });

    // Tell the handler. Falls back to every active admin when nobody is
    // assigned to this course, so the report is never silently unowned.
    try {
      const courseHandlers = await getTargetCourseAdmins(reporterCourse);
      const recipients = courseHandlers.length > 0 ? courseHandlers : await getActiveAdminsList();
      await Promise.all(
        recipients.map((admin) =>
          notify({
            targetUserId: admin.id,
            type: "warning",
            title: "New Incident Report",
            message: `${displayName(user)} reported ${TYPE_LABELS[type] || "an incident"} on "${item.item_name}" — Course: ${reporterCourse || "n/a"}`,
            link: ADMIN_LINK,
          })
        )
      );
    } catch (notifErr) {
      console.error("Failed to send incident notification:", notifErr.message);
    }

    res.status(201).json({
      id: created.id,
      message: "Incident report submitted",
      assigned_to_name: insertData.assigned_to_name,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/**
 * Move a report along the workflow.
 *
 * Three guards, in order: the report must exist, the reviewer must handle the
 * reporter's course, and the transition must be legal. Each pass validates the
 * current state rather than trusting the client, which is the same discipline
 * borrowRequestController applies to approve/reject.
 */
async function updateStatus(req, res) {
  try {
    const { id } = req.params;
    const { status, note } = req.body;
    const reviewerId = req.user.uid;

    const incident = await fetchIncident(id);
    if (!incident) return res.status(404).json({ error: "Incident report not found" });

    // Already resolved by authorize("admin") on this route -- see the note in getAll.
    const reviewer = req.profile || {};
    if (!canHandleIncident(reviewer, incident)) {
      return res.status(403).json({ error: "You are not the handler for this course" });
    }

    if (status === incident.status) {
      return res.status(400).json({ error: `Report is already ${labelForStatus(status)}` });
    }

    const allowed = INCIDENT_TRANSITIONS[incident.status] || [];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        error: `Cannot change from ${labelForStatus(incident.status)} to ${labelForStatus(status)}`,
      });
    }

    // A rejection denies the student anything they were expecting, so the
    // student must be told why. Mirrors the borrow-request review-note rule.
    if (status === "rejected" && !note?.trim()) {
      return res.status(400).json({ error: "Please give a reason for rejecting this report" });
    }

    const now = new Date().toISOString();
    // Captured before the update so the event records where the report came
    // from, not where it ended up.
    const previousStatus = incident.status;
    const patch = {
      status,
      reviewed_by: reviewerId,
      reviewer_name: displayName(reviewer),
      reviewed_at: now,
      updated_at: now,
    };
    // Resolution is the one-line closing outcome shown on the card; the full
    // narrative lives in the timeline.
    if (status === "resolved") patch.resolution = note?.trim() || incident.resolution || "";

    const { error: updateError } = await supabase.from(TABLE).update(patch).eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await appendEvent({
      incidentId: id,
      eventType: "status_change",
      fromStatus: previousStatus,
      toStatus: status,
      note: note?.trim() || "",
      actorId: reviewerId,
      actorName: displayName(reviewer),
      actorRole: "admin",
    });

    const isRejection = status === "rejected";
    await notify({
      targetUserId: incident.reported_by,
      type: isRejection ? "warning" : status === "resolved" ? "success" : "info",
      title: `Incident Report ${labelForStatus(status)}`,
      message: `Your report about "${incident.item_name}" is now ${labelForStatus(status)}.${note?.trim() ? ` Remarks: ${note.trim()}` : ""}`,
      link: STUDENT_LINK,
    });

    res.json({ message: `Report marked ${labelForStatus(status)}`, status });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/** Handler remark: progress without moving the status. */
async function addRemark(req, res) {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const reviewerId = req.user.uid;

    if (!note?.trim()) return res.status(400).json({ error: "Remark cannot be empty" });

    const incident = await fetchIncident(id);
    if (!incident) return res.status(404).json({ error: "Incident report not found" });

    const reviewer = req.profile || {};
    if (!canHandleIncident(reviewer, incident)) {
      return res.status(403).json({ error: "You are not the handler for this course" });
    }

    // Terminal statuses are closed. A remark after resolution would be a hidden
    // back channel to the student, so it has to be refused.
    if (incident.status === "resolved") {
      return res.status(400).json({ error: "This report is resolved and cannot take further remarks" });
    }

    await appendEvent({
      incidentId: id,
      eventType: "remark",
      note: note.trim(),
      actorId: reviewerId,
      actorName: displayName(reviewer),
      actorRole: "admin",
    });

    await supabase.from(TABLE).update({ updated_at: new Date().toISOString() }).eq("id", id);

    await notify({
      targetUserId: incident.reported_by,
      type: "info",
      title: "Incident Report Update",
      message: `${displayName(reviewer)} added a remark to your report about "${incident.item_name}": ${note.trim()}`,
      link: STUDENT_LINK,
    });

    res.json({ message: "Remark added" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/**
 * Hand a report to a different handler. Needed when a student's course is not
 * the one that owns the damaged item, or when the auto-assigned handler is
 * absent. Validation matches borrowRequestController.reassignRequest: the
 * target must be an active admin who covers the reporter's course.
 */
async function reassign(req, res) {
  try {
    const { id } = req.params;
    const { newHandlerId, reason } = req.body;
    const reassignedBy = req.user.uid;

    if (!newHandlerId) return res.status(400).json({ error: "Select a handler" });

    const incident = await fetchIncident(id);
    if (!incident) return res.status(404).json({ error: "Incident report not found" });
    if (incident.status === "resolved") {
      return res.status(400).json({ error: "Cannot reassign a resolved report" });
    }

    const reviewer = req.profile || {};
    if (!canHandleIncident(reviewer, incident)) {
      return res.status(403).json({ error: "You are not the handler for this course" });
    }

    // This one is NOT already resolved: newHandlerId is someone else, so the
    // reviewer's document cannot answer for them.
    const newHandlerDoc = await db.collection("users").doc(newHandlerId).get();
    if (!newHandlerDoc.exists) return res.status(404).json({ error: "Handler not found" });
    const newHandler = newHandlerDoc.data();
    if (newHandler.role !== "admin") return res.status(400).json({ error: "Target user is not an admin" });
    if (newHandler.status === "inactive") {
      return res.status(400).json({ error: "Cannot assign to an inactive admin" });
    }
    if (incident.reporter_course
      && !isSuperAdmin(newHandler)
      && !getAdminCourses(newHandler).includes(incident.reporter_course)) {
      return res.status(400).json({ error: "That admin is not assigned to this course" });
    }

    const historyEntry = {
      previous_admin_id: incident.assigned_to || "",
      previous_admin_name: incident.assigned_to_name || "",
      new_admin_id: newHandlerId,
      new_admin_name: displayName(newHandler),
      reassigned_by: reassignedBy,
      reassigned_by_name: displayName(reviewer),
      date: new Date().toISOString(),
      reason: reason?.trim() || "",
    };

    const { error: updateError } = await supabase
      .from(TABLE)
      .update({
        assigned_to: newHandlerId,
        assigned_to_name: historyEntry.new_admin_name,
        assigned_at: new Date().toISOString(),
        reassignment_history: [...(incident.reassignment_history || []), historyEntry],
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updateError) throw new Error(updateError.message);

    await appendEvent({
      incidentId: id,
      eventType: "reassigned",
      note: reason?.trim() || "",
      actorId: reassignedBy,
      actorName: displayName(reviewer),
      actorRole: "admin",
    });

    await notify({
      targetUserId: newHandlerId,
      type: "info",
      title: "Incident Report Reassigned to You",
      message: `A report from ${incident.reporter_name} about "${incident.item_name}" has been assigned to you.`,
      link: ADMIN_LINK,
    });

    res.json({ message: "Report reassigned", assigned_to_name: historyEntry.new_admin_name });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

/**
 * Delete, narrowly. An append-only timeline is the point of the redesign, so
 * hard-deleting a report that already carries a verdict would erase the audit
 * trail. Two restrictions: a super-admin only, and only before the handler has
 * started. Anything further is left in place and closed out instead.
 */
async function remove(req, res) {
  try {
    const { id } = req.params;

    const incident = await fetchIncident(id);
    if (!incident) return res.status(404).json({ error: "Incident report not found" });

    const reviewer = req.profile || {};
    if (!isSuperAdmin(reviewer)) {
      return res.status(403).json({ error: "Only a super-admin can delete an incident report" });
    }
    if (incident.status !== "pending") {
      return res.status(400).json({
        error: `Cannot delete a report that is ${labelForStatus(incident.status)}. Resolve or reject it instead.`,
      });
    }

    await supabase.from(EVENTS_TABLE).delete().eq("incident_id", id);
    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw new Error(error.message);

    res.json({ message: "Incident report deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
}

module.exports = {
  getAll,
  getMine,
  getOne,
  create,
  updateStatus,
  addRemark,
  reassign,
  remove,
  INCIDENT_TRANSITIONS,
  OPEN_STATUSES,
  TYPE_LABELS,
  todayISO,
};