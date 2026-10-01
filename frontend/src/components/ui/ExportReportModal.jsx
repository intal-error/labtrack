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
  const {
    typeTabs = TABS,
    showSection = false,
    sectionOptions = [],
    courseOptions,
    yearOptions,
  } = options || {};

  const [tab, setTab] = useState(() => initialFilters.tab ?? typeTabs[0]?.value ?? "borrowed");
  const [course, setCourse] = useState(() => initialFilters.course ?? ALL);
  const [year, setYear] = useState(() => initialFilters.year ?? ALL);
  const [section, setSection] = useState(() => initialFilters.section ?? ALL);
  const [dateRange, setDateRange] = useState(() => initialFilters.dateRange ?? "all");
  const [dateFrom, setDateFrom] = useState(() => initialFilters.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(() => initialFilters.dateTo ?? "");

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

        {initialFilters.search && (
          <p className="export-modal-note">
            Also filtered by search: <strong>{initialFilters.search}</strong>
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
              dateRange,
              dateFrom,
              dateTo,
              search: initialFilters.search,
              sort: initialFilters.sort,
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
