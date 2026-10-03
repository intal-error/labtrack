import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../services/api";

// ── Catalog ──
export function useCatalog(params) {
  return useQuery({
    queryKey: ["catalog", params],
    queryFn: () => api.getCatalog(params),
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
    queryFn: () => api.getCatalogStats(),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Transactions ──
// All four carry placeholderData:keepPreviousData so changing a filter or page
// dims the existing rows instead of replacing the list with a full-height
// spinner (which is what isLoading did on every keystroke).
export function useBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["borrowed", params],
    queryFn: () => api.getBorrowed(params),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useMyBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myBorrowed", params],
    queryFn: () => api.getMyBorrowed(params),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["returned", params],
    queryFn: () => api.getReturned(params),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useMyReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myReturned", params],
    queryFn: () => api.getMyReturned(params),
    staleTime: 2 * 60 * 1000,
    enabled,
    placeholderData: keepPreviousData,
  });
}
export function useTransactionStats() {
  return useQuery({
    queryKey: ["transactionStats"],
    queryFn: () => api.getTransactionStats(),
    staleTime: 2 * 60 * 1000,
  });
}
export function useMyTransactionStats() {
  return useQuery({
    queryKey: ["myTransactionStats"],
    queryFn: () => api.getMyTransactionStats(),
    staleTime: 2 * 60 * 1000,
  });
}

// ── Maintenance ──
export function useMaintenance(params) {
  return useQuery({
    queryKey: ["maintenance", params],
    queryFn: () => api.getMaintenance(params),
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
    queryFn: () => api.getBorrowRequests(params),
    staleTime: 60 * 1000,
  });
}
export function useMyBorrowRequests() {
  return useQuery({
    queryKey: ["myBorrowRequests"],
    queryFn: () => api.getMyBorrowRequests(),
    staleTime: 60 * 1000,
  });
}

// ── Fines ──
export function useFines(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["fines", params],
    queryFn: () => api.getFines(params),
    staleTime: 60 * 1000,
    enabled,
  });
}
export function useMyFines(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myFines", params],
    queryFn: () => api.getMyFines(params),
    staleTime: 60 * 1000,
    enabled,
  });
}
export function useOverdueCount() {
  return useQuery({
    queryKey: ["overdueCount"],
    queryFn: () => api.getOverdueCount(),
    staleTime: 60 * 1000,
  });
}

// ── Incidents ──
export function useIncidents(params) {
  return useQuery({
    queryKey: ["incidents", params],
    queryFn: () => api.getIncidents(params),
    staleTime: 60 * 1000,
  });
}
export function useMyIncidents(params) {
  return useQuery({
    queryKey: ["myIncidents", params],
    queryFn: () => api.getMyIncidents(params),
    staleTime: 60 * 1000,
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
    queryFn: () => api.getMyNotifications(params),
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
    queryFn: () => api.getReportSummary(params),
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

// ── Attendance ──
export function useStudentAttendance(schoolId) {
  return useQuery({
    queryKey: ["studentAttendance", schoolId],
    queryFn: () => api.getStudentAttendance(schoolId),
    staleTime: 2 * 60 * 1000,
    enabled: !!schoolId,
  });
}
export function useRoomAttendanceHistory(roomId, params) {
  return useQuery({
    queryKey: ["roomAttendance", roomId, params],
    queryFn: () => api.getRoomAttendanceHistory(roomId, params),
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
    queryFn: () => api.getAttendanceStats(),
    staleTime: LIVE_REFRESH_MS,
    refetchInterval: live ? LIVE_REFRESH_MS : false,
  });
}

// `room` is "" for "All Rooms"; it is part of the key so the filter drives the
// request rather than being applied client-side.
export function useActiveStudents(room, live) {
  return useQuery({
    queryKey: ["attendance", "active", room || "all"],
    queryFn: () => api.getActiveStudents(room || ""),
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
    queryFn: () => api.getTodayAttendance(qs),
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
    queryFn: () => api.getAttendanceFacets(),
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

export function useAttendanceRooms() {
  return useQuery({
    queryKey: ["attendance", "rooms"],
    queryFn: () => api.getRooms(),
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
    queryFn: () => api.getActiveAdmins(),
    staleTime: 5 * 60 * 1000,
  });
}
