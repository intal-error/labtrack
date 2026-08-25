import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import ScannerPage from "./pages/ScannerPage";
import TransactionsPage from "./pages/TransactionsPage";
import CatalogPage from "./pages/CatalogPage";
import PersonaPage from "./pages/PersonaPage";
import AdminPage from "./pages/AdminPage";
import AboutPage from "./pages/AboutPage";
import HomePage from "./pages/HomePage";

import NotificationsTab from "./components/tabs/NotificationsTab";
import SettingsTab from "./components/tabs/SettingsTab";
import MembersTab from "./components/tabs/MembersTab";
import DocumentsTab from "./components/tabs/DocumentsTab";
import MaintenanceTab from "./components/tabs/MaintenanceTab";
import IncidentTab from "./components/tabs/IncidentTab";
import ManualsTab from "./components/tabs/ManualsTab";
import UsageLogsTab from "./components/tabs/UsageLogsTab";
import ReportsTab from "./components/tabs/ReportsTab";
import FinesTab from "./components/tabs/FinesTab";
import BorrowRequestsTab from "./components/tabs/BorrowRequestsTab";
import MyRequestsPage from "./pages/MyRequestsPage";
import ProfilePage from "./pages/ProfilePage";
import LabActivityPage from "./pages/LabActivityPage";

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
  if (user && role) return <Navigate to="/home" replace />;
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
          <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<IndexRedirect />} />
              <Route path="home" element={<HomePage />} />
              <Route path="overview" element={<Navigate to="/home" replace />} />

              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<RoleRoute allowed={["admin"]}><SettingsTab /></RoleRoute>} />
              <Route path="members" element={<RoleRoute allowed={["admin"]}><MembersTab /></RoleRoute>} />
              <Route path="documents" element={<DocumentsTab />} />
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
              <Route path="fines" element={<RoleRoute allowed={["admin"]}><FinesTab /></RoleRoute>} />
              <Route path="borrow-requests" element={<RoleRoute allowed={["admin"]}><BorrowRequestsTab /></RoleRoute>} />
              <Route path="my-requests" element={<MyRequestsPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="lab-sessions" element={<LabActivityPage />} />
              <Route path="about" element={<AboutPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/home" replace />} />
          </Routes>
          </ErrorBoundary>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
