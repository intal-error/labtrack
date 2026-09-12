import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component, Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import SplashScreen from "./components/ui/SplashScreen";
import InstallPrompt from "./components/ui/InstallPrompt";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 2 * 60 * 1000 },
  },
});

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const ScannerPage = lazy(() => import("./pages/ScannerPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const PersonaPage = lazy(() => import("./pages/PersonaPage"));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const NotificationsTab = lazy(() => import("./components/tabs/NotificationsTab"));
const SettingsPage = lazy(() => import("./components/tabs/SettingsPage"));
const DocumentsTab = lazy(() => import("./components/tabs/DocumentsTab"));
const MaintenanceTab = lazy(() => import("./components/tabs/MaintenanceTab"));
const IncidentTab = lazy(() => import("./components/tabs/IncidentTab"));
const ManualsTab = lazy(() => import("./components/tabs/ManualsTab"));
const UsageLogsTab = lazy(() => import("./components/tabs/UsageLogsTab"));
const ReportsTab = lazy(() => import("./components/tabs/ReportsTab"));
const FinesTab = lazy(() => import("./components/tabs/FinesTab"));
const BorrowRequestsTab = lazy(() => import("./components/tabs/BorrowRequestsTab"));
const MyRequestsPage = lazy(() => import("./pages/MyRequestsPage"));
const AttendanceKioskPage = lazy(() => import("./pages/AttendanceKioskPage"));

const AttendanceLogsPage = lazy(() => import("./pages/AttendanceLogsPage"));
const RoomAttendancePage = lazy(() => import("./pages/RoomAttendancePage"));
const MyAttendancePage = lazy(() => import("./pages/MyAttendancePage"));
const AttendanceScannerPage = lazy(() => import("./pages/AttendanceScannerPage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));

const routePrefetchers = {
  "/dashboard": () => import("./pages/DashboardPage"),
  "/scanner": () => import("./pages/ScannerPage"),
  "/transactions": () => import("./pages/TransactionsPage"),
  "/catalog": () => import("./pages/CatalogPage"),
  "/inventory": () => import("./pages/InventoryPage"),
  "/persona": () => import("./pages/PersonaPage"),
  "/maintenance": () => import("./components/tabs/MaintenanceTab"),
  "/incidents": () => import("./components/tabs/IncidentTab"),
  "/manuals": () => import("./components/tabs/ManualsTab"),
  "/usage-logs": () => import("./components/tabs/UsageLogsTab"),
  "/reports": () => import("./components/tabs/ReportsTab"),
  "/fines": () => import("./components/tabs/FinesTab"),
  "/borrow-requests": () => import("./components/tabs/BorrowRequestsTab"),
  "/notifications": () => import("./components/tabs/NotificationsTab"),
  "/settings": () => import("./components/tabs/SettingsPage"),
  "/documents": () => import("./components/tabs/DocumentsTab"),
  "/attendance/room": () => import("./pages/RoomAttendancePage"),
  "/attendance-scan": () => import("./pages/AttendanceScannerPage"),
  "/attendance": () => import("./pages/AttendanceLogsPage"),
  "/my-attendance": () => import("./pages/MyAttendancePage"),
  "/my-requests": () => import("./pages/MyRequestsPage"),
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


function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ children, allowed }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!allowed.includes(role)) return <Navigate to="/dashboard" replace />;
  return children;
}

function IndexRedirect() {
  return <Navigate to="/dashboard" replace />;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, background: "#f5f5f0", color: "#1a1a1a", padding: 20, textAlign: "center" }}>
          <h2 style={{ margin: 0 }}>Something went wrong</h2>
          <p style={{ color: "#666", margin: 0 }}>{this.state.error?.message || "An unexpected error occurred."}</p>
          <button className="btn btn-primary" onClick={() => { window.location.reload(); }}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [splashComplete, setSplashComplete] = useState(false);

  return (
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          <ErrorBoundary>
          {!splashComplete && <SplashScreen onComplete={() => setSplashComplete(true)} />}
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <InstallPrompt />
          <Suspense fallback={<div className="loading-screen"><div className="spinner-lg" /></div>}>
          <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/attend/kiosk" element={<AttendanceKioskPage />} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<IndexRedirect />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="home" element={<Navigate to="/dashboard" replace />} />
              <Route path="overview" element={<Navigate to="/dashboard" replace />} />

              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="documents" element={<RoleRoute allowed={["admin"]}><DocumentsTab /></RoleRoute>} />
              <Route path="scanner" element={<RoleRoute allowed={["student"]}><ScannerPage /></RoleRoute>} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="borrowed" element={<Navigate to="/transactions" replace />} />
              <Route path="returned" element={<Navigate to="/transactions" replace />} />
              <Route path="catalog" element={<RoleRoute allowed={["admin"]}><CatalogPage /></RoleRoute>} />
              <Route path="inventory" element={<RoleRoute allowed={["student"]}><InventoryPage /></RoleRoute>} />
              <Route path="persona" element={<RoleRoute allowed={["admin"]}><PersonaPage /></RoleRoute>} />
              <Route path="admin" element={<Navigate to="/settings" replace />} />
              <Route path="maintenance" element={<RoleRoute allowed={["admin"]}><MaintenanceTab /></RoleRoute>} />
              <Route path="incidents" element={<IncidentTab />} />
              <Route path="manuals" element={<ManualsTab />} />
              <Route path="usage-logs" element={<RoleRoute allowed={["student"]}><UsageLogsTab /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute allowed={["admin"]}><ReportsTab /></RoleRoute>} />
              <Route path="fines" element={<FinesTab />} />
              <Route path="borrow-requests" element={<RoleRoute allowed={["admin"]}><BorrowRequestsTab /></RoleRoute>} />
              <Route path="attendance" element={<RoleRoute allowed={["admin"]}><AttendanceLogsPage /></RoleRoute>} />
              <Route path="attendance/room/:roomId" element={<RoleRoute allowed={["admin"]}><RoomAttendancePage /></RoleRoute>} />
              <Route path="my-attendance" element={<RoleRoute allowed={["student"]}><MyAttendancePage /></RoleRoute>} />
              <Route path="attendance-scan" element={<RoleRoute allowed={["student"]}><AttendanceScannerPage /></RoleRoute>} />
              <Route path="my-requests" element={<MyRequestsPage />} />
              <Route path="profile" element={<Navigate to="/settings" replace />} />

              <Route path="about" element={<Navigate to="/settings" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
  );
}

export default App;
