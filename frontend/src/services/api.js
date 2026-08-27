import { auth } from "./firebase";
import { getIdToken } from "firebase/auth";

const API_URL = import.meta.env.VITE_API_URL || "/api";
const TIMEOUT_MS = 30000;

async function request(path, options = {}) {
  let headers = { "Content-Type": "application/json", ...options.headers };

  if (auth.currentUser) {
    try {
      const token = await getIdToken(auth.currentUser);
      headers["Authorization"] = `Bearer ${token}`;
    } catch {
      // Token refresh failed, continue without token
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      headers,
      signal: controller.signal,
      ...options,
    });
  } catch {
    throw new Error("Server is offline. Please try again later.");
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getDashboardCounts: () => request("/transactions/counts"),
  getChartData: () => request("/transactions/chart"),
  getBorrowed: () => request("/transactions/borrowed"),
  getReturned: () => request("/transactions/returned"),
  getRecentActivity: () => request("/transactions/recent-activity"),
  getMyBorrowed: () => request("/transactions/my-borrowed"),
  getMyReturned: () => request("/transactions/my-returned"),
  recordBorrow: (data) => request("/transactions/borrow", { method: "POST", body: JSON.stringify(data) }),
  recordReturn: (data) => request("/transactions/return", { method: "POST", body: JSON.stringify(data) }),

  getCatalog: () => request("/catalog"),
  createCatalogItem: (data) => request("/catalog", { method: "POST", body: JSON.stringify(data) }),
  updateCatalogItem: (id, data) => request(`/catalog/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteCatalogItem: (id) => request(`/catalog/${id}`, { method: "DELETE" }),

  searchUser: (firstName, lastName) => request(`/users/search?firstName=${encodeURIComponent(firstName)}&lastName=${encodeURIComponent(lastName)}`),

  getAdmins: () => request("/admin"),
  createAdmin: (data) => request("/admin", { method: "POST", body: JSON.stringify(data) }),
  updateAdmin: (id, data) => request(`/admin/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAdmin: (id) => request(`/admin/${id}`, { method: "DELETE" }),

  downloadReport: async (type) => {
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_URL}/reports/${type}`, { headers, signal: controller.signal });
    } catch {
      throw new Error("Server is offline. Please try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Download failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${type}_report.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  uploadImage: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_URL}/upload/image`, { method: "POST", headers, body: formData, signal: controller.signal });
    } catch {
      throw new Error("Server is offline. Please try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  uploadDocument: async (file) => {
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let res;
    try {
      res = await fetch(`${API_URL}/upload/document`, { method: "POST", headers, body: formData, signal: controller.signal });
    } catch {
      throw new Error("Server is offline. Please try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Upload failed");
    return res.json();
  },

  generateQR: (text) => request("/upload/qr", { method: "POST", body: JSON.stringify({ text }) }),

  // Auth
  register: (data) => request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  updateProfile: (data) => request("/auth/profile", { method: "PUT", body: JSON.stringify(data) }),
  changePassword: (data) => request("/auth/password", { method: "PUT", body: JSON.stringify(data) }),

  // Notifications
  getNotifications: () => request("/notifications"),
  getMyNotifications: () => request("/notifications/user"),
  createNotification: (data) => request("/notifications", { method: "POST", body: JSON.stringify(data) }),
  markNotificationRead: (id) => request(`/notifications/${id}/read`, { method: "PUT" }),
  markAllNotificationsRead: () => request("/notifications/read-all", { method: "PUT" }),
  dismissNotification: (id) => request(`/notifications/${id}`, { method: "DELETE" }),

  // Documents
  getDocuments: () => request("/documents"),
  deleteDocument: (id) => request(`/documents/${id}`, { method: "DELETE" }),

  // Settings
  getSettings: () => request("/settings"),
  saveSettings: (data) => request("/settings", { method: "PUT", body: JSON.stringify(data) }),

  // Maintenance
  getMaintenance: () => request("/maintenance"),
  createMaintenance: (data) => request("/maintenance", { method: "POST", body: JSON.stringify(data) }),
  updateMaintenance: (id, data) => request(`/maintenance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMaintenance: (id) => request(`/maintenance/${id}`, { method: "DELETE" }),

  // Incidents
  getIncidents: () => request("/incidents"),
  getMyIncidents: () => request("/incidents/mine"),
  createIncident: (data) => request("/incidents", { method: "POST", body: JSON.stringify(data) }),
  updateIncident: (id, data) => request(`/incidents/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteIncident: (id) => request(`/incidents/${id}`, { method: "DELETE" }),

  // Manuals
  getManuals: () => request("/manuals"),
  createManual: (data) => request("/manuals", { method: "POST", body: JSON.stringify(data) }),
  updateManual: (id, data) => request(`/manuals/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteManual: (id) => request(`/manuals/${id}`, { method: "DELETE" }),

  // Fines
  getFines: () => request("/fines"),
  getMyFines: () => request("/fines/my"),
  checkRestriction: (userId) => request(`/fines/check-restriction/${userId}`),
  payFine: (id) => request(`/fines/${id}/pay`, { method: "PUT" }),
  waiveFine: (id, reason) => request(`/fines/${id}/waive`, { method: "PUT", body: JSON.stringify({ reason }) }),

  // Borrow Requests
  getBorrowRequests: () => request("/borrow-requests"),
  getMyBorrowRequests: () => request("/borrow-requests/my"),
  createBorrowRequest: (data) => request("/borrow-requests", { method: "POST", body: JSON.stringify(data) }),
  approveBorrowRequest: (id, reviewNotes) => request(`/borrow-requests/${id}/approve`, { method: "PUT", body: JSON.stringify({ reviewNotes }) }),
  rejectBorrowRequest: (id, reviewNotes) => request(`/borrow-requests/${id}/reject`, { method: "PUT", body: JSON.stringify({ reviewNotes }) }),
  cancelBorrowRequest: (id) => request(`/borrow-requests/${id}/cancel`, { method: "PUT" }),
  reassignBorrowRequest: (id, data) => request(`/borrow-requests/${id}/reassign`, { method: "PUT", body: JSON.stringify(data) }),

  // Admin Management
  getActiveAdmins: () => request("/admin/active"),
  toggleAdminStatus: (id) => request(`/admin/${id}/toggle-status`, { method: "PUT" }),

  // Backup
  exportBackup: () => request("/backup/export", { method: "POST" }),
  downloadBackup: async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    try {
      const res = await fetch(`${API_URL}/backup/download`, { headers, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `labtrack_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    }
  },
  importBackup: (backupData, overwrite) => request("/backup/import", { method: "POST", body: JSON.stringify({ backupData, overwrite }) }),
  getBackupHistory: () => request("/backup/history"),

  // Condition Photo Upload
  uploadConditionPhoto: async (file) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const formData = new FormData();
    formData.append("file", file);
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    try {
      const res = await fetch(`${API_URL}/upload/condition-photo`, { method: "POST", headers, body: formData, signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") throw new Error("Request timed out");
      throw err;
    }
  },

  // Lab Attendance
  lookupStudent: (schoolId) => request(`/attendance/lookup-student/${schoolId}`),
  timeIn: (data) => request("/attendance/time-in", { method: "POST", body: JSON.stringify(data) }),
  timeOut: (data) => request("/attendance/time-out", { method: "POST", body: JSON.stringify(data) }),
  autoScan: (data) => request("/attendance/auto-scan", { method: "POST", body: JSON.stringify(data) }),
  getActiveStudents: (params = "") => request(`/attendance/active${params ? "?" + params : ""}`),
  getTodayAttendance: () => request("/attendance/today"),
  getDailyLog: (date) => request(`/attendance/daily-log/${date}`),
  getAttendanceHistory: (params) => request(`/attendance/history?${params}`),
  getRoomAttendanceHistory: (roomId, params) => request(`/attendance/room/${roomId}/history?${params}`),
  getStudentAttendance: (schoolId) => request(`/attendance/my/${schoolId}`),
  getAttendanceStats: () => request("/attendance/stats"),
  updateAttendance: (id, data) => request(`/attendance/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteAttendance: (id) => request(`/attendance/${id}`, { method: "DELETE" }),
  exportAttendance: async (params) => {
    let headers = {};
    if (auth.currentUser) {
      try {
        const token = await getIdToken(auth.currentUser);
        headers["Authorization"] = `Bearer ${token}`;
      } catch {}
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res;
    try {
      res = await fetch(`${API_URL}/attendance/export?${params}`, { headers, signal: controller.signal });
    } catch {
      throw new Error("Server is offline. Please try again later.");
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) throw new Error("Export failed");
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lab_attendance.xlsx`;
    a.click();
    window.URL.revokeObjectURL(url);
  },

  // Lab Rooms
  getRooms: () => request("/attendance/rooms"),
  createRoom: (data) => request("/attendance/rooms", { method: "POST", body: JSON.stringify(data) }),
  updateRoom: (id, data) => request(`/attendance/rooms/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteRoom: (id) => request(`/attendance/rooms/${id}`, { method: "DELETE" }),
  getRoomQR: (id) => request(`/attendance/rooms/${id}/qr`),

  // Student QR
  getStudentQR: (schoolId) => request(`/attendance/student-qr/${schoolId}`),



};
