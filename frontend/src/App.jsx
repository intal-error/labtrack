import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import ScannerPage from "./pages/ScannerPage";
import BorrowedPage from "./pages/BorrowedPage";
import ReturnedPage from "./pages/ReturnedPage";
import CatalogPage from "./pages/CatalogPage";
import PersonaPage from "./pages/PersonaPage";
import AdminPage from "./pages/AdminPage";
import AboutPage from "./pages/AboutPage";
import OverviewTab from "./components/tabs/OverviewTab";
import RecordsTab from "./components/tabs/RecordsTab";
import ClassesTab from "./components/tabs/ClassesTab";
import ReportsTab from "./components/tabs/ReportsTab";
import NotificationsTab from "./components/tabs/NotificationsTab";
import SettingsTab from "./components/tabs/SettingsTab";
import MembersTab from "./components/tabs/MembersTab";
import DocumentsTab from "./components/tabs/DocumentsTab";

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
              <Route path="records" element={<RoleRoute allowed={["admin", "faculty"]}><RecordsTab /></RoleRoute>} />
              <Route path="classes" element={<RoleRoute allowed={["admin", "faculty"]}><ClassesTab /></RoleRoute>} />
              <Route path="reports" element={<RoleRoute allowed={["admin", "faculty"]}><ReportsTab /></RoleRoute>} />
              <Route path="notifications" element={<NotificationsTab />} />
              <Route path="settings" element={<RoleRoute allowed={["admin"]}><SettingsTab /></RoleRoute>} />
              <Route path="members" element={<RoleRoute allowed={["admin"]}><MembersTab /></RoleRoute>} />
              <Route path="documents" element={<DocumentsTab />} />
              <Route path="scanner" element={<ScannerPage />} />
              <Route path="borrowed" element={<BorrowedPage />} />
              <Route path="returned" element={<ReturnedPage />} />
              <Route path="catalog" element={<RoleRoute allowed={["admin", "faculty"]}><CatalogPage /></RoleRoute>} />
              <Route path="persona" element={<RoleRoute allowed={["admin", "faculty"]}><PersonaPage /></RoleRoute>} />
              <Route path="admin" element={<RoleRoute allowed={["admin"]}><AdminPage /></RoleRoute>} />
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
