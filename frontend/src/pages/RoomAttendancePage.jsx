import { useCallback, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  MdArrowBack,
  MdSearch,
  MdFileDownload,
  MdMeetingRoom,
  MdLocationOn,
  MdErrorOutline,
  MdRefresh,
  MdWarning,
  MdEventNote,
  MdEdit,
  MdDelete,
} from "react-icons/md";
import { api } from "../services/api";
import { formatDuration, formatTime, pruneFilters } from "../utils/attendanceHelpers";
import { fmtDate } from "../utils/helpers";
import {
  useAttendanceRooms,
  useDeleteAttendance,
  useRoomAttendanceHistory,
  useUpdateAttendance,
} from "../hooks/useQueries";
import useDebouncedValue from "../hooks/useDebouncedValue";
import useRowMenu from "../hooks/useRowMenu";
import { SkeletonRegion, SkeletonRows } from "../components/ui/Skeleton";
import AttendanceFilterSelect from "../components/attendance/AttendanceFilterSelect";
import RowActions from "../components/attendance/RowActions";
import ExportReportModal from "../components/ui/ExportReportModal";
import { buildAttendanceQuery } from "../components/ui/exportReport";
import Modal from "../components/ui/Modal";
import Pagination from "../components/ui/Pagination";
import StatStrip from "../components/ui/StatStrip";
import toast from "react-hot-toast";
import "../styles/pages/attendance-ui.css";
import "../styles/pages/attendance-room.css";

const DASH = "\u2014";
const PAGE_SIZE = 50;
const NO_FILTER = Object.freeze({ search: "", from: "", to: "", year: "", course: "", section: "", subject: "", professor: "" });

// The backend writes exactly two statuses: "active" (still inside,
// total_duration null) and "timed_out" (the kiosk signed them out,
// total_duration set) — see attendanceController.js timeIn/timeOut/autoScan.
// Anything else maps to the completed state rather than falling through to the
// "Inside" pill, so a future status value can never be misread as somebody
// currently in the room.
function statusMeta(status) {
  return status === "active" ? { key: "active", label: "Inside" } : { key: "done", label: "Signed Out" };
}

function fullName(record) {
  return [record.firstName, record.lastName].filter(Boolean).join(" ") || DASH;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* The `date` column holds a CALENDAR day ("2026-10-01"), not an instant.
   `new Date("2026-10-01")` is specified to parse as UTC midnight, so passing it
   to toLocaleDateString renders the PREVIOUS day in every timezone behind UTC -
   an off-by-one on an attendance logbook, and the kind of bug that only
   shows up for users outside the author's own offset. Reading the components
   off the string keeps the day the backend actually stored. Anything that is
   not an ISO calendar day falls back to the shared helper. */
function fmtCalendarDay(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return value ? fmtDate(value) : DASH;
  const [, year, month, day] = match;
  return `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
}

function PanelMessage({ icon: Icon, title, message, action, error = false }) {
  return (
    <div className={`au-empty${error ? " au-empty--error" : ""}`}>
      <span className="au-empty-icon">
        <Icon size={24} />
      </span>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      {action}
    </div>
  );
}

export default function RoomAttendancePage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [filters, setFilters] = useState(NO_FILTER);
  const [page, setPage] = useState(1);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Edit dialog state. Kept here rather than in a child so the Escape handler
  // can dismiss the dialog and the row popup with one key.
  const [editRecord, setEditRecord] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editProfessor, setEditProfessor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const closeEdit = useCallback(() => setEditRecord(null), []);
  const [openRowMenu, rowMenu] = useRowMenu({ containerClass: "au-kebab", onEscape: closeEdit });

  // The search box is the one control that changes on every keystroke, and the
  // endpoint does a .select("*") on the whole table before filtering in JS — so
  // it is debounced rather than fired per character. roomId is the reset key so
  // switching rooms discards a term typed for the previous room instead of
  // filtering the new room with it.
  const debouncedSearch = useDebouncedValue(filters.search, 300, roomId);

  const setFilter = useCallback((key) => (value) => {
    // The page number is NOT reset here on purpose: it is clamped against
    // totalPages during render below, which covers both this case and a filter
    // change without an extra render per keystroke.
    setFilters((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const clearFilters = useCallback(() => setFilters(NO_FILTER), []);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (debouncedSearch) p.set("student", debouncedSearch);
    if (filters.from) p.set("from", filters.from);
    if (filters.to) p.set("to", filters.to);
    if (filters.year) p.set("year", filters.year);
    if (filters.course) p.set("course", filters.course);
    if (filters.section) p.set("section", filters.section);
    if (filters.subject) p.set("subject", filters.subject);
    if (filters.professor) p.set("professor", filters.professor);
    p.set("page", String(page));
    p.set("limit", String(PAGE_SIZE));
    return p.toString();
  }, [debouncedSearch, filters, page]);

  const { data, isPending, isFetching, isError, refetch } = useRoomAttendanceHistory(roomId, params);

  // Both mutations invalidate the "attendance" and "roomAttendance" prefixes, so
  // an edit made here refreshes this table's rows AND the aggregates above it.
  const updateAttendance = useUpdateAttendance();
  const deleteAttendance = useDeleteAttendance();

  // Room metadata for the hero chips. The history response carries roomName but
  // not location or status, and it is only refetched with the filters — so the
  // room list is the right source and react-query keeps it cached.
  const { data: roomsData } = useAttendanceRooms();
  const room = useMemo(() => (roomsData || []).find((r) => r.id === roomId) || null, [roomsData, roomId]);

  const records = useMemo(() => (Array.isArray(data?.records) ? data.records : []), [data]);
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const stats = data?.stats;

  // Normalised rather than read straight off `data`: a response cached before the
  // professor facet shipped has no `professors` key, and one unguarded `.length`
  // on it would throw during render.
  const facets = useMemo(
    () => ({
      years: data?.years ?? [],
      courses: data?.courses ?? [],
      sections: data?.sections ?? [],
      subjects: data?.subjects ?? [],
      professors: data?.professors ?? [],
    }),
    [data]
  );

const roomName = data?.roomName || room?.roomName || "Room Attendance";

  // Clamp page to the available range, reset when the route points at a
  // different room, and drop filters whose value no longer exists in the facet
  // list. All three are the documented "adjust state during render" pattern
  // rather than effects: react-hooks flags a synchronous setState inside an
  // effect body as a cascading render, and the old version of this page already
  // called six setState functions mid-render.
  //
  // The clamp self-corrects when a filter shrinks the result set under the
  // current page number, which no amount of resetting on filter change would
  // reliably catch. It costs one throwaway request in that case - the page is
  // only known to be out of range once the filtered total has come back - but
  // it settles in a single follow-up rather than looping.
  //
  // The prune must live HERE rather than in a memo feeding `params`: pruning
  // needs the facet lists, which arrive with the response, which is itself
  // produced by the query those params build. Deriving instead would be a cycle.
  const clampedPage = Math.min(Math.max(1, page), Math.max(1, totalPages));

  /*
   * Memoised, and the memo is what makes the identity check below meaningful.
   *
   * pruneFilters walked Object.entries(facets) and, for every non-empty filter value,
   * did a .map() over the whole facet array converting each entry with String(v).
   * Facets come from the entire room's history, so that is O(total facet entries) --
   * in the render body, on every keystroke in the search box, every page change, and
   * every 30s data refresh.
   *
   * The memo also returns the SAME object when nothing was pruned (attendanceHelpers
   * returns `filters` unchanged in that case), which is what lets the `pruned !==
   * filters` comparison below stay a valid identity test.
   */
  const pruned = useMemo(
    () =>
      pruneFilters(filters, {
        year: facets.years,
        course: facets.courses,
        section: facets.sections,
        subject: facets.subjects,
        professor: facets.professors,
      }),
    [filters, facets]
  );
  const [prevRoomId, setPrevRoomId] = useState(roomId);
  const [prevTotalPages, setPrevTotalPages] = useState(totalPages);
  if (prevRoomId !== roomId) {
    setPrevRoomId(roomId);
    setFilters(NO_FILTER);
    setPage(1);
  } else if (prevTotalPages !== totalPages) {
    setPrevTotalPages(totalPages);
    if (clampedPage !== page) setPage(clampedPage);
  } else if (pruned !== filters) {
    // A value disappeared from its facet list -- e.g. its last record was
    // deleted. Clearing it here stops the query narrowing on something the
    // dropdown can no longer show, which otherwise reads as "All Sections"
    // above a table still filtered by 4B.
    setFilters(pruned);
  }

  // Derived from activeFilters, not filters: a pruned value must not keep the
  // "Clear Filters" button lit once it no longer affects anything.
  const hasFilters = Boolean(
    filters.search ||
      filters.from ||
      filters.to ||
      filters.year ||
      filters.course ||
      filters.section ||
      filters.subject ||
      filters.professor
  );
  // A range the user can reach by typing, since min/max only constrain the
  // picker. Left unflagged it silently returns zero rows.
  const invertedRange = Boolean(filters.from && filters.to && filters.from > filters.to);

  async function handleExport(draft) {
    setExporting(true);
    try {
      const query = buildAttendanceQuery({
        ...draft,
        // Always scoped to this room, whatever the dialog shows.
        roomId,
      });
      const qs = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      await api.exportAttendance(qs);
      setExportOpen(false);
      toast.success("Report downloaded!");
    } catch (err) {
      toast.error(err.message || "Download failed");
    } finally {
      setExporting(false);
    }
  }

  function resetAll() {
    clearFilters();
    setPage(1);
  }

  function openEdit(record) {
    rowMenu.close();
    setEditRecord(record);
    setEditSubject(record.subject || "");
    setEditProfessor(record.professor || "");
  }

  async function saveEdit() {
    if (!editRecord) return;
    setSavingEdit(true);
    try {
      await updateAttendance.mutateAsync({
        id: editRecord.id,
        data: { subject: editSubject, professor: editProfessor },
      });
      toast.success("Record updated");
      setEditRecord(null);
    } catch (err) {
      toast.error(err.message || "Failed to update");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(id) {
    rowMenu.close();
    // Named in the prompt because this is the room's permanent history, not a
    // day's log — an unnamed "are you sure?" is too easy to wave through.
    if (!window.confirm("Delete this attendance record? It will be removed from this room's history and cannot be restored.")) return;
    try {
      await deleteAttendance.mutateAsync(id);
      toast.success("Record deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  }

  return (
    <section className="au-page">
      <header className="rh-hero">
        <div className="rh-hero-main">
          <button type="button" className="rh-back" onClick={() => navigate("/attendance?tab=roomLogs")} aria-label="Back to room logs">
            <MdArrowBack size={19} />
          </button>
          <div className="rh-hero-text">
            <h1>
              <MdMeetingRoom size={22} />
              {roomName}
            </h1>
            <p className="rh-hero-sub">Attendance history for this laboratory room</p>
            <div className="rh-hero-meta">
              {room?.location && (
                <span className="rh-chip">
                  <MdLocationOn size={11} />
                  {room.location}
                </span>
              )}
              {room?.status && (
                <span className="rh-chip rh-chip--muted">
                  {room.status === "active" ? "Active" : room.status}
                </span>
              )}
            </div>
          </div>

          {stats && (
            <span className={`rh-occupancy${stats.activeNow > 0 ? " rh-occupancy--live" : ""}`}>
              <span className="rh-occupancy-dot" />
              {stats.activeNow > 0
                ? `${stats.activeNow} inside now`
                : "Nobody inside right now"}
            </span>
          )}
        </div>
      </header>

      {/* Aggregates cover the whole FILTERED set, not the page on screen — the
          backend computes them from every matching row. */}
      <StatStrip
        variant="stack"
        items={[
          { label: "Sessions", value: total },
          { label: "Unique Students", value: stats?.uniqueStudents ?? 0 },
          { label: "Hours Logged", value: formatDuration(stats?.totalMinutes ?? 0) },
          { label: "Avg Session", value: formatDuration(stats?.avgMinutes ?? 0) },
        ]}
      />

      <div className="au-toolbar">
        <div className="au-search">
          <MdSearch size={16} />
          <input
            type="search"
            className="au-search-input"
            placeholder="Search student name or ID..."
            aria-label="Search student name or ID"
            value={filters.search}
            onChange={(e) => setFilter("search")(e.target.value)}
          />
        </div>

        <div className="au-date">
          <label className="au-date-label" htmlFor="rh-from">
            From
          </label>
          <input
            id="rh-from"
            type="date"
            value={filters.from}
            max={filters.to || undefined}
            onChange={(e) => setFilter("from")(e.target.value)}
          />
        </div>

        <div className="au-date">
          <label className="au-date-label" htmlFor="rh-to">
            To
          </label>
          <input
            id="rh-to"
            type="date"
            value={filters.to}
            min={filters.from || undefined}
            onChange={(e) => setFilter("to")(e.target.value)}
          />
        </div>

        {/* Always rendered, never conditionally: these facets are computed from
            THIS room's records only, so on a room with no history they came back
            empty and the guards dropped four controls from the toolbar — the row
            changed shape as you moved between rooms. They now render disabled and
            read "None in this room" instead. */}
        <AttendanceFilterSelect
          label="Year"
          allLabel="All Years"
          emptyLabel="None in this room"
          value={filters.year}
          onChange={setFilter("year")}
          options={facets.years}
        />
        <AttendanceFilterSelect
          label="Course"
          allLabel="All Courses"
          emptyLabel="None in this room"
          value={filters.course}
          onChange={setFilter("course")}
          options={facets.courses}
        />
        <AttendanceFilterSelect
          label="Section"
          allLabel="All Sections"
          emptyLabel="None in this room"
          value={filters.section}
          onChange={setFilter("section")}
          options={facets.sections}
        />
        <AttendanceFilterSelect
          label="Subject"
          allLabel="All Subjects"
          emptyLabel="None in this room"
          value={filters.subject}
          onChange={setFilter("subject")}
          options={facets.subjects}
        />
        <AttendanceFilterSelect
          label="Professor"
          allLabel="All Professors"
          emptyLabel="None in this room"
          value={filters.professor}
          onChange={setFilter("professor")}
          options={facets.professors}
        />

        {hasFilters && (
          <button type="button" className="btn btn-outline" onClick={resetAll}>
            Clear Filters
          </button>
        )}
        {invertedRange && (
          <span className="au-range-warning">
            <MdWarning size={13} />
            Start date is after end date
          </span>
        )}

        <div className="au-toolbar-tail">
          <span className="au-count">
            {total} session{total !== 1 ? "s" : ""}
          </span>
          <Pagination
            compact
            /* 5, not the default 7: this instance sits inside a toolbar that
               already holds search + two date fields + four selects, and a
               7-wide window pushed the whole row to wrap. */
            maxVisible={5}
            currentPage={clampedPage}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
          />
        </div>

        <div className="au-toolbar-actions">
          <button type="button" className="btn btn-green" onClick={() => setExportOpen(true)} disabled={isError}>
            <MdFileDownload size={15} /> Download Report
          </button>
        </div>
      </div>

      <div className="au-results">
        {/* isPending, not isFetching: with keepPreviousData the first paint is
            the only moment the two differ, and isPending is the one that means
            "no data at all yet". Without this the panel would flash
            "No attendance recorded yet" before the first response landed and
            then swap to the table. */}
        {isPending ? (
          // Table-shaped skeleton rather than a spinner. This panel is normally 50
          // rows tall; the spinner collapsed it to a few lines and then expanded it,
          // which reflowed the whole page on every room switch.
          <SkeletonRegion label={`Loading attendance history for ${roomName || "this room"}`}>
            <div className="au-table-wrap">
              <table className="au-table">
                <tbody>
                  <SkeletonRows rows={12} columns={6} />
                </tbody>
              </table>
            </div>
          </SkeletonRegion>
        ) : isError ? (
          <PanelMessage
            error
            icon={MdErrorOutline}
            title="Couldn't load this room's history"
            message="The server didn't respond. Check the backend is running, then try again."
            action={
              <button type="button" className="btn btn-green" onClick={refetch}>
                <MdRefresh size={15} /> Try again
              </button>
            }
          />
        ) : records.length === 0 ? (
          <PanelMessage
            icon={invertedRange ? MdWarning : MdEventNote}
            title={
              invertedRange
                ? "That date range is empty"
                : hasFilters
                  ? "No records match these filters"
                  : "No attendance recorded yet"
            }
            message={
              invertedRange
                ? "The start date is later than the end date, so nothing can match. Swap them or clear the range."
                : hasFilters
                  ? "Try clearing a filter, or widen the range to include more days."
                  : "Sessions appear here as soon as students start scanning in at this room's kiosk."
            }
            action={
              hasFilters ? (
                <button type="button" className="btn btn-outline" onClick={resetAll}>
                  Clear filters
                </button>
              ) : null
            }
          />
        ) : (
          <div className={`au-table-wrap${isFetching ? " au-results--busy" : ""}`}>
            <table className="au-table">
              <thead>
                <tr>
                  <th scope="col" className="au-th-student">Student</th>
                  <th scope="col">Class</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Date</th>
                  <th scope="col">Time In</th>
                  <th scope="col">Time Out</th>
                  <th scope="col">Duration</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="au-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => {
                  const status = statusMeta(r.status);
                  const running = r.totalDuration == null;
                  return (
                    <tr key={r.id}>
                      <td>
                        <span className="au-cell">
                          <span className="au-cell-primary">{fullName(r)}</span>
                          <span className="au-cell-sub">{r.studentSchoolId || DASH}</span>
                        </span>
                      </td>
                      <td>
                        <span className="au-cell">
                          <span className="au-cell-primary">{r.course || DASH}</span>
                          <span className="au-cell-sub">{[r.year, r.section].filter(Boolean).join(" · ") || DASH}</span>
                        </span>
                      </td>
                      <td>
                        <span className="au-cell">
                          <span className="au-cell-primary">{r.subject || DASH}</span>
                          <span className="au-cell-sub">{r.professor || DASH}</span>
                        </span>
                      </td>
                      {/* ISO kept in the title so the exact day stays available
                          on hover now that the cell shows a formatted date. */}
                      <td className="au-date-col" title={r.date || undefined}>
                        {fmtCalendarDay(r.date)}
                      </td>
                      <td className="au-time">{formatTime(r.timeIn)}</td>
                      <td className="au-time">{formatTime(r.timeOut)}</td>
                      <td>
                        <span className={`au-duration${running ? " au-duration--running" : ""}`}>
                          {running ? "running" : formatDuration(r.totalDuration)}
                        </span>
                      </td>
                      <td>
                        <span className={`au-status au-status--${status.key}`}>{status.label}</span>
                      </td>
                      <td className="au-td-actions">
                        <RowActions
                          label={`Actions for ${fullName(r)}`}
                          open={openRowMenu === r.id}
                          onToggle={() => rowMenu.toggle(r.id)}
                          onClose={rowMenu.close}
                        >
                          <button type="button" role="menuitem" onClick={() => openEdit(r)}>
                            <MdEdit size={14} /> Edit
                          </button>
                          <button type="button" role="menuitem" className="danger" onClick={() => handleDelete(r.id)}>
                            <MdDelete size={14} /> Delete
                          </button>
                        </RowActions>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gated on editRecord: Modal has no `open` prop — it renders whenever it
          is mounted, and its mount effect pins body scroll to hidden. Rendered
          unconditionally it would cover the page on arrival and freeze
          scrolling for the whole session. */}
      {editRecord && (
        <Modal title="Edit Attendance Record" onClose={closeEdit}>
          <div className="au-form">
            <p className="au-form-note">
              {fullName(editRecord)} — {fmtCalendarDay(editRecord.date)} &middot; {roomName}
            </p>
            <div className="au-field">
              <label htmlFor="rh-edit-subject">Subject</label>
              <input
                id="rh-edit-subject"
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="e.g. Computer Programming 1"
              />
            </div>
            <div className="au-field">
              <label htmlFor="rh-edit-professor">Professor</label>
              <input
                id="rh-edit-professor"
                type="text"
                value={editProfessor}
                onChange={(e) => setEditProfessor(e.target.value)}
              />
            </div>
            <div className="au-form-actions">
              <button type="button" className="btn btn-outline" onClick={closeEdit} disabled={savingEdit}>
                Cancel
              </button>
              <button type="button" className="btn btn-green" onClick={saveEdit} disabled={savingEdit}>
                {savingEdit ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}

      <ExportReportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialFilters={{
          course: filters.course || "All",
          year: filters.year || "All",
          section: filters.section || "All",
          subject: filters.subject || "All",
          professor: filters.professor || "All",
          dateRange: filters.from || filters.to ? "custom" : "all",
          dateFrom: filters.from,
          dateTo: filters.to,
          search: filters.search,
        }}
        onExport={handleExport}
        exporting={exporting}
        options={{
          typeTabs: [],
          showSection: true,
          showSubject: true,
          showProfessor: true,
          sectionOptions: facets.sections,
          subjectOptions: facets.subjects,
          professorOptions: facets.professors,
          courseOptions: facets.courses.length ? facets.courses : undefined,
          yearOptions: facets.years.length ? facets.years : undefined,
        }}
      />
    </section>
  );
}
