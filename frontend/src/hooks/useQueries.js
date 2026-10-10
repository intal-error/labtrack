import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../services/api";

/*
 * Every queryFn below takes ({ signal }) and forwards it to its api method.
 *
 * WHY: React Query hands every queryFn an AbortSignal and aborts it when a query is
 * superseded -- a filter change, a different page, another keystroke. None of these
 * functions declared it, so the signal never reached fetch and the request ran to
 * completion anyway. React Query discarded the response, but the server still did the
 * work.
 *
 * That is not a small leak here. Several of these endpoints used to be whole-table
 * scans (see the SQL pushdown notes in the controllers), so every filter change left
 * a full scan running in the background with nobody reading the answer.
 *
 * api.request combines this signal with its own 30 s timeout and rethrows an
 * AbortError untouched, which is what React Query needs to recognise a cancellation
 * and skip its retry.
 */

// ── Course scopes ──
/*
 * The course list, which is the source of truth for every course picker.
 *
 * Previously the pickers read the hardcoded COURSES constant in
 * src/constants/courses.js. That list is still correct -- those ARE the program
 * codes, and they are what a student picks at registration -- but it is a second
 * copy of the data in `courses`, and it silently disagrees the moment the Super
 * Admin adds a course. A room could then be assigned a course the server rejects as
 * unknown, with the form offering it as if it were fine.
 *
 * Long staleTime because a course code effectively never changes: `courses.id` is a
 * FROZEN join key, and renaming writes `name` only.
 */
export function useCourses() {
  return useQuery({
    queryKey: ["courses"],
    queryFn: ({ signal }) => api.getCourses(signal),
    staleTime: 30 * 60 * 1000,
  });
}

/** Convenience for pickers: the id/name pairs, with active courses first. */
export function useCourseOptions() {
  const { data, isLoading } = useCourses();
  const options = (data || [])
    .map((c) => ({ value: c.id, label: c.name, id: c.id, name: c.name, status: c.status }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return { options, isLoading };
}

/**
 * Paginated student roster, scoped SERVER-SIDE to the caller's course.
 *
 * `course` is passed through only because the Super Admin needs it; the backend
 * ignores it for a Course Admin. That is deliberate -- honouring it would either
 * leak the roster or return a confusingly empty page.
 */
export function useStudents(params) {
  return useQuery({
    queryKey: ["students", params],
    queryFn: ({ signal }) => api.getStudents(params, signal),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Catalog ──
export function useCatalog(params) {
  return useQuery({
    queryKey: ["catalog", params],
    queryFn: ({ signal }) => api.getCatalog(params, signal),
    staleTime: 5 * 60 * 1000,
    // Keep the previous page on screen while a new filter/page is in flight.
    // Without this, every keystroke flipped `isLoading` true and the page
    // replaced the whole catalog with a full-height spinner.
    placeholderData: keepPreviousData,
  });
}
export function useCatalogStats() {
  return useQuery({
    queryKey: ["catalog", "stats"],
    queryFn: ({ signal }) => api.getCatalogStats(signal),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Narrow projection for pickers and previews.
 *
 * Replaces four useCatalog() calls with no params, each of which fetched the entire
 * catalog including every long text column to populate a <select> or a six-row
 * preview. Long staleTime because it is a reference list that only changes when an
 * admin edits the catalog, and the mutation handlers already invalidate ["catalog"].
 */
export function useCatalogPreview({ enabled } = {}) {
  return useQuery({
    queryKey: ["catalog", "options"],
    queryFn: ({ signal }) => api.getCatalogOptions(signal),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

// ── Transactions ──
// All four carry placeholderData:keepPreviousData so changing a filter or page
// dims the existing rows instead of replacing the list with a full-height
// spinner (which is what isLoading did on every keystroke).
export function useBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["borrowed", params],
    queryFn: ({ signal }) => api.getBorrowed(params, signal),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useMyBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myBorrowed", params],
    queryFn: ({ signal }) => api.getMyBorrowed(params, signal),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["returned", params],
    queryFn: ({ signal }) => api.getReturned(params, signal),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useMyReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myReturned", params],
    queryFn: ({ signal }) => api.getMyReturned(params, signal),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useTransactionStats() {
  return useQuery({
    queryKey: ["transactionStats"],
    queryFn: ({ signal }) => api.getTransactionStats(signal),
    staleTime: 2 * 60 * 1000,
  });
}
export function useMyTransactionStats() {
  return useQuery({
    queryKey: ["myTransactionStats"],
    queryFn: ({ signal }) => api.getMyTransactionStats(signal),
    staleTime: 2 * 60 * 1000,
  });
}

// ── Maintenance ──
export function useMaintenance(params) {
  return useQuery({
    queryKey: ["maintenance", params],
    queryFn: ({ signal }) => api.getMaintenance(params, signal),
    staleTime: 60 * 1000,
  });
}
export function useCreateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) => api.createMaintenance(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}
export function useUpdateMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateMaintenance(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}
export function useDeleteMaintenance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteMaintenance(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["maintenance"] }),
  });
}

// ── Borrow Requests ──
export function useBorrowRequests(params) {
  return useQuery({
    queryKey: ["borrowRequests", params],
    queryFn: ({ signal }) => api.getBorrowRequests(params, signal),
    staleTime: 60 * 1000,
  });
}
export function useMyBorrowRequests() {
  return useQuery({
    queryKey: ["myBorrowRequests"],
    queryFn: ({ signal }) => api.getMyBorrowRequests(signal),
    staleTime: 60 * 1000,
  });
}

// ── Fines ──
export function useFines(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["fines", params],
    queryFn: ({ signal }) => api.getFines(params, signal),
    staleTime: 60 * 1000,
    enabled,
  });
}
export function useMyFines(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myFines", params],
    queryFn: ({ signal }) => api.getMyFines(params, signal),
    staleTime: 60 * 1000,
    enabled,
  });
}
// Admin-only aggregate (it scans every open borrow in the building). Callers must
// gate it: `enabled` defaults to undefined, and FinesTab passes { enabled: isAdmin }
// because the student branch of that page rendered the result and threw it away --
// so every student opening My Activity was making a pointless request.
export function useOverdueCount({ enabled } = {}) {
  return useQuery({
    queryKey: ["overdueCount"],
    queryFn: ({ signal }) => api.getOverdueCount(signal),
    staleTime: 60 * 1000,
    enabled,
  });
}

// ── Incident Reports ──
export function useIncidents(params) {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: ({ signal }) => api.getIncidents(params, signal),
    staleTime: 60 * 1000,
  });
}
export function useMyIncidents(params) {
  return useQuery({
    queryKey: ["myIncidents", params],
    queryFn: ({ signal }) => api.getMyIncidents(params, signal),
    staleTime: 60 * 1000,
  });
}
/* The detail view needs the timeline, which only the single-report endpoint
   returns (events are not in the list payload). Cached under its own key so
   opening a report does not refetch the whole list, and disabled without an id
   so it cannot fire for the "no report selected" case. */
export function useIncident(id, { enabled = true } = {}) {
  return useQuery({
    queryKey: ["incident", id],
    queryFn: ({ signal }) => api.getIncident(id, signal),
    staleTime: 30 * 1000,
    enabled: Boolean(id) && enabled,
  });
}

// ── Notifications ──
export function pickNotifications(raw) {
  if (Array.isArray(raw)) return raw;
  return Array.isArray(raw?.data) ? raw.data : [];
}

export function countUnread(list) {
  return list.filter((n) => !n?.read).length;
}

export function useMyNotifications(params) {
  return useQuery({
    queryKey: ["myNotifications", params],
    queryFn: ({ signal }) => api.getMyNotifications(params, signal),
    staleTime: 30 * 1000,
  });
}

export function useUnreadCount() {
  const { data } = useMyNotifications();
  return countUnread(pickNotifications(data));
}

// ── Reports ──
export function useReportSummary(params) {
  return useQuery({
    queryKey: ["reportSummary", params || null],
    queryFn: ({ signal }) => api.getReportSummary(params, signal),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Attendance ──
export function useStudentAttendance(schoolId) {
  return useQuery({
    queryKey: ["studentAttendance", schoolId],
    queryFn: ({ signal }) => api.getStudentAttendance(schoolId, signal),
    staleTime: 2 * 60 * 1000,
    enabled: !!schoolId,
  });
}
export function useRoomAttendanceHistory(roomId, params) {
  return useQuery({
    queryKey: ["roomAttendance", roomId, params],
    queryFn: ({ signal }) => api.getRoomAttendanceHistory(roomId, params, signal),
    staleTime: 60 * 1000,
    enabled: !!roomId,
    // Keeps the fetched rows on screen while a new filter/page request is in
    // flight. Without it, `isLoading` flipped true on every keystroke and the
    // page swapped the whole table for a full-height spinner.
    //
    // Deliberately NOT plain keepPreviousData: that carries the payload across a
    // roomId change too, so opening Room B briefly rendered Room A's students,
    // KPIs and aggregates under Room B's heading — with the endpoint doing a
    // .select("*") on the whole table, that window can be seconds. Scoping the
    // placeholder to the same room keeps the dim-on-refetch behaviour within a
    // room while a room switch falls back to isPending and shows the loader.
    placeholderData: (prevData, prevQuery) =>
      prevQuery?.queryKey?.[1] === roomId ? prevData : undefined,
  });
}

// Admin Attendance Logs (/attendance).
//
// These four replaced a pile of useState + useEffect + api.* calls in
// AttendanceLogsPage, which had three consequences worth keeping in mind:
//
//   1. The room filter is part of the query key, so changing it refetches
//      immediately. It used to be held in a ref and only read inside
//      loadActive(), which the room <select> never called -- so the new filter
//      sat there unapplied until you hit Refresh or waited out the 30s poll.
//   2. keepPreviousData dims the previous rows while a refetch is in flight.
//      Without it every filter change tore the table down and the panel
//      collapsed to a full-height spinner.
//   3. Error states are now reachable. The old handlers only console.error'd,
//      so a failed request rendered as a confident "No Records Today".

const LIVE_REFRESH_MS = 30 * 1000;

export function useAttendanceStats(live) {
  return useQuery({
    queryKey: ["attendance", "stats"],
    queryFn: ({ signal }) => api.getAttendanceStats(signal),
    staleTime: LIVE_REFRESH_MS,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
  });
}

// `room` is "" for "All Rooms"; it is part of the key so the filter drives the
// request rather than being applied client-side.
export function useActiveStudents(room, live) {
  return useQuery({
    queryKey: ["attendance", "active", room || "all"],
    queryFn: ({ signal }) => api.getActiveStudents(room || "", signal),
    staleTime: LIVE_REFRESH_MS,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
    placeholderData: keepPreviousData,
  });
}

// `filters` is { course, year, section, professor }; empty strings mean "no
// filter". Every field listed here MUST be serialised below, or the matching
// dropdown silently does nothing -- professor was rendered on the Today's Log
// toolbar while this hook dropped it, so the picker moved and the table never
// changed.
export function useTodayAttendance(filters, { enabled } = {}) {
  const params = new URLSearchParams();
  if (filters.course) params.set("course", filters.course);
  if (filters.year) params.set("year", filters.year);
  if (filters.section) params.set("section", filters.section);
  if (filters.professor) params.set("professor", filters.professor);
  const qs = params.toString();

  return useQuery({
    queryKey: ["attendance", "today", qs],
    queryFn: ({ signal }) => api.getTodayAttendance(qs, signal),
    staleTime: 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}

// The facets endpoint is a full-table scan, so it is only requested once the
// Today's Log tab actually shows the dropdowns that consume it. `enabled`
// stays false until then, which matters because the query key is stable -- if
// it refetched on every mount the tab would be slow to switch to.
export function useAttendanceFacets({ enabled } = {}) {
  return useQuery({
    queryKey: ["attendance", "facets"],
    queryFn: ({ signal }) => api.getAttendanceFacets(signal),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useAttendanceRooms() {
  return useQuery({
    queryKey: ["attendance", "rooms"],
    queryFn: ({ signal }) => api.getRooms(signal),
    // Rooms change rarely, but the list feeds three surfaces at once (the Room
    // Logs grid, the "All Rooms" filter and the room history hero chips) and a
    // 5 minute staleTime meant a rename or delete was invisible for minutes.
    // RoomManagementTab also invalidates this key after every mutation, so a
    // short staleTime only costs a refetch on revisit.
    staleTime: 60 * 1000,
  });
}

// Editing or deleting a row has to move several things at once: the daily log
// itself, its KPI tiles, the live list (the record may have just ended a
// session), and any room history page showing the same row.
//
// Two prefixes are involved and they are siblings, not nested. `useRoom-
// AttendanceHistory` keys on ["roomAttendance", roomId, params] — deliberately
// NOT under "attendance", because its response shape differs (paginated records
// plus per-room aggregates) and sharing a prefix would let a refresh of the
// admin log drag the room pages along. So invalidating only "attendance" left
// a room-history edit saving correctly while the table kept showing the old
// values. Both prefixes are invalidated here.
function invalidateAttendanceViews(qc) {
  qc.invalidateQueries({ queryKey: ["attendance"] });
  qc.invalidateQueries({ queryKey: ["roomAttendance"] });
}

export function useUpdateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }) => api.updateAttendance(id, data),
    onSuccess: () => invalidateAttendanceViews(qc),
  });
}

export function useDeleteAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id) => api.deleteAttendance(id),
    onSuccess: () => invalidateAttendanceViews(qc),
  });
}

// ── Active Admins ──
export function useActiveAdmins() {
  return useQuery({
    queryKey: ["activeAdmins"],
    queryFn: ({ signal }) => api.getActiveAdmins(signal),
    staleTime: 5 * 60 * 1000,
  });
}
