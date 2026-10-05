const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const { parsePagination, paginatedResponse } = require("../middleware/pagination");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const { fetchAll, isTruncated } = require("../utils/fetchAll");

/**
 * Reads the whole catalog.
 *
 * PostgREST caps one response at `max-rows` (1000) and signals nothing when it
 * does — it just returns its first 1000 rows. A plain `select("*")` therefore
 * silently truncated the catalog: the dashboard's totals came up short and a
 * paginated listing dropped the overflow rows on every page after the first.
 *
 * The single read is kept for the ordinary case, so its row order (and cost)
 * stay exactly as they were. Only when the count header says the response was
 * cut short is the catalog re-read paged, with `id` as the ordering column so
 * the pages cannot overlap or skip rows.
 */
async function readWholeCatalog() {
  const { data, error, count } = await supabase.from("catalog").select("*", { count: "exact" });
  if (error) throw error;

  const rows = data || [];
  if (!isTruncated(count, rows.length)) return rows;

  return fetchAll(() => supabase.from("catalog").select("*").order("id", { ascending: true }));
}

const getAll = async (req, res) => {
  try {
    const items = await readWholeCatalog();

    let result = items;

    if (req.query.search) {
      const q = req.query.search.toLowerCase();
      const fields = ["item_name", "category", "course", "barcode", "asset_tag"];
      result = result.filter((item) =>
        fields.some((f) => item[f] && String(item[f]).toLowerCase().includes(q))
      );
    }

    if (req.query.status && req.query.status !== "All") {
      result = result.filter((item) => item.status === req.query.status);
    }

    if (req.query.course && req.query.course !== "All") {
      if (req.query.course === "Unassigned") {
        result = result.filter((item) => !item.course);
      } else {
        result = result.filter((item) => item.course === req.query.course);
      }
    }

    if (req.query.category && req.query.category !== "All") {
      result = result.filter((item) => item.category === req.query.category);
    }

    if (req.query.condition && req.query.condition !== "All") {
      result = result.filter((item) => item.condition === req.query.condition);
    }

    if (req.query.sort) {
      if (req.query.sort === "name") {
        result.sort((a, b) => (a.item_name || "").localeCompare(b.item_name || ""));
      } else if (req.query.sort === "date") {
        result.sort((a, b) => (new Date(b.created_at || 0).getTime()) - (new Date(a.created_at || 0).getTime()));
      } else if (req.query.sort === "number") {
        result.sort((a, b) => (Number(a.item_name) || 0) - (Number(b.item_name) || 0));
      }
    }

    const { paginate, page, limit } = parsePagination(req);

    if (paginate) {
      const total = result.length;
      const start = (page - 1) * limit;
      const paged = result.slice(start, start + limit);
      return res.json(paginatedResponse(transformKeys(paged), total, page, limit));
    }

    res.json(transformKeys(result));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/** Same truncation guard as readWholeCatalog, for the columns stats needs. */
async function readCatalogStatsRows() {
  const COLUMNS = "course, status, category";
  const { data, error, count } = await supabase
    .from("catalog")
    .select(COLUMNS, { count: "exact" });
  if (error) throw error;

  const rows = data || [];
  if (!isTruncated(count, rows.length)) return rows;

  return fetchAll(() =>
    supabase.from("catalog").select(COLUMNS).order("id", { ascending: true })
  );
}

const getStats = async (req, res) => {
  try {
    const rows = await readCatalogStatsRows();

    const byCourseMap = new Map();
    const categories = new Set();
    let totalQuantity = 0;

    for (const item of rows) {
      const course = item.course || "Unassigned";
      const available = item.status === "Available";

      if (!byCourseMap.has(course)) {
        byCourseMap.set(course, { course, total: 0, available: 0 });
      }
      const entry = byCourseMap.get(course);
      entry.total += 1;
      if (available) entry.available += 1;

      if (item.category) categories.add(item.category);
      totalQuantity += Number(item.quantity) || 0;
    }

    res.json({
      total: rows.length,
      totalQuantity,
      available: rows.filter((i) => i.status === "Available").length,
      borrowed: rows.filter((i) => i.status === "Borrowed").length,
      categories: categories.size,
      byCourse: [...byCourseMap.values()].sort((a, b) => a.course.localeCompare(b.course)),
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getById = async (req, res) => {
  try {
    const { data, error } = await supabase.from("catalog").select("*").eq("id", req.params.id).single();
    if (error || !data) return res.status(404).json({ error: "Item not found" });
    res.json(transformKeys(data));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const data = req.body;
    const quantity = Number(data.quantity) || 0;
    const adminId = req.user?.uid || "";
    let adminName = "";
    if (adminId) {
      try {
        const adminDoc = await db.collection("users").doc(adminId).get();
        if (adminDoc.exists) {
          const ad = adminDoc.data();
          adminName = `${ad.firstName || ""} ${ad.lastName || ""}`.trim();
        }
      } catch {}
    }

    const insertData = {
      id: randomUUID(),
      item_name: data.itemName,
      category: data.category,
      course: data.course || "",
      quantity,
      condition: data.condition,
      status: data.status || "Available",
      image_url: data.imageUrl || "",
      barcode: data.barcode || "",
      asset_tag: data.assetTag || "",
      available_quantity: data.status === "Available" ? quantity : 0,
      available: data.status === "Available" && quantity > 0,
      created_by_admin_id: adminId,
      created_by_admin_name: adminName,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error: insertError } = await supabase
      .from("catalog")
      .insert(insertData)
      .select()
      .single();
    if (insertError) throw insertError;

    try {
      const usersSnap = await db.collection("users")
        .where("role", "==", "student")
        .get();
      const notifications = usersSnap.docs.map((doc) => ({
        id: randomUUID(),
        target_user_id: doc.id,
        type: "info",
        title: "New Catalog Item Available",
        message: `A new item "${data.itemName}" has been added to the catalog and is now available for borrowing.`,
        read: false,
        dismissed_by: [],
        link: "/catalog",
        created_at: new Date().toISOString(),
      }));

      const BATCH_SIZE = 500;
      for (let i = 0; i < notifications.length; i += BATCH_SIZE) {
        const chunk = notifications.slice(i, i + BATCH_SIZE);
        await supabase.from("notifications").insert(chunk);
      }
    } catch {
      // Non-critical: item was created successfully, skip notification
    }

    res.status(201).json({ id: created.id, message: "Item created" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;

    const { data: existing, error: fetchError } = await supabase
      .from("catalog")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !existing) return res.status(404).json({ error: "Item not found" });

    const quantity = Number(data.quantity ?? existing.quantity) || 0;
    const previousBorrowed = Math.max(0, Number(existing.quantity || 0) - Number(existing.available_quantity || 0));

    if (quantity < previousBorrowed) {
      return res.status(400).json({
        error: `Cannot reduce quantity below ${previousBorrowed} (currently borrowed). Return items first or keep quantity at ${previousBorrowed}+.`,
      });
    }

    const availableQuantity = Math.max(0, quantity - previousBorrowed);

    const allowed = ["itemName", "category", "course", "condition", "status", "imageUrl", "barcode", "assetTag"];
    const sanitized = {};
    for (const key of allowed) {
      if (data[key] !== undefined) sanitized[key] = data[key];
    }

    const updatePayload = {};
    if (sanitized.itemName !== undefined) updatePayload.item_name = sanitized.itemName;
    if (sanitized.category !== undefined) updatePayload.category = sanitized.category;
    if (sanitized.course !== undefined) updatePayload.course = sanitized.course;
    if (sanitized.condition !== undefined) updatePayload.condition = sanitized.condition;
    if (sanitized.status !== undefined) updatePayload.status = sanitized.status;
    if (sanitized.imageUrl !== undefined) updatePayload.image_url = sanitized.imageUrl;
    if (sanitized.barcode !== undefined) updatePayload.barcode = sanitized.barcode;
    if (sanitized.assetTag !== undefined) updatePayload.asset_tag = sanitized.assetTag;

    updatePayload.quantity = quantity;
    updatePayload.available_quantity = availableQuantity;
    updatePayload.available = availableQuantity > 0;
    if (sanitized.status === undefined) {
      updatePayload.status = availableQuantity > 0 ? "Available" : "Borrowed";
    }
    updatePayload.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from("catalog")
      .update(updatePayload)
      .eq("id", id);
    if (updateError) throw updateError;

    res.json({ message: "Item updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;

    const { data: item, error: fetchError } = await supabase
      .from("catalog")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchError || !item) return res.status(404).json({ error: "Item not found" });

    const borrowed = Math.max(0, Number(item.quantity || 0) - Number(item.available_quantity || 0));
    if (borrowed > 0) {
      return res.status(400).json({ error: `Cannot delete item with ${borrowed} active borrow(s). Return all items first.` });
    }

    const { data: activeRequests, error: reqError } = await supabase
      .from("borrow_requests")
      .select("id")
      .eq("catalog_id", id)
      .eq("status", "pending");
    if (!reqError && activeRequests && activeRequests.length > 0) {
      return res.status(400).json({ error: `Cannot delete item with ${activeRequests.length} pending borrow request(s). Reject or cancel them first.` });
    }

    const { error: deleteError } = await supabase.from("catalog").delete().eq("id", id);
    if (deleteError) throw deleteError;

    res.json({ message: "Item deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const lookupByBarcode = async (req, res) => {
  try {
    const { code } = req.params;
    if (!code) return res.status(400).json({ error: "Code is required" });

    const fields = ["id", "barcode", "asset_tag"];
    for (const field of fields) {
      const { data, error } = await supabase
        .from("catalog")
        .select("*")
        .eq(field, code)
        .limit(1)
        .single();

      if (!error && data) {
        return res.json(transformKeys({ id: data.id, ...data }));
      }
    }

    res.status(404).json({ error: "Item not found" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getAll, getStats, getById, create, update, remove, lookupByBarcode };
