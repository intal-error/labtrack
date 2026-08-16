import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
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
import OverviewTab from "./components/tabs/OverviewTab";

import NotificationsTab from "./components/tabs/NotificationsTab";
import SettingsTab from "./components/tabs/SettingsTab";
import MembersTab from "./components/tabs/MembersTab";
import DocumentsTab from "./components/tabs/DocumentsTab";
import MaintenanceTab from "./components/tabs/MaintenanceTab";
import IncidentTab from "./components/tabs/IncidentTab";
import ManualsTab from "./components/tabs/ManualsTab";
import UsageLogsTab from "./components/tabs/UsageLogsTab";
import ReportsTab from "./components/tabs/ReportsTab";

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ children, allowed }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!allowed.includes(role)) return <Navigate to="/overview" replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (user) return <Navigate to="/overview" replace />;
  return children;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ThemeProvider>
          <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
          <Routes>
            <Route path="/login" element={<GuestRoute><LoginPage /></GuestRoute>} />
            <Route path="/register" element={<GuestRoute><RegisterPage /></GuestRoute>} />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<Navigate to="/overview" replace />} />
              <Route path="overview" element={<OverviewTab />} />

              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<RoleRoute allowed={["admin"]}><SettingsTab /></RoleRoute>} />
              <Route path="members" element={<RoleRoute allowed={["admin"]}><MembersTab /></RoleRoute>} />
              <Route path="documents" element={<DocumentsTab />} />
              <Route path="scanner" element={<ScannerPage />} />
              <Route path="transactions" element={<TransactionsPage />} />
              <Route path="borrowed" element={<Navigate to="/transactions" replace />} />
              <Route path="returned" element={<Navigate to="/transactions" replace />} />
              <Route path="catalog" element={<RoleRoute allowed={["admin", "faculty"]}><CatalogPage /></RoleRoute>} />
              <Route path="persona" element={<RoleRoute allowed={["admin", "faculty"]}><PersonaPage /></RoleRoute>} />
              <Route path="admin" element={<RoleRoute allowed={["admin"]}><AdminPage /></RoleRoute>} />
              <Route path="maintenance" element={<RoleRoute allowed={["admin", "faculty"]}><MaintenanceTab /></RoleRoute>} />
              <Route path="incidents" element={<IncidentTab />} />
              <Route path="manuals" element={<ManualsTab />} />
              <Route path="usage-logs" element={<RoleRoute allowed={["student"]}><UsageLogsTab /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute allowed={["admin"]}><ReportsTab /></RoleRoute>} />
              <Route path="about" element={<AboutPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/overview" replace />} />
          </Routes>
        </ThemeProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
