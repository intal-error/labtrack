#!/usr/bin/env node
/**
 * Firestore → Supabase Migration Script
 *
 * Usage:
 *   node scripts/migrate-firestore-to-supabase.js
 *
 * Requires env vars: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY,
 *                    SUPABASE_URL, SUPABASE_SERVICE_KEY
 */

const admin = require("firebase-admin");
const { createClient } = require("@supabase/supabase-js");

// --- Firebase Admin Init ---
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !rawPrivateKey) {
  console.error("Missing Firebase credentials in environment variables.");
  process.exit(1);
}

const privateKey = rawPrivateKey
  .replace(/\\n/g, "\n")
  .replace(/\r\n/g, "\n")
  .replace(/\r/g, "\n");

admin.initializeApp({
  credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
});

const db = admin.firestore();

// --- Supabase Init ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in environment variables.");
  console.error(`SUPABASE_URL: ${supabaseUrl ? "OK" : "MISSING"}`);
  console.error(`SUPABASE_SERVICE_KEY: ${supabaseKey ? "OK" : "MISSING"}`);
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

// --- Helpers ---
function convertTimestamp(ts) {
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate().toISOString();
  if (ts.seconds) return new Date(ts.seconds * 1000).toISOString();
  if (ts instanceof Date) return ts.toISOString();
  if (typeof ts === "string") {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

function flattenDoc(doc) {
  const data = doc.data();
  const result = { id: doc.id };

  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === "object" && typeof value.toDate === "function") {
      result[key] = value.toDate().toISOString();
    } else if (value && typeof value === "object" && value.seconds !== undefined) {
      result[key] = new Date(value.seconds * 1000).toISOString();
    } else if (Array.isArray(value)) {
      result[key] = value;
    } else {
      result[key] = value;
    }
  }

  return result;
}

function mapCatalog(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    item_name: d.itemName || "",
    category: d.category || "",
    course: d.course || "",
    quantity: d.quantity || 0,
    available_quantity: d.availableQuantity || 0,
    available: d.available !== false,
    condition: d.condition || "",
    status: d.status || "Available",
    image_url: d.imageUrl || "",
    barcode: d.barcode || "",
    asset_tag: d.assetTag || "",
    created_by_admin_id: d.created_by_admin_id || "",
    created_by_admin_name: d.created_by_admin_name || "",
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || new Date().toISOString(),
  };
}

function mapTransaction(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    user_id: d.userId || "",
    catalog_id: d.catalogId || "",
    item_name: d.itemName || "",
    action: d.action || "",
    status: d.status || "",
    quantity: d.quantity || 0,
    returned_quantity: d.returnedQuantity || 0,
    quantity_remaining: d.quantityRemaining ?? null,
    school_id: d.schoolID || d.schoolId || "",
    first_name: d.firstName || "",
    last_name: d.lastName || "",
    course: d.course || "",
    year: d.year || "",
    email: d.email || "",
    equipment_course: d.equipment_course || "",
    assigned_admin_id: d.assigned_admin_id || "",
    approved_by: d.approvedBy || "",
    approved_at: d.approvedAt || null,
    borrowed_at: d.borrowedAt || null,
    returned_at: d.returnedAt || null,
    last_returned_at: d.lastReturnedAt || null,
    due_date: d.dueDate || null,
    timestamp: d.timestamp || null,
    reminder_sent: d.reminderSent || false,
    reminder_sent_at: d.reminderSentAt || null,
    original_transaction_id: d.originalTransactionId || "",
    returned_to: d.returnedTo || "",
    scan_code: d.scanCode || "",
    profile_url: d.profileURL || "",
    borrow_photo_url: d.borrowPhotoURL || "",
    return_photo_url: d.returnPhotoURL || "",
    condition_on_borrow: d.conditionOnBorrow || "",
    condition_on_return: d.conditionOnReturn || "",
    created_at: d.createdAt || new Date().toISOString(),
  };
}

function mapBorrowRequest(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    user_id: d.userId || "",
    school_id: d.schoolID || d.schoolId || "",
    first_name: d.firstName || "",
    last_name: d.lastName || "",
    course: d.course || "",
    year: d.year || "",
    email: d.email || "",
    role: d.role || "student",
    catalog_id: d.catalogId || "",
    item_name: d.itemName || "",
    quantity: d.quantity || 1,
    due_date: d.dueDate || null,
    purpose: d.purpose || "",
    status: d.status || "pending",
    target_course: d.targetCourse || "",
    equipment_course: d.equipment_course || "",
    equipment_category: d.equipment_category || "",
    assigned_admin_id: d.assigned_admin_id || "",
    assigned_admin_name: d.assigned_admin_name || "",
    reassignment_history: d.reassignment_history || [],
    reviewed_by: d.reviewedBy || "",
    reviewer_name: d.reviewerName || "",
    review_notes: d.reviewNotes || "",
    reviewed_at: d.reviewedAt || null,
    cancelled_at: d.cancelledAt || null,
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || new Date().toISOString(),
  };
}

function mapFine(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    user_id: d.userId || "",
    transaction_id: d.transactionId || "",
    item_name: d.itemName || "",
    days_overdue: d.daysOverdue || 0,
    fine_per_day: d.finePerDay || 0,
    total_fine: d.totalFine || 0,
    status: d.status || "pending",
    paid_at: d.paidAt || null,
    paid_by: d.paidBy || "",
    waived_by: d.waivedBy || "",
    waive_reason: d.waiveReason || "",
    waived_at: d.waivedAt || null,
    created_at: d.createdAt || new Date().toISOString(),
  };
}

function mapNotification(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    target_user_id: d.targetUserId || "",
    type: d.type || "info",
    title: d.title || "",
    message: d.message || "",
    read: d.read || false,
    read_at: d.readAt || null,
    dismissed_by: d.dismissedBy || [],
    link: d.link || "",
    created_at: d.createdAt || new Date().toISOString(),
  };
}

function mapDocument(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    name: d.name || "",
    category: d.category || "",
    type: d.type || "",
    size: d.size || "",
    file_url: d.fileUrl || "",
    created_at: d.createdAt || new Date().toISOString(),
  };
}

function mapManual(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    title: d.title || "",
    description: d.description || "",
    category: d.category || "",
    course: d.course || "",
    lab_room: d.labRoom || "",
    status: d.status || "Active",
    file_url: d.fileUrl || "",
    file_name: d.fileName || "",
    file_size: d.fileSize || null,
    file_type: d.fileType || "",
    thumbnail_url: d.thumbnailUrl || "",
    uploaded_by: d.uploadedBy || "",
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || null,
  };
}

function mapMaintenance(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    title: d.title || "",
    description: d.description || "",
    scheduled_date: d.scheduledDate || "",
    type: d.type || "",
    status: d.status || "pending",
    priority: d.priority || "medium",
    assigned_to: d.assignedTo || "",
    catalog_id: d.catalogId || "",
    item_name: d.itemName || "",
    photo_url: d.photoURL || "",
    college_building: d.collegeBuilding || "",
    location: d.location || "",
    findings: d.findings || "",
    recommendation: d.recommendation || "",
    materials_needed: d.materialsNeeded || "",
    estimated_days: d.estimatedDays || "",
    date_started: d.dateStarted || "",
    date_finished: d.dateFinished || "",
    remarks: d.remarks || "",
    inspected_by: d.inspectedBy || "",
    noted_by: d.notedBy || "",
    inspected_date: d.inspectedDate || "",
    assigned_personnel: d.assignedPersonnel || "",
    created_by: d.createdBy || "",
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || null,
  };
}

function mapIncident(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    title: d.title || "",
    category: d.category || "",
    type: d.type || "irregularity",
    description: d.description || "",
    severity: d.severity || "low",
    reported_by: d.reportedBy || "",
    reporter_name: d.reporterName || "",
    reporter_role: d.reporterRole || "student",
    status: d.status || "open",
    assigned_to: d.assignedTo || "",
    resolution: d.resolution || "",
    item_name: d.itemName || "",
    catalog_id: d.catalogId || "",
    photos: d.photos || [],
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || null,
  };
}

function mapSettings(doc) {
  const d = flattenDoc(doc);
  return {
    id: doc.id,
    email_notifications: d.emailNotifications !== false,
    auto_backup: d.autoBackup !== false,
    maintenance_mode: d.maintenanceMode || false,
    allow_student_registration: d.allowStudentRegistration !== false,
    require_password_change: d.requirePasswordChange || false,
    session_timeout: d.sessionTimeout || 30,
    max_login_attempts: d.maxLoginAttempts || 5,
    default_role: d.defaultRole || "Student",
    fine_per_day: d.finePerDay || 5,
    fine_restriction_threshold: d.fineRestrictionThreshold || 50,
    updated_at: d.updatedAt || new Date().toISOString(),
  };
}

function mapBackup(doc) {
  const d = flattenDoc(doc);
  return {
    id: doc.id,
    created_at: d.createdAt || new Date().toISOString(),
    total_documents: d.totalDocuments || 0,
    collections: d.collections || [],
    created_by: d.createdBy || "",
    type: d.type || "",
    imported: d.imported || null,
    skipped: d.skipped || null,
    overwrite: d.overwrite || null,
  };
}

function mapLabRoom(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    room_name: d.roomName || "",
    room_code: d.roomCode || "",
    qr_data: d.qrData || "",
    location: d.location || "",
    status: d.status || "active",
    created_at: d.createdAt || new Date().toISOString(),
  };
}

function mapAttendance(doc) {
  const d = flattenDoc(doc);
  return {
    id: d.id,
    student_school_id: d.studentSchoolId || "",
    user_id: d.userId || "",
    first_name: d.firstName || "",
    last_name: d.lastName || "",
    school_id: d.schoolId || "",
    course: d.course || "",
    year: d.year || "",
    section: d.section || "",
    subject: d.subject || "",
    professor: d.professor || "",
    lab_room: d.labRoom || "",
    room_code: d.roomCode || "",
    date: d.date || "",
    time_in: d.timeIn || null,
    time_out: d.timeOut || null,
    total_duration: d.totalDuration ?? null,
    status: d.status || "active",
    created_at: d.createdAt || new Date().toISOString(),
    updated_at: d.updatedAt || null,
  };
}

// --- Migration Tables ---
const COLLECTIONS = [
  { name: "catalog", map: mapCatalog, table: "catalog" },
  { name: "transactions", map: mapTransaction, table: "transactions" },
  { name: "borrowRequests", map: mapBorrowRequest, table: "borrow_requests" },
  { name: "fines", map: mapFine, table: "fines" },
  { name: "notifications", map: mapNotification, table: "notifications" },
  { name: "documents", map: mapDocument, table: "documents" },
  { name: "manuals", map: mapManual, table: "manuals" },
  { name: "maintenance", map: mapMaintenance, table: "maintenance" },
  { name: "incidents", map: mapIncident, table: "incidents" },
  { name: "settings", map: mapSettings, table: "settings" },
  { name: "backups", map: mapBackup, table: "backups" },
  { name: "labRooms", map: mapLabRoom, table: "lab_rooms" },
  { name: "labAttendance", map: mapAttendance, table: "lab_attendance" },
];

async function migrateCollection({ name, map, table }) {
  console.log(`\nMigrating: ${name} → ${table}`);

  const snap = await db.collection(name).get();
  if (snap.empty) {
    console.log(`  No documents in ${name}, skipping.`);
    return 0;
  }

  const docs = snap.docs.map(map);
  const BATCH_SIZE = 500;
  let migrated = 0;

  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = docs.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(batch, { onConflict: "id" });
    if (error) {
      console.error(`  Error inserting batch at offset ${i}:`, error.message);
    } else {
      migrated += batch.length;
      console.log(`  Migrated ${migrated}/${docs.length}`);
    }
  }

  console.log(`  Done: ${migrated} documents migrated.`);
  return migrated;
}

async function migrateSubcollections() {
  console.log("\nMigrating subcollections: users/{uid}/borrowed, users/{uid}/returned → transactions");

  const usersSnap = await db.collection("users").get();
  let subMigrated = 0;

  for (const userDoc of usersSnap.docs) {
    const borrowedSnap = await db.collection("users").doc(userDoc.id).collection("borrowed").get();
    for (const doc of borrowedSnap.docs) {
      const d = flattenDoc(doc);
      const record = {
        id: doc.id,
        user_id: userDoc.id,
        catalog_id: d.catalogId || "",
        item_name: d.itemName || "",
        action: "borrowed",
        status: d.status || "",
        quantity: d.quantity || 0,
        returned_quantity: d.returnedQuantity || 0,
        quantity_remaining: d.quantityRemaining ?? null,
        due_date: d.dueDate || null,
        timestamp: d.timestamp || null,
        created_at: d.timestamp || new Date().toISOString(),
      };

      const { error } = await supabase
        .from("transactions")
        .upsert(record, { onConflict: "id" });
      if (!error) subMigrated++;
    }

    const returnedSnap = await db.collection("users").doc(userDoc.id).collection("returned").get();
    for (const doc of returnedSnap.docs) {
      const d = flattenDoc(doc);
      const record = {
        id: doc.id,
        user_id: userDoc.id,
        catalog_id: d.catalogId || "",
        item_name: d.itemName || "",
        action: "returned",
        status: d.status || "",
        quantity: d.quantity || 0,
        original_transaction_id: d.originalTransactionId || "",
        timestamp: d.timestamp || null,
        created_at: d.timestamp || new Date().toISOString(),
      };

      const { error } = await supabase
        .from("transactions")
        .upsert(record, { onConflict: "id" });
      if (!error) subMigrated++;
    }
  }

  console.log(`  Done: ${subMigrated} subcollection records migrated.`);
  return subMigrated;
}

async function main() {
  console.log("=== Firestore → Supabase Migration ===\n");

  let totalMigrated = 0;

  for (const col of COLLECTIONS) {
    const count = await migrateCollection(col);
    totalMigrated += count;
  }

  const subCount = await migrateSubcollections();
  totalMigrated += subCount;

  console.log(`\n=== Migration Complete ===`);
  console.log(`Total records migrated: ${totalMigrated}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
