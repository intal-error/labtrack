const { z } = require("zod");

const validate = (schema) => {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const issues = result.error.issues || result.error.errors || [];
      const errors = issues.map((e) => `${e.path.join(".")}: ${e.message}`);
      return res.status(400).json({ error: "Validation failed", details: errors });
    }
    req.body = result.data;
    next();
  };
};

const registerSchema = z.object({
  role: z.literal("student"),
  firstName: z.string().min(1, "First name is required").max(100).trim(),
  lastName: z.string().min(1, "Last name is required").max(100).trim(),
  email: z.string().email("Invalid email format").max(255).trim(),
  password: z.string().min(6, "Password must be at least 6 characters").max(128),
  schoolId: z.string().min(1, "School ID is required").max(50).trim(),
  course: z.string().min(1, "Course is required").max(50).trim(),
  year: z.string().min(1, "Year is required").max(10).trim(),
  section: z.string().min(1, "Section is required").max(10).trim(),
  contact: z.string().max(20).trim().optional().default(""),
});

const adminCreateSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100).trim(),
  lastName: z.string().min(1, "Last name is required").max(100).trim(),
  email: z.string().email("Invalid email format").max(255).trim(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128)
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number"),
  contact: z.string().max(20).trim().optional().default(""),
  position: z.string().max(100).trim().optional().default(""),
  assignedCourse: z.string().max(50).trim().optional().default(""),
  assignedCourses: z.array(z.string()).optional().default([]),
  assignedYear: z.string().max(10).trim().optional().default(""),
  permissions: z.array(z.string()).optional().default(["view_catalog", "manage_catalog", "view_transactions", "view_requests", "process_requests"]),
});

const catalogCreateSchema = z.object({
  itemName: z.string().min(1, "Item name is required").max(200).trim(),
  category: z.string().min(1, "Category is required").max(100).trim(),
  course: z.string().min(1, "Course is required").max(50).trim(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10000),
  condition: z.string().min(1, "Condition is required").max(50).trim(),
  status: z.enum(["Available", "Borrowed"]).optional().default("Available"),
  imageUrl: z.string().url("Invalid image URL").max(500).trim().optional().default(""),
  barcode: z.string().max(100).trim().optional().default(""),
  // Was missing here, so zod stripped it on every create (the controller reads
  // data.assetTag at line 132). Update has no schema, which is why the field
  // appeared to save there but silently vanished here.
  assetTag: z.string().max(100).trim().optional().default(""),
});

const borrowRequestSchema = z.object({
  itemId: z.string().min(1, "Catalog item is required").max(100).trim(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(1000),
  dueDate: z.string().min(1, "Due date is required"),
  purpose: z.string().min(1, "Purpose is required").max(500).trim(),
  targetCourse: z.string().max(100).trim().optional(),
});

// Incident reports are filed by students against a borrowed item, so the item is
// required rather than optional. Reporter identity, course, item name and item
// course are deliberately ABSENT: they are resolved server-side from Firestore
// and the catalog table. Leaving them out also means zod strips any client that
// tries to send them, which is how reporterName/itemName ended up forgeable
// before (incidentController trusted req.body for both).
const incidentCreateSchema = z.object({
  catalogId: z.string().min(1, "Select the item involved").max(100).trim(),
  incidentDate: z
    .string()
    .min(1, "Date of incident is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be a calendar date")
    // Compares the START of the selected day against now, not the end.
    //
    // This previously parsed `T23:59:59` and required that instant to be in the
    // past, which rejects TODAY for the entire day — and today is the value the
    // form pre-fills. Every report submitted on its default date failed with a
    // bare "Validation failed"; backdating by one day "worked", so it read as an
    // odd validation rule rather than a total breakage.
    //
    // Start-of-day gives the intended semantics: a report about today is always
    // valid, tomorrow is not. A bare YYYY-MM-DD with no offset is parsed as
    // local time by `new Date`, which is also how the browser interprets
    // <input type="date">, so the two ends of the check agree on the calendar
    // day without needing a second copy of "what is today" that could drift
    // from the client's.
    .refine((value) => {
      const startOfDay = new Date(`${value}T00:00:00`);
      return !Number.isNaN(startOfDay.getTime()) && startOfDay.getTime() <= Date.now();
    }, "Date cannot be in the future"),
  type: z.enum(["damage", "lost", "malfunction", "other"], {
    error: "Choose what happened to the item",
  }),
  severity: z.enum(["low", "medium", "high", "critical"], {
    error: "Choose how serious this is",
  }),
  description: z
    .string()
    .min(20, "Describe what happened in at least 20 characters")
    .max(4000, "Description is too long")
    .trim(),
  photos: z.array(z.string().max(500)).max(3, "Maximum 3 photos").optional().default([]),
});

module.exports = {
  validate,
  registerSchema,
  adminCreateSchema,
  catalogCreateSchema,
  borrowRequestSchema,
  incidentCreateSchema,
};
