import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component, Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import SplashScreen from "./components/ui/SplashScreen";
import InstallPrompt from "./components/ui/InstallPrompt";
import DashboardLayout from "./components/layout/DashboardLayout";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 2 * 60 * 1000 },
  },
});

const LoginPage = lazy(() => import("./pages/LoginPage"));
const ScannerHubPage = lazy(() => import("./pages/components/ScannerHubPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const PersonaPage = lazy(() => import("./pages/PersonaPage"));

const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const MyActivityPage = lazy(() => import("./pages/MyActivityPage"));
const ResourcesPage = lazy(() => import("./pages/ResourcesPage"));
const NotificationsTab = lazy(() => import("./components/tabs/NotificationsTab"));
const SettingsPage = lazy(() => import("./components/tabs/SettingsPage"));
const MaintenanceTab = lazy(() => import("./components/tabs/MaintenanceTab"));
const FinesTab = lazy(() => import("./components/tabs/FinesTab"));
const BorrowRequestsTab = lazy(() => import("./components/tabs/BorrowRequestsTab"));
const IncidentReportsTab = lazy(() => import("./components/tabs/IncidentReportsTab"));
const AttendanceKioskPage = lazy(() => import("./pages/AttendanceKioskPage"));

const AttendanceLogsPage = lazy(() => import("./pages/AttendanceLogsPage"));
const RoomAttendancePage = lazy(() => import("./pages/RoomAttendancePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ children, allowed, fallback = "/dashboard" }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!allowed.includes(role)) return <Navigate to={fallback} replace />;
  return children;
}

function IndexRedirect() {
  return <Navigate to="/dashboard" replace />;
}

function LegacyTransactionRedirect({ tab }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (role === "admin") return <Navigate to="/transactions" replace />;
  return <Navigate to={`/my-activity?tab=${tab}`} replace />;
}

/* Incident reports live in two places now: staff work the queue at
   /incident-reports, students track their own reports under My Activity. Both
   /incidents and /resources?tab=incidents are old entry points (the latter was a
   Resources sub-tab) so they send each role where it now belongs. */
function LegacyIncidentRedirect() {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (role === "admin") return <Navigate to="/incident-reports" replace />;
  return <Navigate to="/my-activity?tab=incidents" replace />;
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

const fullScreenFallback = (
  <div className="loading-screen"><div className="spinner-lg" /></div>
);

function App() {
  const [splashComplete, setSplashComplete] = useState(false);

  // ErrorBoundary sits ABOVE the providers on purpose: a throw inside a
  // provider's render phase (e.g. ThemeProvider's localStorage read) would
  // otherwise escape every boundary and white-screen the app. ErrorBoundary
  // itself is a plain class component with no context/query/router deps, so
  // hoisting it is safe.
  return (
    <ErrorBoundary>
    <BrowserRouter>
      <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ThemeProvider>
          {!splashComplete && <SplashScreen onComplete={() => setSplashComplete(true)} />}
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <InstallPrompt />
          <Routes>
            <Route path="/login" element={<Suspense fallback={fullScreenFallback}><GuestRoute><LoginPage /></GuestRoute></Suspense>} />
            <Route path="/register" element={<Suspense fallback={fullScreenFallback}><GuestRoute><LoginPage /></GuestRoute></Suspense>} />
            <Route path="/attend/kiosk" element={<Suspense fallback={fullScreenFallback}><AttendanceKioskPage /></Suspense>} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<IndexRedirect />} />
              <Route path="dashboard" element={<DashboardPage />} />
              <Route path="home" element={<Navigate to="/dashboard" replace />} />
              <Route path="overview" element={<Navigate to="/dashboard" replace />} />

              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="resources" element={<ResourcesPage />} />
              <Route path="documents" element={<Navigate to="/resources" replace />} />
              <Route path="scanner" element={<RoleRoute allowed={["student"]} fallback="/my-activity"><ScannerHubPage /></RoleRoute>} />
              <Route path="my-activity" element={<RoleRoute allowed={["student"]}><MyActivityPage /></RoleRoute>} />
              <Route path="transactions" element={<RoleRoute allowed={["admin"]} fallback="/my-activity"><TransactionsPage /></RoleRoute>} />
              <Route path="borrowed" element={<LegacyTransactionRedirect tab="borrowed" />} />
              <Route path="returned" element={<LegacyTransactionRedirect tab="returned" />} />
              <Route path="catalog" element={<RoleRoute allowed={["admin"]} fallback="/inventory"><CatalogPage /></RoleRoute>} />
              <Route path="inventory" element={<RoleRoute allowed={["student"]} fallback="/catalog"><InventoryPage /></RoleRoute>} />
              <Route path="persona" element={<RoleRoute allowed={["admin"]}><PersonaPage /></RoleRoute>} />
              <Route path="admin" element={<Navigate to="/settings" replace />} />
              <Route path="maintenance" element={<RoleRoute allowed={["admin"]}><MaintenanceTab /></RoleRoute>} />
              <Route path="incident-reports" element={<RoleRoute allowed={["admin"]} fallback="/my-activity?tab=incidents"><IncidentReportsTab /></RoleRoute>} />
              <Route path="incidents" element={<LegacyIncidentRedirect />} />
              <Route path="manuals" element={<Navigate to="/resources?tab=manuals" replace />} />
              <Route path="usage-logs" element={<Navigate to="/my-activity" replace />} />
              <Route path="reports" element={<Navigate to="/dashboard" replace />} />
              <Route path="fines" element={<RoleRoute allowed={["admin"]} fallback="/my-activity?tab=fines"><FinesTab /></RoleRoute>} />
              <Route path="borrow-requests" element={<RoleRoute allowed={["admin"]} fallback="/my-activity?tab=requests"><BorrowRequestsTab /></RoleRoute>} />
              <Route path="attendance" element={<RoleRoute allowed={["admin"]}><AttendanceLogsPage /></RoleRoute>} />
              <Route path="attendance/room/:roomId" element={<RoleRoute allowed={["admin"]}><RoomAttendancePage /></RoleRoute>} />
              <Route path="my-attendance" element={<Navigate to="/my-activity?tab=attendance" replace />} />
              <Route path="attendance-scan" element={<Navigate to="/scanner?tab=attendance" replace />} />
              <Route path="my-requests" element={<Navigate to="/my-activity?tab=requests" replace />} />
              <Route path="profile" element={<Navigate to="/settings" replace />} />

              <Route path="about" element={<Navigate to="/settings" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
