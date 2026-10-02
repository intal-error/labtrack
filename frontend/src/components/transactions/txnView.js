import { toDate, getRemainingQuantity, getOverdueInfo } from "../../utils/helpers";

/**
 * Normalises the several shapes a transaction arrives in (admin rows, the
 * student's own rows, and a borrow *request*) into one object the presentational
 * components can render without caring where it came from.
 *
 * `mode`: "borrowed" | "returned" — which dataset this row belongs to.
 */
export function toTxnView(item, mode) {
  const isBorrowed = mode === "borrowed";
  const fullName = `${item.firstName || ""} ${item.lastName || ""}`.trim();
  const borrowedAt = toDate(item.borrowedAt || item.borrowed_at || item.timestamp);
  const dueDate = toDate(item.dueDate || item.due_date);
  const returnedAt = toDate(item.returnedAt || item.returned_at || item.lastReturnedAt || (isBorrowed ? null : item.timestamp));
  const total = Number(item.quantity) || 0;
  const remaining = isBorrowed ? getRemainingQuantity(item) : null;

  return {
    id: item.id,
    raw: item,
    isBorrowed,
    fullName,
    schoolId: item.schoolId || item.school_id || "",
    profileURL: item.profileURL || item.profileUrl || "",
    course: item.course || "",
    year: item.year || "",
    itemName: item.itemName || item.item_name || "",
    equipmentCourse: item.equipment_course || "",
    total,
    remaining,
    borrowedAt,
    dueDate,
    returnedAt,
    // Only meaningful while a loan is open.
    overdue: isBorrowed ? getOverdueInfo(dueDate) : null,
    email: item.email || "",
    role: item.role || "",
    conditionOnBorrow: item.conditionOnBorrow || item.condition_on_borrow || "",
    conditionOnReturn: item.conditionOnReturn || item.condition_on_return || "",
    borrowPhotoURL: item.borrowPhotoURL || item.borrow_photo_url || "",
    returnPhotoURL: item.returnPhotoURL || item.return_photo_url || "",
  };
}