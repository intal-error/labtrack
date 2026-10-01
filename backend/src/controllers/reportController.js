const { supabase } = require("../config/supabase");
const { queryTransactions } = require("../utils/transactionFilters");
const { slug } = require("../utils/exportUtils");
const ExcelJS = require("exceljs");

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function styleHeader(sheet, colCount, headerRow = 3) {
  const row = sheet.getRow(headerRow);
  row.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2E7D32" } };
  row.alignment = { horizontal: "center", vertical: "middle" };
  row.height = 24;
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

function styleDataRows(sheet, colCount, startRow = 4) {
  for (let r = startRow; r <= sheet.rowCount; r++) {
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

function addTitle(sheet, title, colCount, subtitle = "") {
  sheet.spliceRows(1, 0, []);
  const titleRow = sheet.getRow(1);
  titleRow.getCell(1).value = title;
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FF2E7D32" } };
  titleRow.height = 30;
  sheet.mergeCells(1, 1, 1, colCount);

  sheet.spliceRows(2, 0, []);
  const dateRow = sheet.getRow(2);
  const generated = `Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
  dateRow.getCell(1).value = subtitle ? `${subtitle} | ${generated}` : generated;
  dateRow.getCell(1).font = { italic: true, size: 9, color: { argb: "FF888888" } };
  sheet.mergeCells(2, 1, 2, colCount);
}

function addSummaryRow(sheet, colCount, total) {
  sheet.addRow([]);
  const summaryRow = sheet.addRow(["", `Total Records: ${total}`, ...Array(Math.max(0, colCount - 2)).fill("")]);
  summaryRow.font = { bold: true, size: 10 };
}

/** Human-readable description of the filters applied, shown under the sheet title. */
function describeFilters(query) {
  const parts = [];
  if (query.course) parts.push(`Course: ${query.course}`);
  if (query.year) parts.push(`Year: ${query.year}`);
  if (query.dateFrom || query.dateTo) {
    const from = query.dateFrom ? formatDate(query.dateFrom) : "N/A";
    const to = query.dateTo ? formatDate(query.dateTo) : "N/A";
    parts.push(`From: ${from} To: ${to}`);
  } else {
    parts.push("All Time");
  }
  if (query.search) parts.push(`Search: "${query.search}"`);
  return parts.join(" | ");
}

const buildTransactionsExport = async (req, res, action) => {
  const isReturned = action === "returned";
  try {
    const rows = await queryTransactions(action, req.query);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(isReturned ? "Returned Transactions" : "Borrowed Transactions");

    const headers = isReturned
      ? ["Name", "School ID", "Course", "Year", "Equipment Course", "Item", "Quantity", "Borrowed Date", "Returned Date", "Status"]
      : ["Name", "School ID", "Course", "Year", "Equipment Course", "Item", "Quantity", "Borrowed Date", "Due Date", "Status"];
    const colWidths = [25, 15, 10, 11, 17, 30, 10, 18, 18, 14];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    rows.forEach((d) => {
      const name = `${d.first_name || ""} ${d.last_name || ""}`.trim() || "-";
      const borrowedAt = d.borrowed_at || d.timestamp;
      const base = [
        name,
        d.school_id || "-",
        d.course || "-",
        d.year || "-",
        d.equipment_course || "-",
        d.item_name || "-",
        d.quantity || 0,
        formatDateTime(borrowedAt),
      ];
      if (isReturned) {
        const returnedAt = d.returned_at || d.timestamp;
        base.push(formatDateTime(returnedAt), "Returned");
      } else {
        base.push(formatDate(d.due_date), d.status === "returned" ? "Returned" : "Borrowed");
      }
      sheet.addRow(base);
    });

    const label = isReturned ? "Returned" : "Borrowed";
    addTitle(sheet, `${label} Transactions Report`, headers.length, describeFilters(req.query));
    styleHeader(sheet, headers.length);
    styleDataRows(sheet, headers.length);
    addSummaryRow(sheet, headers.length, rows.length);

    const suffix = [label, slug(req.query.course), slug(req.query.year)].filter(Boolean).join("_");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=Transactions_${suffix}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === "production" ? "Internal server error" : err.message });
  }
};

const borrowedReport = async (req, res) => buildTransactionsExport(req, res, "borrowed");

const returnedReport = async (req, res) => buildTransactionsExport(req, res, "returned");

const catalogReport = async (req, res) => {
  try {
    const { data: catalog, error } = await supabase
      .from("catalog")
      .select("*");

    if (error) throw error;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Catalog Inventory");

    const headers = ["Item Name", "Category", "Course", "Total Qty", "Available Qty", "Condition", "Status"];
    const colWidths = [30, 14, 12, 12, 14, 14, 12];
    sheet.columns = headers.map((h, i) => ({ header: h, width: colWidths[i] }));

    (catalog || []).forEach((d) => {
      sheet.addRow([d.item_name || "-", d.category || "-", d.course || "-", d.quantity || 0, d.available_quantity || 0, d.condition || "-", d.status || "-"]);
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
