const { supabase } = require("../config/supabase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");

const TABLE = "incidents";

const getAll = async (req, res) => {
  try {
    let query = supabase.from(TABLE).select("*").order("created_at", { ascending: false });

    if (req.query.status && req.query.status !== "All") {
      query = query.eq("status", req.query.status);
    }
    if (req.query.severity && req.query.severity !== "All") {
      query = query.eq("severity", req.query.severity);
    }
    if (req.query.dateFrom) {
      query = query.gte("created_at", new Date(req.query.dateFrom).toISOString());
    }
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte("created_at", to.toISOString());
    }

    const { data: allItems, error } = await query;
    if (error) throw error;

    let items = allItems;

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.reporter_name && item.reporter_name.toLowerCase().includes(q))
      );
    }

    const { page, limit, offset, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice(offset, offset + limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(items));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getMyIncidents = async (req, res) => {
  try {
    let query = supabase
      .from(TABLE)
      .select("*")
      .eq("reported_by", req.user.uid)
      .order("created_at", { ascending: false });

    if (req.query.status && req.query.status !== "All") {
      query = query.eq("status", req.query.status);
    }
    if (req.query.severity && req.query.severity !== "All") {
      query = query.eq("severity", req.query.severity);
    }
    if (req.query.dateFrom) {
      query = query.gte("created_at", new Date(req.query.dateFrom).toISOString());
    }
    if (req.query.dateTo) {
      const to = new Date(req.query.dateTo);
      to.setHours(23, 59, 59, 999);
      query = query.lte("created_at", to.toISOString());
    }

    const { data: allItems, error } = await query;
    if (error) throw error;

    let items = allItems;

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      items = items.filter(
        (item) =>
          (item.title && item.title.toLowerCase().includes(q)) ||
          (item.description && item.description.toLowerCase().includes(q)) ||
          (item.reporter_name && item.reporter_name.toLowerCase().includes(q))
      );
    }

    const { page, limit, offset, paginate } = parsePagination(req);
    if (paginate) {
      const total = items.length;
      const paged = items.slice(offset, offset + limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(items));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, type, category, description, severity, reporterName, reporterRole, itemName, catalogId, photos } = req.body;
    if (!title || !description) {
      return res.status(400).json({ error: "Title and description are required" });
    }
    const insertData = {
      id: randomUUID(),
      title,
      type: type || category || "",
      category: category || "",
      description,
      severity: severity || "low",
      reported_by: req.user.uid,
      reporter_name: reporterName || "",
      reporter_role: reporterRole || "student",
      item_name: itemName || "",
      catalog_id: catalogId || "",
      photos: photos || [],
      status: "open",
      created_at: new Date().toISOString(),
    };
    const { data, error } = await supabase
      .from(TABLE)
      .insert(insertData)
      .select()
      .single();
    if (error) throw error;
    res.status(201).json({ id: data.id, message: "Incident reported" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ["status", "description", "severity", "assigned_to", "resolution", "resolutionNote", "title", "category", "type", "item_name", "itemName", "catalog_id", "catalogId", "photos"];
    const sanitized = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) sanitized[key] = req.body[key];
    }
    if (sanitized.resolutionNote !== undefined) {
      sanitized.resolution = sanitized.resolutionNote;
      delete sanitized.resolutionNote;
    }
    if (sanitized.itemName !== undefined) {
      sanitized.item_name = sanitized.itemName;
      delete sanitized.itemName;
    }
    if (sanitized.catalogId !== undefined) {
      sanitized.catalog_id = sanitized.catalogId;
      delete sanitized.catalogId;
    }
    sanitized.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from(TABLE)
      .update(sanitized)
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "Incident updated" });
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
    if (fetchErr || !existing) return res.status(404).json({ error: "Incident not found" });

    const { error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id);
    if (error) throw error;
    res.json({ message: "Incident deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getMyIncidents, create, update, remove };
