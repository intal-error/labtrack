// Verifies buildAttendanceQuery — the layer that turns the export dialog's
// selections into an /attendance/export query string.
//
// WHY THIS FILE EXISTS: on both attendance screens the dialog seeds Subject and
// Professor to the sentinel "All". buildAttendanceQuery guarded course, year and
// section against that sentinel but not subject/professor, so `subject=All` was
// sent on the DEFAULT path (no filter chosen). The backend's
// applyAttendanceFilters does `eqInsensitive(r.subject, "All")`, which is false
// for every real row, so the download succeeded, toasted "Report downloaded!"
// and contained `Total Records: 0`. Silent data loss.
//
// backend/tests/attendanceExport.verify.js could not catch it: it calls
// exportToExcel directly and never sets subject or professor in req.query.
//
// Run: node tests/exportReport.verify.js   (or: npm run verify -w frontend)

import { buildAttendanceQuery } from "../src/components/ui/exportReport.js";

let failures = 0;
function check(name, actual, expected) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  const ok = a === e;
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${a}\n        want ${e}`}`);
}

console.log("--- the regression: the sentinel must never reach the query string ---");
// Exactly what ExportDialog hands over when the admin changed nothing.
let q = buildAttendanceQuery({ course: "All", year: "All", section: "All", subject: "All", professor: "All", dateRange: "today" });
check("subject is omitted when 'All'", q.subject, undefined);
check("professor is omitted when 'All'", q.professor, undefined);
check("course is omitted when 'All'", q.course, undefined);
check("year is omitted when 'All'", q.year, undefined);
check("section is omitted when 'All'", q.section, undefined);
check("today still narrows by date", typeof q.date, "string");

console.log("--- a hidden field seeds to '', which must also be omitted ---");
q = buildAttendanceQuery({ subject: "", professor: "", dateRange: "today" });
check("empty subject omitted", q.subject, undefined);
check("empty professor omitted", q.professor, undefined);

console.log("--- absent keys are safe ---");
q = buildAttendanceQuery({ dateRange: "today" });
check("no subject/professor keys at all", Object.keys(q).filter((k) => k === "subject" || k === "professor"), []);

console.log("--- real selections DO reach the query string ---");
q = buildAttendanceQuery({ course: "BIT", year: "4th Year", section: "4B", subject: "Net 1", professor: "Dela Cruz", dateRange: "today" });
check("subject sent", q.subject, "Net 1");
check("professor sent", q.professor, "Dela Cruz");
check("course sent", q.course, "BIT");
check("year sent", q.year, "4th Year");
check("section sent", q.section, "4B");

console.log("--- room scoping must survive (server fails closed without it) ---");
q = buildAttendanceQuery({ roomId: "room-cet", subject: "All", professor: "All", dateRange: "today" });
check("roomId forwarded", q.roomId, "room-cet");
check("sentinel still omitted alongside roomId", q.subject, undefined);
q = buildAttendanceQuery({ roomCode: "CET-01", dateRange: "today" });
check("roomCode forwarded", q.roomCode, "CET-01");

console.log("--- date range branches ---");
check("all-time emits no bounds", Object.keys(buildAttendanceQuery({ dateRange: "all" })).filter((k) => k === "from" || k === "to"), []);
const custom = buildAttendanceQuery({ dateRange: "custom", dateFrom: "2026-09-01", dateTo: "2026-09-30" });
check("custom from", custom.from, "2026-09-01");
check("custom to", custom.to, "2026-09-30");
check("partial custom still forwards the bound given", buildAttendanceQuery({ dateRange: "custom", dateFrom: "2026-09-01" }).to, undefined);
const week = buildAttendanceQuery({ dateRange: "week" });
check("week emits from", typeof week.from, "string");
check("week emits to", typeof week.to, "string");

console.log("--- search maps to student ---");
check("search -> student", buildAttendanceQuery({ search: "23-000039", dateRange: "all" }).student, "23-000039");

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
