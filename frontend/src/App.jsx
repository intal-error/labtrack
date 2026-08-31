import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component, Suspense, lazy } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const DashboardLayout = lazy(() => import("./components/layout/DashboardLayout"));
const ScannerPage = lazy(() => import("./pages/ScannerPage"));
const TransactionsPage = lazy(() => import("./pages/TransactionsPage"));
const CatalogPage = lazy(() => import("./pages/CatalogPage"));
const PersonaPage = lazy(() => import("./pages/PersonaPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
const AboutPage = lazy(() => import("./pages/AboutPage"));
const HomePage = lazy(() => import("./pages/HomePage"));
const NotificationsTab = lazy(() => import("./components/tabs/NotificationsTab"));
const SettingsTab = lazy(() => import("./components/tabs/SettingsTab"));
const DocumentsTab = lazy(() => import("./components/tabs/DocumentsTab"));
const MaintenanceTab = lazy(() => import("./components/tabs/MaintenanceTab"));
const IncidentTab = lazy(() => import("./components/tabs/IncidentTab"));
const ManualsTab = lazy(() => import("./components/tabs/ManualsTab"));
const UsageLogsTab = lazy(() => import("./components/tabs/UsageLogsTab"));
const ReportsTab = lazy(() => import("./components/tabs/ReportsTab"));
const FinesTab = lazy(() => import("./components/tabs/FinesTab"));
const BorrowRequestsTab = lazy(() => import("./components/tabs/BorrowRequestsTab"));
const MyRequestsPage = lazy(() => import("./pages/MyRequestsPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const AttendanceKioskPage = lazy(() => import("./pages/AttendanceKioskPage"));
const AttendanceLogsPage = lazy(() => import("./pages/AttendanceLogsPage"));
const RoomAttendancePage = lazy(() => import("./pages/RoomAttendancePage"));
const MyAttendancePage = lazy(() => import("./pages/MyAttendancePage"));
const AttendanceScannerPage = lazy(() => import("./pages/AttendanceScannerPage"));


function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ children, allowed }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!allowed.includes(role)) return <Navigate to="/home" replace />;
  return children;
}

function IndexRedirect() {
  return <Navigate to="/home" replace />;
}

function GuestRoute({ children }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (user && role !== null) return <Navigate to="/home" replace />;
  return children;
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 16, background: "var(--bg)", color: "var(--text)" }}>
          <h2>Something went wrong</h2>
          <p style={{ color: "var(--text-muted)" }}>Please refresh the page or try again.</p>
          <button className="btn btn-primary" onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}>Reload Page</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <ErrorBoundary>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Suspense fallback={<div className="loading-screen"><div className="spinner-lg" /></div>}>
          <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/attend/kiosk" element={<AttendanceKioskPage />} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<IndexRedirect />} />
              <Route path="home" element={<HomePage />} />
              <Route path="overview" element={<Navigate to="/home" replace />} />

              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<RoleRoute allowed={["admin"]}><SettingsTab /></RoleRoute>} />
              <Route path="documents" element={<RoleRoute allowed={["admin"]}><DocumentsTab /></RoleRoute>} />
              <Route path="scanner" element={<RoleRoute allowed={["student"]}><ScannerPage /></RoleRoute>} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="borrowed" element={<Navigate to="/transactions" replace />} />
              <Route path="returned" element={<Navigate to="/transactions" replace />} />
              <Route path="catalog" element={<RoleRoute allowed={["admin"]}><CatalogPage /></RoleRoute>} />
              <Route path="persona" element={<RoleRoute allowed={["admin"]}><PersonaPage /></RoleRoute>} />
              <Route path="admin" element={<RoleRoute allowed={["admin"]}><AdminPage /></RoleRoute>} />
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
              <Route path="profile" element={<ProfilePage />} />

              <Route path="about" element={<AboutPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
