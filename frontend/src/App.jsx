import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component, Suspense, lazy, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ThemeProvider } from "./context/ThemeContext";
import SplashScreen from "./components/ui/SplashScreen";
import InstallPrompt from "./components/ui/InstallPrompt";
import OfflineBanner from "./components/ui/OfflineBanner";
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
const KioskAuthGate = lazy(() => import("./pages/KioskAuthGate"));

const AttendanceLogsPage = lazy(() => import("./pages/AttendanceLogsPage"));
const RoomAttendancePage = lazy(() => import("./pages/RoomAttendancePage"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const StudentsPage = lazy(() => import("./pages/StudentsPage"));

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function RoleRoute({ children, allowed, fallback = "/dashboard" }) {
  const { role, loading } = useAuth();
  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;

  // role === undefined means the profile lookup has not resolved. Bouncing to the
  // dashboard here would race it: the redirect could fire before the role arrives,
  // and a user deep-linking to /transactions would be ejected for no reason.
  // DashboardLayout renders ProfileGate for the unresolved/null cases anyway, so
  // waiting here is safe and costs nothing.
  if (role === undefined) return <div className="loading-screen"><div className="spinner-lg" /></div>;

  // role === null means the lookup FAILED. Fail closed: an unknown role must not
  // reach a role-gated view. DashboardLayout's ProfileGate is what the user actually
  // sees, because it returns before this <Outlet /> is reached.
  if (!allowed.includes(role)) return <Navigate to={fallback} replace />;
  return children;
}

/**
 * Sends a signed-in user to the route the BACKEND chose.
 *
 * There is no role picker on the login page, so nothing on the client is in a
 * position to decide this: GET /api/auth/profile resolves the role, the course and
 * `landingPath` in one response, and that answer is authoritative. Re-deriving the
 * route here from the role string is exactly how the client and server end up
 * disagreeing about where someone belongs.
 *
 * Falls back to /dashboard while the profile is unresolved, which is still correct
 * for both admin tiers.
 */
function LandingRedirect() {
  const { landingPath } = useAuth();
  return <Navigate to={landingPath || "/dashboard"} replace />;
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

/**
/**
 * Keeps a signed-out visitor on the login page, and sends a signed-in one wherever
 * the backend says.
 *
 * This used to be the most heavily commented component in the app. The role tile
 * meant GuestRoute had to distinguish "a sign-in was submitted and is waiting for
 * its role" from "this visitor already had a session", and every way of guessing
 * broke something: redirecting on `user` fired before the role existed; waiting with
 * a spinner unmounted the form one tick later; gating on `loading` was wrong because
 * AuthContext sets loading=true for the PROFILE fetch too; and publishing a reactive
 * flag to settle it deadlocked the happy path, parking a correct login on the login
 * page forever. The full post-mortem lived in the now-deleted src/utils/signInFlow.js.
 *
 * All of it existed to police a picker that no longer exists. With no role for the
 * client to compare against there is nothing to adjudicate, so the form no longer
 * owns any work that an unmount could interrupt -- and that is what made the
 * `signInAttempt` flag unnecessary rather than merely redundant. Deleting it means a
 * brief spinner now covers the profile fetch, which is the right trade for a form
 * with nothing left to do.
 *
 * WHY `loading` IS STILL CHECKED FIRST: AuthContext cannot tell a signed-in user from
 * a signed-out one until Firebase resolves. Checking `!user` first would therefore
 * flash the login form at a user who is already signed in, on every hard refresh.
 *
 * `role === undefined` holds the form rather than a spinner for the remaining window
 * -- AuthContext calls setUser() and only then awaits the profile -- so a
 * session-restoring visitor sees the correct form instead of a flash of something
 * else.
 *
 * A FAILED lookup (role === null) goes to /dashboard, NOT back to /login:
 * ProfileGate lives in DashboardLayout, which this route never enters, so redirecting
 * to the login page would make the one screen offering retry unreachable for exactly
 * the case it exists to handle.
 */
/**
 * Catch-all destination.
 *
 * CHANGED for the kiosk. This used to send every unknown path to /dashboard
 * unconditionally. A kiosk account hitting a stray URL would land on DashboardPage,
 * which renders the STUDENT dashboard for a profile with no schoolId -- a broken page,
 * with no in-app route back to /attend/kiosk, because no nav item points there. A kiosk
 * is now a real signed-in session, so it can reach paths it did not before and needs a
 * way back. Every other role is unchanged.
 */
function UnknownPathRedirect() {
  const { role } = useAuth();
  return <Navigate to={role === "kiosk" ? "/attend/kiosk" : "/dashboard"} replace />;
}

function GuestRoute({ children }) {
  const { user, loading, role, landingPath } = useAuth();

  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;

  // Signed out: the login form, which is also the only place a session can start.
  if (!user) return children;

  // Signed in, profile not resolved yet: keep the form mounted (see above).
  if (role === undefined) return children;

  // Resolved. A failed lookup leaves role === null and landingPath null, and goes to
  // /dashboard so ProfileGate can offer the retry.
  return <Navigate to={landingPath || "/dashboard"} replace />;
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
          <OfflineBanner />
          <InstallPrompt />
          <Routes>
            <Route path="/login" element={<Suspense fallback={fullScreenFallback}><GuestRoute><LoginPage /></GuestRoute></Suspense>} />
            <Route path="/register" element={<Suspense fallback={fullScreenFallback}><GuestRoute><LoginPage /></GuestRoute></Suspense>} />
            <Route
          path="/attend/kiosk"
          element={
            <Suspense fallback={fullScreenFallback}>
              {/* GATED. The kiosk used to be a public route: no auth wrapper, so anyone
                  who could load the URL could record attendance for any student. It now
                  requires a real `kiosk` account. The gate wraps rather than being checked
                  inside the page, so the page never mounts -- and its camera never starts --
                  while signed out. */}
              <KioskAuthGate>
                {({ blocked, setBusy }) => (
                  <AttendanceKioskPage kioskBlocked={blocked} onScanBusy={setBusy} />
                )}
              </KioskAuthGate>
            </Suspense>
          }
        />
            <Route path="/" element={<ProtectedRoute><DashboardLayout /></ProtectedRoute>}>
              <Route index element={<LandingRedirect />} />
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
              {/* Admin-only, and additionally course-scoped on the server: the roster
                  is derived from the caller's own course, so the same route serves
                  every Course Admin without a per-course variant. */}
              <Route path="students" element={<RoleRoute allowed={["admin"]}><StudentsPage /></RoleRoute>} />
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
<Route path="*" element={<UnknownPathRedirect />} />
            </Routes>
        </ThemeProvider>
      </AuthProvider>
      </QueryClientProvider>
    </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
