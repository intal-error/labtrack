import { useState } from "react";
import Modal from "./Modal";
import { COURSES, YEARS } from "../../constants/courses";
import { DATE_RANGE_OPTIONS } from "./exportReport";

const TABS = [
  { value: "borrowed", label: "Borrowed" },
  { value: "returned", label: "Returned" },
];

const ALL = "All";

function ExportDialog({ initialFilters, onClose, onExport, exporting, options }) {
  // Defaulted rather than assumed. `options` already had a guard; this one did
  // not, so a caller that omitted initialFilters threw a TypeError on
  // `filters.tab` during render rather than opening a usable dialog.
  const filters = initialFilters || {};

  const {
    typeTabs = TABS,
    showSection = false,
    showSubject = false,
    showProfessor = false,
    sectionOptions = [],
    subjectOptions = [],
    professorOptions = [],
    courseOptions,
    yearOptions,
  } = options || {};

  const [tab, setTab] = useState(() => filters.tab ?? typeTabs[0]?.value ?? "borrowed");
  const [course, setCourse] = useState(() => filters.course ?? ALL);
  const [year, setYear] = useState(() => filters.year ?? ALL);
  const [section, setSection] = useState(() => filters.section ?? ALL);
  // Seeded to "" rather than ALL when the field is hidden, so a caller that
  // never renders Subject/Professor can never hand the sentinel downstream.
  // buildAttendanceQuery omits empty values, so "" and "unset" behave the same.
  const [subject, setSubject] = useState(() => (showSubject ? filters.subject ?? ALL : ""));
  const [professor, setProfessor] = useState(() => (showProfessor ? filters.professor ?? ALL : ""));
  const [dateRange, setDateRange] = useState(() => filters.dateRange ?? "all");
  const [dateFrom, setDateFrom] = useState(() => filters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(() => filters.dateTo ?? "");

  const isCustom = dateRange === "custom";
  const courses = courseOptions ?? COURSES;
  const years = yearOptions ?? YEARS;

  return (
    <Modal title="Download Report" onClose={onClose}>
      <div className="export-modal">
        <p className="export-modal-hint">
          Choose which records to include in the Excel file.
        </p>

        {typeTabs.length > 0 && (
          <div className="export-modal-field">
            <span className="export-modal-label">Report Type</span>
            <div className="export-modal-tabs" role="group" aria-label="Report type">
              {typeTabs.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`export-modal-tab${tab === t.value ? " active" : ""}`}
                  onClick={() => setTab(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="export-modal-row">
          <div className="export-modal-field">
            <label className="export-modal-label" htmlFor="export-course">Course</label>
            <select id="export-course" className="export-modal-select" value={course} onChange={(e) => setCourse(e.target.value)}>
              <option value={ALL}>All Courses</option>
              {courses.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="export-modal-field">
            <label className="export-modal-label" htmlFor="export-year">Year</label>
            <select id="export-year" className="export-modal-select" value={year} onChange={(e) => setYear(e.target.value)}>
              <option value={ALL}>All Years</option>
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {showSection && (
          <div className="export-modal-field">
            <label className="export-modal-label" htmlFor="export-section">Section</label>
            <select id="export-section" className="export-modal-select" value={section} onChange={(e) => setSection(e.target.value)}>
              <option value={ALL}>All Sections</option>
              {sectionOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {/* Subject and Professor are opt-in because buildAttendanceQuery and the
            export endpoint both already honour them, but ExportDialog never
            collected them — so a Subject filter applied on the table was silently
            dropped from the download. TransactionsPage passes neither flag and is
            unaffected. */}
        {showSubject && (
          <div className="export-modal-field">
            <label className="export-modal-label" htmlFor="export-subject">Subject</label>
            <select id="export-subject" className="export-modal-select" value={subject} onChange={(e) => setSubject(e.target.value)}>
              <option value={ALL}>All Subjects</option>
              {subjectOptions.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        {showProfessor && (
          <div className="export-modal-field">
            <label className="export-modal-label" htmlFor="export-professor">Professor</label>
            <select id="export-professor" className="export-modal-select" value={professor} onChange={(e) => setProfessor(e.target.value)}>
              <option value={ALL}>All Professors</option>
              {professorOptions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        <div className="export-modal-field">
          <label className="export-modal-label" htmlFor="export-range">Date Range</label>
          <select id="export-range" className="export-modal-select" value={dateRange} onChange={(e) => setDateRange(e.target.value)}>
            {DATE_RANGE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </div>

        {isCustom && (
          <div className="export-modal-row">
            <div className="export-modal-field">
              <label className="export-modal-label" htmlFor="export-from">From</label>
              <input
                id="export-from"
                type="date"
                className="export-modal-select"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="export-modal-field">
              <label className="export-modal-label" htmlFor="export-to">To</label>
              <input
                id="export-to"
                type="date"
                className="export-modal-select"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
        )}

        {filters.search && (
          <p className="export-modal-note">
            Also filtered by search: <strong>{filters.search}</strong>
          </p>
        )}

        <div className="export-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={exporting}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={exporting}
            onClick={() => onExport({
              tab,
              course,
              year,
              section,
              subject,
              professor,
              dateRange,
              dateFrom,
              dateTo,
              search: filters.search,
              sort: filters.sort,
            })}
          >
            {exporting ? "Preparing..." : "Download XLSX"}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function ExportReportModal({ open, onClose, initialFilters, onExport, exporting, options }) {
  if (!open) return null;
  return (
    <ExportDialog
      initialFilters={initialFilters}
      onClose={onClose}
      onExport={onExport}
      exporting={exporting}
      options={options}
    />
  );
}
