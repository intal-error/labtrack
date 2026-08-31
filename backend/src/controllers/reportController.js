const { db } = require("../config/firebase");
const ExcelJS = require("exceljs");

const TRANS = "transactions";
const CATALOG = "catalog";

function formatDate(value) {
  if (!value) return "";
  let date;
  if (typeof value?.toDate === "function") date = value.toDate();
  else if (value?.seconds) date = new Date(value.seconds * 1000);
  else if (value instanceof Date) date = value;
  else date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  let date;
  if (typeof value?.toDate === "function") date = value.toDate();
  else if (value?.seconds) date = new Date(value.seconds * 1000);
  else if (value instanceof Date) date = value;
  else date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function styleHeader(sheet, colCount) {
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 24;
  for (let i = 1; i <= colCount; i++) {
    const col = sheet.getColumn(i);
    col.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  }
}

function styleDataRows(sheet, colCount) {
  for (let r = 2; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    row.alignment = { vertical: "middle" };
    if (r % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F5" } };
    }
    for (let c = 1; c <= colCount; c++) {
      row.getCell(c).border = {
        top: { style: "thin", color: { argb: "FFEEEEEE" } },
        bottom: { style: "thin", color: { argb: "FFEEEEEE" } },
        left: { style: "thin", color: { argb: "FFEEEEEE" } },
        right: { style: "thin", color: { argb: "FFEEEEEE" } },
      };
    }
  }
}

function addTitle(sheet, title, colCount) {
  sheet.spliceRows(1, 0, []);
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF2E7D32" } };
  titleRow.height = 30;
  sheet.mergeCells(1, 1, 1, colCount);

  sheet.spliceRows(2, 0, []);
  const dateRow = sheet.getRow(2);
  dateRow.getCell(1).value = `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  dateRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  sheet.mergeCells(2, 1, 2, colCount);
}

const borrowedReport = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "borrowed").get();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Borrowed Transactions");

    const headers = ["Name", "School ID", "Course", "Item", "Quantity", "Borrowed Date", "Due Date", "Status"];
    const colWidths = [25, 15, 12, 30, 10, 18, 18, 14];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    snap.forEach((doc) => {
      const d = doc.data();
      const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "-";
      const status = d.status === "returned" ? "Returned" : "Borrowed";
      sheet.addRow([name, d.schoolID || "-", d.course || "-", d.itemName || "-", d.quantity || 0, formatDateTime(d.timestamp), formatDate(d.dueDate), status]);
    });

    addTitle(sheet, "Borrowed Transactions Report", headers.length);
    styleHeader(sheet, headers.length);
    styleDataRows(sheet, headers.length);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Borrowed_Report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const returnedReport = async (req, res) => {
  try {
    const snap = await db.collection(TRANS).where("action", "==", "returned").get();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Returned Transactions");

    const headers = ["Name", "School ID", "Course", "Item", "Quantity", "Borrowed Date", "Returned Date"];
    const colWidths = [25, 15, 12, 30, 10, 18, 18];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    snap.forEach((doc) => {
      const d = doc.data();
      const name = `${d.firstName || ""} ${d.lastName || ""}`.trim() || "-";
      sheet.addRow([name, d.schoolID || "-", d.course || "-", d.itemName || "-", d.quantity || 0, formatDateTime(d.timestamp), formatDateTime(d.returnedAt)]);
    });

    addTitle(sheet, "Returned Transactions Report", headers.length);
    styleHeader(sheet, headers.length);
    styleDataRows(sheet, headers.length);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Returned_Report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const catalogReport = async (req, res) => {
  try {
    const snap = await db.collection(CATALOG).get();
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Catalog Inventory");

    const headers = ["Item Name", "Category", "Course", "Total Qty", "Available Qty", "Condition", "Status"];
    const colWidths = [30, 14, 12, 12, 14, 14, 12];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    snap.forEach((doc) => {
      const d = doc.data();
      sheet.addRow([d.itemName || "-", d.category || "-", d.course || "-", d.quantity || 0, d.availableQuantity || 0, d.condition || "-", d.status || "-"]);
    });

    addTitle(sheet, "Catalog Inventory Report", headers.length);
    styleHeader(sheet, headers.length);
    styleDataRows(sheet, headers.length);

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=Catalog_Report.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

module.exports = { borrowedReport, returnedReport, catalogReport };
