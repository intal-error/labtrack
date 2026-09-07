const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys, toSnakeKeys } = require("../utils/transformKeys");

const TABLE = "maintenance";

const getAll = async (req, res) => {
  try {
    let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false });

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
    const allowed = ["title", "description", "scheduled_date", "type", "status", "priority", "assigned_to", "catalog_id", "item_name", "photo_url", "college_building", "location", "findings", "recommendation", "materials_needed", "estimated_days", "date_started", "date_finished", "remarks", "inspected_by", "noted_by", "inspected_date", "assigned_personnel"];
    const sanitized = {};
    for (const key of allowed) {
      if (body[key] !== undefined) sanitized[key] = body[key];
    }
    if (!sanitized.title) sanitized.title = sanitized.item_name || "Maintenance Record";
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
    const allowed = ["title", "description", "scheduled_date", "type", "status", "priority", "assigned_to", "catalog_id", "item_name", "photo_url", "college_building", "location", "findings", "recommendation", "materials_needed", "estimated_days", "date_started", "date_finished", "remarks", "inspected_by", "noted_by", "inspected_date", "assigned_personnel"];
    const sanitized = {};
    for (const key of allowed) {
      if (body[key] !== undefined) sanitized[key] = body[key];
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
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Maintenance record not found" });

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
