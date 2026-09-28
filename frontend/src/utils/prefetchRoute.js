const routePrefetchers = {
  "/dashboard": () => import("../pages/DashboardPage"),
  "/scanner": () => import("../pages/components/ScannerHubPage"),
  "/my-activity": () => import("../pages/MyActivityPage"),
  "/transactions": () => import("../pages/TransactionsPage"),
  "/catalog": () => import("../pages/CatalogPage"),
  "/inventory": () => import("../pages/InventoryPage"),
  "/persona": () => import("../pages/PersonaPage"),
  "/maintenance": () => import("../components/tabs/MaintenanceTab"),
  "/incidents": () => import("../components/tabs/IncidentTab"),
  "/manuals": () => import("../components/tabs/ManualsTab"),
  "/reports": () => import("../components/tabs/ReportsTab"),
  "/fines": () => import("../components/tabs/FinesTab"),
  "/borrow-requests": () => import("../components/tabs/BorrowRequestsTab"),
  "/notifications": () => import("../components/tabs/NotificationsTab"),
  "/settings": () => import("../components/tabs/SettingsPage"),
  "/documents": () => import("../components/tabs/DocumentsTab"),
  "/attendance/room": () => import("../pages/RoomAttendancePage"),
  "/attendance": () => import("../pages/AttendanceLogsPage"),
};

const sortedPrefetchKeys = Object.keys(routePrefetchers).sort((a, b) => b.length - a.length);

const prefetched = {};

export function prefetchRoute(path) {
  const matcher = sortedPrefetchKeys.find((key) => path.startsWith(key));
  if (matcher && !prefetched[matcher]) {
    prefetched[matcher] = true;
    routePrefetchers[matcher]();
  }
}
