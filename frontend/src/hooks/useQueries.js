import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "../services/api";

// ── Catalog ──
export function useCatalog(params) {
  return useQuery({
    queryKey: ["catalog", params],
    queryFn: () => api.getCatalog(params),
    staleTime: 5 * 60 * 1000,
  });
}

// ── Transactions ──
export function useBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["borrowed", params],
    queryFn: () => api.getBorrowed(params),
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
export function useMyBorrowed(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myBorrowed", params],
    queryFn: () => api.getMyBorrowed(params),
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
export function useReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["returned", params],
    queryFn: () => api.getReturned(params),
    staleTime: 2 * 60 * 1000,
    enabled,
  });
}
export function useMyReturned(params, { enabled } = {}) {
  return useQuery({
    queryKey: ["myReturned", params],
    queryFn: () => api.getMyReturned(params),
    staleTime: 2 * 60 * 1000,
    enabled,
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
export function useMyNotifications(params) {
  return useQuery({
    queryKey: ["myNotifications", params],
    queryFn: () => api.getMyNotifications(params),
    staleTime: 30 * 1000,
  });
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
