const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys, toSnakeKeys } = require("../utils/transformKeys");
const { scoped, assertCourseInScope } = require("../middleware/courseScope");

const TABLE = "maintenance";

const getAll = async (req, res) => {
  try {
    // Scoped at the read, before the JS filters below. Applying it afterwards
    // would work too, but this way the row count in the pagination envelope is
    // already the scoped one rather than the school-wide one.
    let query = scoped(
      supabase.from(TABLE).select("*").order("created_at", { ascending: false }),
      "course",
      req
    );

    if (req.query.status && req.query.status !== "All") {
      query = query.eq("status", req.query.status);
    }

    const { data: allItems, error } = await query;
    if (error) throw error;

    let items = allItems.map((item) => {
      if (!item.findings && item.description) item.findings = item.description;
      if (!item.assigned_personnel && item.assigned_to) item.assigned_personnel = item.assigned_to;
      if (!item.inspected_date && item.scheduled_date) item.inspected_date = item.scheduled_date;
      return item;
    });

    if (req.query.search) {
      const search = req.query.search.toLowerCase();
      items = items.filter((item) => {
        const itemName = (item.item_name || "").toLowerCase();
        const collegeBuilding = (item.college_building || "").toLowerCase();
        const location = (item.location || "").toLowerCase();
        const findings = (item.findings || "").toLowerCase();
        const inspectedBy = (item.inspected_by || "").toLowerCase();
        const notedBy = (item.noted_by || "").toLowerCase();
        const assignedTo = (item.assigned_to || "").toLowerCase();
        const assignedPersonnel = (item.assigned_personnel || "").toLowerCase();
        return itemName.includes(search) || collegeBuilding.includes(search) || location.includes(search) || findings.includes(search) || inspectedBy.includes(search) || notedBy.includes(search) || assignedTo.includes(search) || assignedPersonnel.includes(search);
      });
    }

    const { paginate, page, limit } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const start = (page - 1) * limit;
      const sliced = items.slice(start, start + limit);
      return res.json(paginatedResponse(transformKeys(sliced), total, page, limit));
    }

    res.json(transformKeys(items));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const body = toSnakeKeys(req.body);
    const allowed = ["title", "description", "scheduled_date", "type", "status", "priority", "assigned_to", "catalog_id", "item_name", "photo_url", "college_building", "location", "findings", "recommendation", "materials_needed", "estimated_days", "date_started", "date_finished", "remarks", "inspected_by", "noted_by", "inspected_date", "assigned_personnel", "course"];
    const sanitized = {};
    for (const key of allowed) {
      if (body[key] !== undefined) sanitized[key] = body[key];
    }
    if (!sanitized.title) sanitized.title = sanitized.item_name || "Maintenance Record";

    // A Course Admin files maintenance for their own course only. 400 rather than
    // 403: it is a rejected form value, not a resource they were denied. A record
    // filed against another course would be invisible to that course's admin.
    if (!assertCourseInScope(req, sanitized.course)) {
      return res.status(400).json({ error: "You can only file maintenance for your own course" });
    }

    sanitized.created_by = req.user.uid;
    sanitized.id = randomUUID();
    sanitized.created_at = new Date().toISOString();
    const { data, error } = await supabase
      .from(TABLE)
      .insert(sanitized)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, message: "Maintenance scheduled" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const body = toSnakeKeys(req.body);

    // Fetch first and scope the ROW, not just the query. update() was a blind
    // write by id, so a Course Admin could close or reopen another course's
    // maintenance record without ever seeing it. 404 so existence is not
    // confirmed.
    const { data: existing, error: fetchError } = await supabase
      .from(TABLE)
      .select("id, course")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Maintenance record not found" });
    if (!assertCourseInScope(req, existing.course)) {
      return res.status(404).json({ error: "Maintenance record not found" });
    }

    const allowed = ["title", "description", "scheduled_date", "type", "status", "priority", "assigned_to", "catalog_id", "item_name", "photo_url", "college_building", "location", "findings", "recommendation", "materials_needed", "estimated_days", "date_started", "date_finished", "remarks", "inspected_by", "noted_by", "inspected_date", "assigned_personnel", "course"];
    const sanitized = {};
    for (const key of allowed) {
      if (body[key] !== undefined) sanitized[key] = body[key];
    }

    // Same rule as create: the record cannot be handed to another course, which
    // would remove it from the current owner's list while still existing.
    if (sanitized.course !== undefined && !assertCourseInScope(req, sanitized.course)) {
      return res.status(400).json({ error: "You cannot move a maintenance record to another course" });
    }

    if (!sanitized.title && sanitized.item_name) sanitized.title = sanitized.item_name;
    sanitized.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .update(sanitized)
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "Maintenance updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;

    // `course` was not selected before, so the ownership check had nothing to
    // read. This was a blind delete by id across the whole school.
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id, course")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Maintenance record not found" });
    if (!assertCourseInScope(req, existing.course)) {
      return res.status(404).json({ error: "Maintenance record not found" });
    }

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (error) throw error;

    res.json({ message: "Maintenance deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, create, update, remove };
