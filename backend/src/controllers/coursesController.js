const { supabase } = require("../config/supabase");
const { transformKeys } = require("../utils/transformKeys");

/**
 * Course scopes.
 *
 * A "course" is a PROGRAM that owns its students, catalog, laboratory rooms and
 * administrator. `id` is the frozen program code (CT, CPT, AT, CTV, ELT, ELX, FSM,
 * MT, BIT) and is the join key every scoped table already stores, which is why
 * scoping a query is a single equality match and nothing needs backfilling.
 *
 * Readable by any admin: the pickers on the room, maintenance and admin forms all
 * need the list, and hiding it from Course Admins would leave them filling in a
 * free-text course that the backend then rejects as unknown.
 *
 * WRITES ARE SUPER-ADMIN ONLY (requireSuperAdmin in routes/courses.js), because
 * `id` is the join key for every course-scoped table. Renaming `name` is safe;
 * changing `id` would silently orphan every row that references it, so `id` is
 * refused rather than permitted.
 */

const getCourses = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("courses")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw error;

    res.json(transformKeys(data || []));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const createCourse = async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!id || !name) return res.status(400).json({ error: "Course code and name are required" });

    // The code is the join key and must match the program codes already stored in
    // catalog.course, users.course and so on. That constrains it to the shape of a
    // program code, and rejects the padded or mixed-case variants that would silently
    // match nothing and hide every row carrying them.
    const code = String(id).trim().toUpperCase();
    if (!/^[A-Z]{2,4}$/.test(code)) {
      return res.status(400).json({ error: "Course code must be 2-4 letters, e.g. CT or CTV" });
    }

    const { data: existing } = await supabase.from("courses").select("id").eq("id", code).limit(1);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: "That course code already exists" });
    }

    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from("courses")
      .insert({ id: code, name: String(name).trim(), status: "active", created_at: now, updated_at: now })
      .select()
      .single();
    if (error) throw error;

    res.status(201).json(transformKeys(data));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, status } = req.body;
    if (!name && !status) return res.status(400).json({ error: "Nothing to update" });

    // `id` is deliberately not updatable. It is the frozen join key every scoped
    // table stores, so changing it would orphan every row referencing this course
    // and -- because scoping fails CLOSED -- hide all of them at once.
    const updates = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = String(name).trim();
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabase
      .from("courses")
      .update(updates)
      .eq("id", id)
      .select()
      .single();
    if (error || !data) return res.status(404).json({ error: "Course not found" });

    res.json(transformKeys(data));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/**
 * Deletes nothing.
 *
 * A course cannot be deleted while any scoped table references it, and the counts
 * are reported so the Super Admin can see what is in the way rather than guessing.
 * `?force` is deliberately absent: deleting a course is not reversible from this UI,
 * and the failure mode -- a hidden course's worth of rows -- is exactly what
 * check-course-courses.js exists to detect.
 */
const deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;

    const checks = [
      ["students (Firestore)", null],
      ["catalog items", "catalog"],
      ["lab rooms", "lab_rooms"],
      ["maintenance records", "maintenance"],
    ];

    const blocking = [];
    for (const [label, table] of checks) {
      if (!table) continue;
      const { count, error } = await supabase
        .from(table)
        .select("id", { count: "exact", head: true })
        .eq("course", id);
      if (error) throw error;
      if (count) blocking.push(`${count} ${label}`);
    }

    if (blocking.length > 0) {
      return res.status(409).json({
        error: `Cannot delete: still referenced by ${blocking.join(", ")}. Reassign them first.`,
        blocking,
      });
    }

    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) throw error;

    res.json({ message: "Course deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { getCourses, createCourse, updateCourse, deleteCourse };