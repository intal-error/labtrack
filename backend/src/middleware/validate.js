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
  course: z.string().max(50).trim().optional().default(""),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(10000),
  condition: z.string().min(1, "Condition is required").max(50).trim(),
  status: z.enum(["Available", "Borrowed"]).optional().default("Available"),
  imageUrl: z.string().url("Invalid image URL").max(500).trim().optional().default(""),
  barcode: z.string().max(100).trim().optional().default(""),
});

const borrowRequestSchema = z.object({
  itemId: z.string().min(1, "Catalog item is required").max(100).trim(),
  quantity: z.number().int().min(1, "Quantity must be at least 1").max(1000),
  dueDate: z.string().min(1, "Due date is required"),
  purpose: z.string().min(1, "Purpose is required").max(500).trim(),
  targetCourse: z.string().max(100).trim().optional(),
});

module.exports = {
  validate,
  registerSchema,
  adminCreateSchema,
  catalogCreateSchema,
  borrowRequestSchema,
};
