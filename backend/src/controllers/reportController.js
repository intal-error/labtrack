const { db } = require("../config/firebase");
const ExcelJS = require("exceljs");

const TRANS = "transactions";
const CATALOG = "catalog";

async function exportCollection(collectionName, sheetName, res, filename) {
  const snap = await db.collection(collectionName).get();
  const rows = [];
  snap.forEach((doc) => rows.push({ AutoID: doc.id, ...doc.data() }));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  if (rows.length === 0) {
    sheet.addRow(["No data"]);
  } else {
    const headers = Object.keys(rows[0]);
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(headers.map((h) => row[h] ?? "")));
  }

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename=${filename}`);
  await workbook.xlsx.write(res);
  res.end();
}

const borrowedReport = (req, res) => exportCollection(TRANS, "Borrowed", res, "Borrowed_Report.xlsx");
const returnedReport = (req, res) => exportCollection(TRANS, "Returned", res, "Returned_Report.xlsx");
const catalogReport = (req, res) => exportCollection(CATALOG, "Catalog", res, "Catalog_Report.xlsx");

module.exports = { borrowedReport, returnedReport, catalogReport };
