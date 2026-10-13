const { supabase } = require("../config/supabase");
const { db } = require("../config/firebase");
const { randomUUID } = require("crypto");
const { transformKeys } = require("../utils/transformKeys");
const { invalidateCache } = require("../utils/cache");
const {
  getAdminCourses,
  isSuperAdmin,
  IMPOSSIBLE_COURSE,
} = require("../middleware/courseScope");

const TABLE = "safety_rules";
const USERS = "users";
const CACHE_PATH = "/api/safety-rules";

const CLOUDINARY_UPLOAD_ENDPOINT = "https://api.cloudinary.com/v1_1";

/**
 * Which courses may this request see?
 *
 * WHY THIS EXISTS RATHER THAN REUSING scopeCodes(): scopeCodes() returns null for any
 * non-admin, which means "no restriction" -- correct for the admin surfaces it was built
 * for, and wrong here. A STUDENT must not receive every safety rule in the building, so
 * their scope has to come from their own verified profile.
 *
 *   null                 -> Super Admin only
 *   [codes...]           -> the courses this caller may see
 *   [IMPOSSIBLE_COURSE]  -> nobody; renders as an empty result through the normal path
 *
 * FAIL CLOSED, three ways:
 *   - a student whose profile has no `course` gets the sentinel, not an empty array that
 *     might later be read as "unrestricted"
 *   - an admin assigned no course gets their real (empty) list, which scopedAny turns into
 *     the sentinel
 *   - an unknown role gets the sentinel outright
 *
 * The student's course comes from req.profile, which is the Firestore document read by
 * ensureProfile. It is never taken from a request body, a query string or a header, so a
 * student cannot widen their own scope by editing a request.
 */
function safetyRuleScope(req) {
  const profile = req?.profile;
  if (!profile) return [IMPOSSIBLE_COURSE];

  if (isSuperAdmin(profile)) return null;

  if (profile.role === "admin") return getAdminCourses(profile);

  if (profile.role === "student") {
    const course = String(profile.course || "").trim();
    return course ? [course] : [IMPOSSIBLE_COURSE];
  }

  // kiosk and anything else unknown get nothing.
  return [IMPOSSIBLE_COURSE];
}

/** Scopes a PostgREST builder to the caller's courses. */
function scopedRules(query, req) {
  const codes = safetyRuleScope(req);
  if (codes === null) return query;
  return query.in("course", codes);
}

/**
 * Pure predicate: may this request act on a row belonging to `course`?
 *
 * Deliberately does NOT touch `res`. Two callers need different responses for the same
 * refusal -- a read of an existing row is a 404 (hide its existence), while a submitted
 * form value is a 400 (a rejected value, not a hidden resource). Having one helper do
 * both meant it sent a response and the caller sent a second on top, which is
 * ERR_HTTP_HEADERS_SENT and a crashed request rather than a clean 400.
 */
function coursePermitted(req, course) {
  const codes = safetyRuleScope(req);
  if (codes === null) return true;
  const owned = String(course || "").trim();
  return Boolean(owned) && codes.includes(owned);
}

/**
 * Authorises one EXISTING row for an action.
 *
 * Returns false after sending 404 -- deliberately NOT 403. A 403 confirms the row exists,
 * which leaks the very thing the restriction exists to hide; 404 is indistinguishable from
 * a genuine miss. Mirrors assertCourseInScope in the courseScope module.
 */
function ruleInScope(req, res, rule) {
  if (coursePermitted(req, rule.course)) return true;
  res.status(404).json({ error: "Safety rule not found" });
  return false;
}

async function enrichWithUploaderNames(rules) {
  const userIds = [...new Set(rules.map((r) => r.uploaded_by).filter(Boolean))];
  if (userIds.length === 0) return rules;
  const userSnaps = await Promise.all(userIds.map((id) => db.collection(USERS).doc(id).get()));
  const userMap = {};
  userSnaps.forEach((s) => {
    if (s.exists) {
      const d = s.data();
      userMap[s.id] = `${d.firstName || ""} ${d.lastName || ""}`.trim() || d.email || s.id;
    }
  });
  return rules.map((r) => ({ ...r, uploaderName: userMap[r.uploaded_by] || r.uploaded_by || "Unknown" }));
}

/**
 * The client-facing shape of a rule.
 *
 * `file_public_id`, `file_url` and `thumbnail_url` are ALL deliberately absent.
 *
 * The first two are storage internals: the frontend must never hold a Cloudinary
 * reference, because the only sanctioned way to read a file is the authorised
 * /:id/file endpoint, which re-checks the course on every request.
 *
 * `thumbnail_url` is dropped for a different reason. It looked harmless -- just a cover
 * image -- but it is a free-form URL the client supplies at create/update time and the
 * server then renders as an <img src> for every other user in that course. That is a
 * request-forgery and tracking-pixel vector: a Course Admin could point it at an internal
 * host and have every reader's browser probe it, or hand out a URL that quietly changes.
 * Previews are generated from the uploaded file itself through the authenticated
 * endpoint, so the field has no purpose here and no place in the payload.
 */
function toClientRule(rule) {
  return {
    id: rule.id,
    title: rule.title,
    description: rule.description || "",
    course: rule.course,
    lab_room: rule.lab_room || "",
    status: rule.status || "Active",
    file_name: rule.file_name || "",
    file_size: rule.file_size || "",
    file_type: rule.file_type || "",
    uploaded_by: rule.uploaded_by || "",
    uploaderName: rule.uploaderName || "",
    has_file: Boolean(rule.file_public_id),
    created_at: rule.created_at,
    updated_at: rule.updated_at,
  };
}

// Magic-byte signatures. The declared Content-Type is client-controlled and trivially
// spoofed, so it is necessary but never sufficient to decide what a file IS.
const MAGIC = [
  { mime: "image/jpeg", ext: "jpg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: "image/png", ext: "png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "application/pdf", ext: "pdf", test: (b) => b.slice(0, 5).toString("latin1") === "%PDF-" },
];

/**
 * Identifies an upload from its leading bytes.
 *
 * Returns null for anything not on the list, which includes every executable format the
 * platform can execute. A `.exe` renamed to `.png` still fails here because the declared
 * type is never consulted as proof.
 */
function identifyFile(buffer) {
  const b = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
  if (b.length === 0) return null;
  return MAGIC.find((m) => {
    try {
      return m.test(b);
    } catch {
      return false;
    }
  }) || null;
}

/** Fetches the caller's permitted course list, for validating a submitted course. */
async function courseIsReal(supabaseRef, course) {
  const code = String(course || "").trim();
  if (!code) return false;
  const { data, error } = await supabaseRef.from("courses").select("id").eq("id", code).limit(1);
  if (error) throw error;
  return Boolean(data && data.length > 0);
}

const getAll = async (req, res) => {
  try {
    const query = supabase.from(TABLE).select("*").order("created_at", { ascending: false });

    // A course filter is a DISPLAY filter and may only narrow. Applying it inside the
    // scope filter (rather than unioning the two) means a client can never use ?course=
    // to escape its own scope -- the intersection is always a subset of the caller's.
    let q = query;
    if (req.query.course && req.query.course !== "All") {
      q = q.eq("course", String(req.query.course));
    }

    const { data, error } = await scopedRules(q, req);
    if (error) throw error;

    const enriched = await enrichWithUploaderNames(data || []);
    res.json(transformKeys(enriched.map(toClientRule)));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const getRule = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: rule, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !rule) return res.status(404).json({ error: "Safety rule not found" });
    if (!ruleInScope(req, res, rule)) return;
    const enriched = await enrichWithUploaderNames([rule]);
    res.json(transformKeys(toClientRule(enriched[0])));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, description, course, labRoom, status, fileName, fileSize, fileType, filePublicId, fileFormat } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: "Title is required" });
    }

    // course is REQUIRED and must be a real course, unlike manuals.course which is
    // nullable and produced ownerless rows that no Course Admin could ever see.
    const requested = String(course || "").trim();
    if (!requested) {
      return res.status(400).json({ error: "A course is required for a safety rule" });
    }
    if (!(await courseIsReal(supabase, requested))) {
      return res.status(400).json({ error: `Unknown course "${requested}"` });
    }
    // A Course Admin may only file under their own course. Without this a client-supplied
    // course id in the body would let them place content in someone else's logbook.
    // 400, not 404: this is a rejected form value, and there is no existing row to hide.
    if (!coursePermitted(req, requested)) {
      return res.status(400).json({ error: "You can only add safety rules to your own course" });
    }

    const now = new Date().toISOString();
    const insertData = {
      id: randomUUID(),
      title: String(title).trim(),
      description: description || "",
      course: requested,
      lab_room: labRoom || "",
      status: status || "Active",
      file_public_id: filePublicId || null,
      file_format: fileFormat || null,
      file_url: null,
      file_name: fileName || "",
      file_size: fileSize || "",
      file_type: fileType || "",
      // thumbnail_url is never accepted from the client -- see toClientRule.
      uploaded_by: req.user.uid,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await supabase.from(TABLE).insert(insertData).select().single();
    if (error) throw error;
    invalidateCache(CACHE_PATH);
    const enriched = await enrichWithUploaderNames([data]);
    res.status(201).json(transformKeys(toClientRule(enriched[0])));
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id, course")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Safety rule not found" });

    // Two checks. The row must already be theirs, and it must not be MOVED to a course
    // they do not own -- otherwise a Course Admin could rewrite a rule and reassign it out
    // of reach, or into one.
    if (!ruleInScope(req, res, existing)) return;

    const { course } = req.body;
    if (course !== undefined) {
      const target = String(course || "").trim();
      if (!target) return res.status(400).json({ error: "A course is required for a safety rule" });
      if (!(await courseIsReal(supabase, target))) {
        return res.status(400).json({ error: `Unknown course "${target}"` });
      }
      if (!coursePermitted(req, target)) {
        return res.status(400).json({ error: "You cannot move a safety rule to another course" });
      }
    }

    const allowed = [
      "title", "description", "course", "lab_room", "status",
      "file_public_id", "file_format", "file_name", "file_size", "file_type",
      // thumbnail_url is absent on purpose: accepting it would let a caller store a URL
      // that is rendered for other users in the course. See toClientRule.
    ];
    const camelToSnake = {
      labRoom: "lab_room",
      filePublicId: "file_public_id",
      fileFormat: "file_format",
      fileName: "file_name",
      fileSize: "file_size",
      fileType: "file_type",
    };

    const updates = {};
    for (const [key, val] of Object.entries(req.body)) {
      const dbKey = camelToSnake[key] || key;
      if (allowed.includes(dbKey) && val !== undefined) updates[dbKey] = val;
    }
    updates.updated_at = new Date().toISOString();

    const { error } = await supabase.from(TABLE).update(updates).eq("id", id);
    if (error) throw error;
    invalidateCache(CACHE_PATH);
    res.json({ message: "Safety rule updated" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: existing, error: fetchErr } = await supabase
      .from(TABLE)
      .select("id, course")
      .eq("id", id)
      .single();
    if (fetchErr || !existing) return res.status(404).json({ error: "Safety rule not found" });
    if (!ruleInScope(req, res, existing)) return;

    const { error } = await supabase.from(TABLE).delete().eq("id", id);
    if (error) throw error;
    invalidateCache(CACHE_PATH);
    res.json({ message: "Safety rule deleted" });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const uploadFile = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "No file provided" });
    }

    // Size first: an oversized buffer should be refused before it is sniffed or sent.
    if (req.file.size > MAX_UPLOAD_BYTES) {
      return res.status(413).json({ error: "File is larger than the 10 MB limit" });
    }

    // Content is decided by CONTENT, not by what the client said it is.
    const kind = identifyFile(req.file.buffer);
    if (!kind) {
      return res.status(400).json({
        error: `Unsupported file type. Allowed: ${MAGIC.map((m) => m.mime).join(", ")}`,
      });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    const preset = process.env.CLOUDINARY_UPLOAD_PRESET?.trim();
    if (!cloudName || !preset) {
      return res.status(503).json({ error: "File storage is not configured" });
    }

    const formData = new FormData();
    formData.append("file", `data:${kind.mime};base64,${req.file.buffer.toString("base64")}`);
    formData.append("upload_preset", preset);

    const response = await fetch(`${CLOUDINARY_UPLOAD_ENDPOINT}/${cloudName}/image/upload`, {
      method: "POST",
      body: formData,
    });
    const data = await response.json();

    if (!response.ok || !data.public_id) {
      return res.status(502).json({
        error: data?.error?.message || "Storage rejected the upload",
      });
    }

    // public_id ONLY. secure_url is deliberately never returned: it is a public delivery
    // URL, and handing it to the browser would defeat the /file proxy entirely.
    res.status(201).json({
      publicId: data.public_id,
      format: data.format || kind.ext,
      fileName: req.file.originalname || "",
      fileSize: String(req.file.size),
      fileType: kind.mime,
    });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

/**
 * Serves a rule's file, subject to the SAME course check as the record itself.
 *
 * WHY THIS EXISTS: without it the browser is handed a Cloudinary delivery URL and the
 * course restriction is decorative -- anyone holding that URL bypasses the API entirely.
 * Authorising on the row and then proxying keeps the decision inside the backend.
 *
 * WHAT IT DOES NOT DO, stated plainly: it does not make the underlying Cloudinary asset
 * private. Assets uploaded through the existing unsigned preset are PUBLIC, so a URL that
 * was already handed out stays fetchable forever. This closes IDOR on this endpoint; it
 * does not deliver confidentiality. See docs/known-issues/safety-rules-file-access.md.
 */
const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: rule, error } = await supabase.from(TABLE).select("*").eq("id", id).single();
    if (error || !rule) return res.status(404).json({ error: "Safety rule not found" });
    if (!ruleInScope(req, res, rule)) return;

    if (!rule.file_public_id) {
      return res.status(404).json({ error: "This safety rule has no attached file" });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME?.trim();
    if (!cloudName) return res.status(503).json({ error: "File storage is not configured" });

    const publicId = String(rule.file_public_id);
    const ext = String(rule.file_format || "").replace(/[^a-z0-9]/gi, "");
    const delivery = ext ? `${publicId}.${ext}` : publicId;

    const upstream = await fetch(`https://res.cloudinary.com/${cloudName}/image/upload/${delivery}`);
    if (!upstream.ok || !upstream.body) {
      return res.status(502).json({ error: "Could not retrieve the stored file" });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", rule.file_type || "application/octet-stream");
    res.setHeader("Content-Length", String(buf.length));
    // The client never receives a storage URL, so this cannot be cached and re-shared by
    // an intermediate proxy under a different identity.
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Disposition", `inline; filename="${String(rule.file_name || "file").replace(/["\r\n]/g, "")}"`);
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = {
  getAll,
  getRule,
  create,
  update,
  remove,
  uploadFile,
  downloadFile,
  identifyFile,
  safetyRuleScope,
  CACHE_PATH,
  TABLE,
};