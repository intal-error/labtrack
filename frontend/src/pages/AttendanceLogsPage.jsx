import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../services/api";
import {
  MdPeople,
  MdEventNote,
  MdQrCodeScanner,
  MdRefresh,
  MdFileDownload,
  MdEdit,
  MdDelete,
  MdMeetingRoom,
  MdLocationOn,
  MdQrCode,
  MdErrorOutline,
} from "react-icons/md";
import { formatDuration, formatTime } from "../utils/attendanceHelpers";
import {
  useAttendanceFacets,
  useAttendanceRooms,
  useAttendanceStats,
  useActiveStudents,
  useDeleteAttendance,
  useTodayAttendance,
  useUpdateAttendance,
} from "../hooks/useQueries";
import ExportReportModal from "../components/ui/ExportReportModal";
import { buildAttendanceQuery } from "../components/ui/exportReport";
import Modal from "../components/ui/Modal";
import RoomManagementTab from "../components/tabs/RoomManagementTab";
import StatStrip from "../components/ui/StatStrip";
import useRowMenu from "../hooks/useRowMenu";
import AttendanceFilterSelect from "../components/attendance/AttendanceFilterSelect";
import RowActions from "../components/attendance/RowActions";
import toast from "react-hot-toast";
import "../styles/pages/attendance-ui.css";
import "../styles/pages/attendance-logs.css";
import "../styles/pages/tab-strip.css";

const TABS = [
  { key: "active", label: "Currently Inside", icon: MdPeople },
  { key: "today", label: "Today's Log", icon: MdEventNote },
  { key: "roomLogs", label: "Room Logs", icon: MdMeetingRoom },
  { key: "rooms", label: "Room QR Codes", icon: MdQrCodeScanner },
];

const TAB_KEYS = TABS.map((t) => t.key);
const DEFAULT_TAB = "active";

const NO_FILTER = Object.freeze({ course: "", year: "", section: "", professor: "" });
const EMPTY_FACETS = Object.freeze({ courses: [], years: [], sections: [], subjects: [], professors: [] });

const DASH = "\u2014";

// The backend writes exactly two statuses: "active" (still inside,
// total_duration null) and "timed_out" (the kiosk signed them out,
// total_duration set) — see attendanceController.js timeIn/timeOut/autoScan.
// Anything else is mapped to the completed state rather than falling through
// to the "Inside" pill, so a future status value can never be misread as a
// student still in the building.
function statusMeta(status) {
  return status === "active" ? { key: "active", label: "Inside" } : { key: "done", label: "Signed Out" };
}

function initials(record) {
  const first = (record.firstName || "").trim();
  const last = (record.lastName || "").trim();
  if (!first && !last) return "?";
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

function fullName(record) {
  return [record.firstName, record.lastName].filter(Boolean).join(" ") || DASH;
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

function LoadingPanel({ label = "Loading records" }) {
  return (
    <div className="au-empty">
      <div className="spinner-lg" />
      <h3>{label}...</h3>
    </div>
  );
}

export default function AttendanceLogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Validate against TAB_KEYS. This used to be a bare
  // `searchParams.get("tab") || "active"` seed, so any hand-edited or stale
  // link (?tab=rooomLogs, ?tab=roomss) matched no tab and rendered a blank page
  // below the tab strip with no way to tell that anything was wrong.
  const requested = searchParams.get("tab");
  const activeTab = TAB_KEYS.includes(requested) ? requested : DEFAULT_TAB;

  const switchTab = useCallback(
    (key) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (key === DEFAULT_TAB) next.delete("tab");
          else next.set("tab", key);
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );

  const [filterRoom, setFilterRoom] = useState("");
  const [filters, setFilters] = useState(NO_FILTER);
  const hasFilters = Boolean(filters.course || filters.year || filters.section || filters.professor);
  const setFilter = useCallback((key) => (value) => {
    setFilters((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const clearFilters = useCallback(() => setFilters(NO_FILTER), []);

  const [editRecord, setEditRecord] = useState(null);
  const [editSubject, setEditSubject] = useState("");
  const [editProfessor, setEditProfessor] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // The StatStrip renders on every tab, so the tiles have to keep refreshing
  // wherever time-sensitive figures are on screen: Currently Inside, and
  // Today's Log where scans are actively landing. Previously the poll was gated
  // to the live tab alone, so "Today's Sessions" froze on the one tab that exists
  // to watch scans arrive. The live list only refreshes while its own tab shows.
  const live = activeTab === "active" || activeTab === "today";

  const { data: stats } = useAttendanceStats(live);
  const { data: activeData, isFetching: activeFetching, isError: activeError, refetch: refetchActive } = useActiveStudents(
    filterRoom,
    activeTab === "active"
  );
  const { data: todayData, isFetching: todayFetching, isError: todayError, refetch: refetchToday } = useTodayAttendance(
    filters,
    { enabled: activeTab === "today" }
  );
  // A full-table scan; only requested once the Today tab actually shows the
  // dropdowns that consume it.
  const { data: facets } = useAttendanceFacets({ enabled: activeTab === "today" });
  const { data: roomsData } = useAttendanceRooms();

  const activeStudents = useMemo(() => (Array.isArray(activeData) ? activeData : []), [activeData]);
  const todayRecords = useMemo(() => (Array.isArray(todayData) ? todayData : []), [todayData]);
  const rooms = useMemo(() => (Array.isArray(roomsData) ? roomsData : []), [roomsData]);
  const facetsData = facets || EMPTY_FACETS;

  const updateAttendance = useUpdateAttendance();
  const deleteAttendance = useDeleteAttendance();

  // Row popup + Escape handling, shared with the room history page so neither
  // re-implements the same document listeners. Escape abandons the edit dialog
  // as well as closing the popup.
  const closeEdit = useCallback(() => setEditRecord(null), []);
  const [openRowMenu, rowMenu] = useRowMenu({ containerClass: "au-kebab", onEscape: closeEdit });

  async function handleExport(draft) {
    setExporting(true);
    try {
      const query = buildAttendanceQuery({ ...draft, dateRange: draft.dateRange || "today" });
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

  function openEditModal(record) {
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

  async function handleDeleteRecord(id) {
    rowMenu.close();
    if (!window.confirm("Delete this attendance record?")) return;
    try {
      await deleteAttendance.mutateAsync(id);
      toast.success("Record deleted");
    } catch (err) {
      toast.error(err.message || "Failed to delete");
    }
  }

  return (
    <section className="au-page">
      <StatStrip
        variant="stack"
        items={[
          { label: "Currently Inside", value: stats?.currentlyInside ?? 0 },
          // Only present when it is non-zero. An always-visible "0 overnight"
          // tile is noise, but a hidden non-zero one loses the information that
          // matters most on a live occupancy board.
          ...(stats?.staleInside > 0
            ? [{ label: "Not Signed Out", value: stats.staleInside }]
            : []),
          { label: "Today's Sessions", value: stats?.totalToday ?? 0 },
          { label: "Hours Today", value: formatDuration(stats?.totalMinutesToday ?? 0) },
          { label: "Students This Week", value: stats?.uniqueStudentsThisWeek ?? 0 },
        ]}
      />

      {/* key={activeTab} remounts the panel on every switch so the fade replays
          as a transition. Without it the animation only ever ran on first mount,
          which is why tab switches used to feel like an instant cut. */}
      <div className="tab-strip-panel" key={activeTab}>
        <div className="tab-strip" role="tablist" aria-label="Attendance views">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`tab-${key}`}
              // aria-controls + the panel's aria-labelledby are what tie a tab to
              // its content; without the pairing a screen reader announces the
              // tablist but no relationship to the panel below it.
              aria-controls={`tabpanel-${key}`}
              aria-selected={activeTab === key}
              // Roving tabindex: only the selected tab is reachable with Tab, so
              // the strip is one stop in the tab order rather than four.
              tabIndex={activeTab === key ? 0 : -1}
              className={`tab-strip-btn ${activeTab === key ? "active" : ""}`}
              onClick={() => switchTab(key)}
            >
              <Icon size={16} />
              <span>{label}</span>
              {key === "active" && activeStudents.length > 0 && (
                <span className="al-tab-count">{activeStudents.length}</span>
              )}
              {key === "today" && todayRecords.length > 0 && <span className="al-tab-count">{todayRecords.length}</span>}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          id={`tabpanel-${activeTab}`}
          aria-labelledby={`tab-${activeTab}`}
          // The panel is re-created on every tab change (see key above), so it
          // needs its own flex-column context rather than inheriting one.
          className="tab-panel-body"
        >

        {activeTab === "active" && (
          <ActiveTab
            students={activeStudents}
            rooms={rooms}
            filterRoom={filterRoom}
            onFilterRoom={setFilterRoom}
            busy={activeFetching}
            error={activeError}
            onRetry={refetchActive}
            onGoToRooms={() => switchTab("rooms")}
          />
        )}

        {activeTab === "today" && (
          <TodayTab
            records={todayRecords}
            facets={facetsData}
            filters={filters}
            setFilter={setFilter}
            hasFilters={hasFilters}
            onClearFilters={clearFilters}
            busy={todayFetching}
            error={todayError}
            onRetry={refetchToday}
openRowMenu={openRowMenu}
          toggleRowMenu={rowMenu.toggle}
          closeRowMenu={rowMenu.close}
            onEdit={openEditModal}
            onDelete={handleDeleteRecord}
            onExport={() => setExportOpen(true)}
          />
        )}

        {activeTab === "roomLogs" && <RoomLogsTab />}

        {activeTab === "rooms" && <RoomManagementTab />}
        </div>
      </div>

      {/* Gated on editRecord: Modal has no `open` prop — it renders whenever it
          is mounted, and its mount effect pins body scroll to hidden. Rendered
          unconditionally it would cover the page on arrival and freeze
          scrolling for the whole session. ExportReportModal guards itself the
          same way. */}
      {editRecord && (
        <Modal title="Edit Attendance Record" onClose={() => setEditRecord(null)}>
          <div className="au-form">
            <p className="au-form-note">
              {fullName(editRecord)} — {editRecord.date || DASH}
            </p>
            <div className="au-field">
              <label htmlFor="al-edit-subject">Subject</label>
              <input
                id="al-edit-subject"
                type="text"
                value={editSubject}
                onChange={(e) => setEditSubject(e.target.value)}
                placeholder="e.g. Computer Programming 1"
              />
            </div>
            <div className="au-field">
              <label htmlFor="al-edit-professor">Professor</label>
              <input
                id="al-edit-professor"
                type="text"
                value={editProfessor}
                onChange={(e) => setEditProfessor(e.target.value)}
              />
            </div>
            <div className="au-form-actions">
              <button type="button" className="btn btn-outline" onClick={() => setEditRecord(null)} disabled={savingEdit}>
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
          professor: filters.professor || "All",
          dateRange: "today",
        }}
        onExport={handleExport}
        exporting={exporting}
        options={{
          typeTabs: [],
          showSection: true,
          // Professor is a filter on this tab, so the download has to be able to
          // express it too — otherwise the XLSX silently ignores it.
          showProfessor: true,
          sectionOptions: facetsData.sections,
          professorOptions: facetsData.professors,
          courseOptions: facetsData.courses.length ? facetsData.courses : undefined,
          yearOptions: facetsData.years.length ? facetsData.years : undefined,
        }}
      />
    </section>
  );
}

/* ── Currently Inside ────────────────────────────────────────────────────── */
function ActiveTab({ students, rooms, filterRoom, onFilterRoom, busy, error, onRetry, onGoToRooms }) {
  // The select is keyed by roomCode (what the API filters on) but must display
  // roomName. Built once per rooms change so the memoised FilterSelect isn't
  // handed a fresh array on every render.
  const roomOptions = useMemo(
    () =>
      rooms
        .filter((r) => r.roomCode)
        .map((r) => ({ value: r.roomCode, label: r.roomName || r.roomCode })),
    [rooms]
  );

  // Flagged by the server, not derived here: whether a session counts as stale
  // depends on the SCHOOL's calendar day (SCHOOL_TIMEZONE), which the browser
  // cannot know. Re-deriving it client-side was how the two clocks drifted.
  const staleCount = students.filter((s) => s.staleSession).length;

  return (
    <>
      <div className="au-toolbar">
        <span className="al-live">
          <span className="al-live-dot" />
          Live
        </span>
        {rooms.length > 0 && (
          <AttendanceFilterSelect
            label="Room"
            allLabel="All Rooms"
            value={filterRoom}
            onChange={onFilterRoom}
            options={roomOptions}
          />
        )}
        <span className="al-live-note">Refreshes every 30 seconds</span>

        <div className="au-toolbar-tail">
          <span className="au-count">
            {students.length} student{students.length !== 1 ? "s" : ""} inside
          </span>
        </div>
      </div>

      {staleCount > 0 && (
        <p className="al-stale-note">
          <MdErrorOutline size={14} />
          {staleCount} of these timed in on an earlier day and were never signed out. Sign them out at the room
          kiosk to close the session.
        </p>
      )}

      <div className="au-results">
        {error ? (
          <PanelMessage
            error
            icon={MdErrorOutline}
            title="Couldn't load the live list"
            message="The server didn't respond. Check the backend is running, then try again."
            action={
              <button type="button" className="btn btn-green" onClick={onRetry}>
                <MdRefresh size={15} /> Try again
              </button>
            }
          />
        ) : students.length === 0 ? (
          <PanelMessage
            icon={MdPeople}
            title={filterRoom ? "No students inside this room" : "Nobody is signed in"}
            message={
              filterRoom
                ? "Pick All Rooms to see everyone currently in the building."
                : "Students appear here the moment they scan the QR code at a room's kiosk."
            }
            action={
              filterRoom ? (
                <button type="button" className="btn btn-outline" onClick={() => onFilterRoom("")}>
                  Show all rooms
                </button>
              ) : (
                <button type="button" className="btn btn-green" onClick={onGoToRooms}>
                  <MdQrCode size={15} /> Room QR Codes
                </button>
              )
            }
          />
        ) : (
          <div className={`al-live-grid${busy ? " au-results--busy" : ""}`}>
            {students.map((s) => (
              <article key={s.id} className={`al-student${s.staleSession ? " al-student--stale" : ""}`}>
                {s.staleSession && (
                  <span className="al-stale-badge" title={`Timed in on ${s.date || "an earlier day"}`}>
                    Not signed out
                  </span>
                )}
                <div className="al-student-top">
                  <span className="al-avatar">{initials(s)}</span>
                  <span className="al-student-text">
                    <span className="al-student-name">{fullName(s)}</span>
                    <span className="al-student-id">{s.studentSchoolId || DASH}</span>
                  </span>
                </div>

                <div className="al-student-tags">
                  {[s.course, s.year].filter(Boolean).length > 0 && (
                    <span className="al-tag al-tag--strong">
                      {[s.course, s.year].filter(Boolean).join(" · ")}
                    </span>
                  )}
                  {s.subject && <span className="al-tag">{s.subject}</span>}
                </div>

                <div className="al-student-meta">
                  <div className="al-meta-row">
                    <span className="al-meta-label">Professor</span>
                    <span className="al-meta-value">{s.professor || DASH}</span>
                  </div>
                  <div className="al-meta-row">
                    <span className="al-meta-label">Room</span>
                    <span className="al-meta-value">{s.labRoom || DASH}</span>
                  </div>
                  <div className="al-meta-row">
                    <span className="al-meta-label">Time in</span>
                    <span className="al-meta-value">
                      {formatTime(s.timeIn)}
                      {s.staleSession && s.date && <span className="al-meta-since"> ({s.date})</span>}
                    </span>
                  </div>
                </div>

                <div className="al-timer">
                  <span className="al-timer-value">{formatDuration(s.currentDuration || 0)}</span>
                  <span className="al-timer-label">Inside for</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Today's Log ─────────────────────────────────────────────────────────── */
function TodayTab({
  records,
  facets,
  filters,
  setFilter,
  hasFilters,
  onClearFilters,
  busy,
  error,
  onRetry,
  openRowMenu,
  toggleRowMenu,
  closeRowMenu,
  onEdit,
  onDelete,
  onExport,
}) {
  return (
    <>
      <div className="au-toolbar">
        {/* Always rendered, never conditionally: a facet that came back empty used to
            remove its own control, so the toolbar changed shape depending on what
            was in the data. It now renders disabled and reads "None yet". */}
        <AttendanceFilterSelect
          label="Course"
          allLabel="All Courses"
          value={filters.course}
          onChange={setFilter("course")}
          options={facets.courses}
        />
        <AttendanceFilterSelect
          label="Year"
          allLabel="All Years"
          value={filters.year}
          onChange={setFilter("year")}
          options={facets.years}
        />
        <AttendanceFilterSelect
          label="Section"
          allLabel="All Sections"
          value={filters.section}
          onChange={setFilter("section")}
          options={facets.sections}
        />
        <AttendanceFilterSelect
          label="Professor"
          allLabel="All Professors"
          value={filters.professor}
          onChange={setFilter("professor")}
          options={facets.professors}
        />
        {hasFilters && (
          <button type="button" className="btn btn-outline" onClick={onClearFilters}>
            Clear Filters
          </button>
        )}

        <div className="au-toolbar-tail">
          <span className="au-count">
            {records.length} record{records.length !== 1 ? "s" : ""} today
          </span>
        </div>

        <div className="au-toolbar-actions">
          <button type="button" className="btn btn-green" onClick={onExport}>
            <MdFileDownload size={15} /> Download Report
          </button>
        </div>
      </div>

      <div className="au-results">
        {error ? (
          <PanelMessage
            error
            icon={MdErrorOutline}
            title="Couldn't load today's log"
            message="The server didn't respond. Check the backend is running, then try again."
            action={
              <button type="button" className="btn btn-green" onClick={onRetry}>
                <MdRefresh size={15} /> Try again
              </button>
            }
          />
        ) : records.length === 0 ? (
          <PanelMessage
            icon={MdEventNote}
            title={hasFilters ? "No records match these filters" : "No records yet today"}
            message={
              hasFilters
                ? "Try clearing a filter, or widen the date range in the report download."
                : "Sessions show up here as soon as students start scanning in at a room kiosk."
            }
            action={
              hasFilters ? (
                <button type="button" className="btn btn-outline" onClick={onClearFilters}>
                  Clear filters
                </button>
              ) : (
                <button type="button" className="btn btn-green" onClick={onExport}>
                  <MdFileDownload size={15} /> Download Report
                </button>
              )
            }
          />
        ) : (
          <div className={`au-table-wrap${busy ? " au-results--busy" : ""}`}>
            <table className="au-table">
              <thead>
                <tr>
                  <th scope="col" className="au-th-student">Student</th>
                  <th scope="col">Course</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Room</th>
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
                          <span className="au-cell-sub">
                            {[r.year, r.section].filter(Boolean).join(" · ") || DASH}
                          </span>
                        </span>
                      </td>
                      <td>
                        <span className="au-cell">
                          <span className="au-cell-primary">{r.subject || DASH}</span>
                          <span className="au-cell-sub">{r.professor || DASH}</span>
                        </span>
                      </td>
                      <td>{r.labRoom || <span className="au-none">{DASH}</span>}</td>
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
                          onToggle={() => toggleRowMenu(r.id)}
                          onClose={closeRowMenu}
                        >
                          <button type="button" role="menuitem" onClick={() => onEdit(r)}>
                            <MdEdit size={14} /> Edit
                          </button>
                          <button type="button" role="menuitem" className="danger" onClick={() => onDelete(r.id)}>
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
    </>
  );
}

/* ── Room Logs ───────────────────────────────────────────────────────────── */
function RoomLogsTab() {
  const navigate = useNavigate();
  const { data, isPending, isError, refetch } = useAttendanceRooms();

  const rooms = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <>
      <div className="au-toolbar">
        <span className="au-count">
          {rooms.length} room{rooms.length !== 1 ? "s" : ""} configured
        </span>
        <div className="au-toolbar-tail">
          <span className="al-live-note">Select a room to open its attendance history</span>
        </div>
      </div>

      <div className="au-results">
        {isPending ? (
          <LoadingPanel label="Loading rooms" />
        ) : isError ? (
          <PanelMessage
            error
            icon={MdErrorOutline}
            title="Couldn't load rooms"
            message="The server didn't respond. Check the backend is running, then try again."
            action={
              <button type="button" className="btn btn-green" onClick={refetch}>
                <MdRefresh size={15} /> Try again
              </button>
            }
          />
        ) : rooms.length === 0 ? (
          <PanelMessage
            icon={MdMeetingRoom}
            title="No rooms configured yet"
            message="Attendance is recorded per room, so add at least one room and print its QR code for the kiosk."
          />
        ) : (
          <div className="al-room-grid">
            {rooms.map((room) => (
              <button
                key={room.id}
                type="button"
                className="al-room"
                onClick={() => navigate(`/attendance/room/${room.id}`)}
              >
                <span className="al-room-top">
                  <MdMeetingRoom size={22} />
                  <span className="al-room-text">
                    <span className="al-room-name">{room.roomName || DASH}</span>
                    {room.location && (
                      <span className="al-room-location">
                        <MdLocationOn size={10} /> {room.location}
                      </span>
                    )}
                  </span>
                </span>
                <span className="al-room-foot">
                  <span className={`au-status au-status--${room.status === "active" ? "active" : "done"}`}>
                    {room.status === "active" ? "Active" : room.status || "Inactive"}
                  </span>
                  <span className="al-room-link">View attendance</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
