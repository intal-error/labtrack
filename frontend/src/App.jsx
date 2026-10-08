import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import { Component, Suspense, lazy, useState, useSyncExternalStore } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { subscribeSignInFlow, getSignInAttempt } from "./utils/signInFlow";
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

/**
 * Keeps a signed-in visitor on the login page until their ROLE is known.
 *
 * This used to redirect on `user` alone:
 *
 *   if (user) return <Navigate to="/dashboard" replace />;
 *
 * AuthContext calls setUser(firebaseUser) and only then awaits api.getProfile() for
 * the role, both on the same tick. So `user` went truthy while `role` was still
 * null, this route redirected, and SignInForm was unmounted before it could compare
 * the account's real role against the tile that was tapped. A student who picked
 * "Admin" was signed straight in as a student -- the role picker was decorative, and
 * the "This account is registered as student" message was unreachable.
 *
 * So the redirect now waits for the role to resolve -- but "waits" has to mean
 * KEEPING THE FORM MOUNTED, not replacing it with a spinner.
 *
 * AuthContext calls setUser(firebaseUser) and only then awaits api.getProfile(). So
 * there is always a window in which `user` is truthy and `role` is still undefined.
 * Returning a spinner for that window unmounts SignInForm, and the verdict logic it
 * owns -- idle -> ok | wrong-role | no-profile -- can then never be computed at all.
 * The earlier version of this guard did exactly that: it swapped the form for a
 * spinner while the role was pending, so on resolution `role !== undefined` was
 * always true and every sign-in fell through to the redirect below. The mismatch
 * message was unreachable code wearing a comment that claimed it prevented a real
 * bypass. Keeping `children` mounted for the pending window is what makes that
 * component's contract true.
 *
 * (Not a privilege escalation: RoleRoute and every server-side `authorize` still
 * enforce the token's real role, so a student tapping "Admin" lands on the student
 * dashboard they were always entitled to. The cost of the bug was only that the
 * explanatory message never appeared and the browser stayed signed in.)
 *
 * The failed-lookup case (role === null) redirects, and that is a correction: this
 * route previously rendered `children` for it, on the reasoning that the user would
 * "reach ProfileGate via the protected layout". They never did -- this route does
 * not navigate, so the protected layout is never entered, so ProfileGate, which
 * lives in DashboardLayout, was unreachable for the exact case it exists to handle.
 * A user whose profile lookup failed was stranded on the login page while already
 * signed in: tapping "Sign in" re-authenticated the same account, and the one screen
 * offering retry and sign-out could not be displayed at all.
 *
 * /dashboard is therefore not "the dashboard" in the failed-lookup case --
 * ProtectedRoute admits any signed-in user, and DashboardLayout returns ProfileGate
 * before rendering any role-specific content, so nothing role-gated is exposed.
 *
 * Accepted trade-off: a visitor who already has a valid session and lands on /login
 * sees the login form until the profile resolves (~1 network round-trip), then gets
 * redirected. Removing that flash needs the form to publish an "attempt in progress"
 * flag that this route could read, which couples the router to the sign-in flow; a
 * brief correct form is the cheaper defect.
 */
function GuestRoute({ children }) {
  const { user, loading, role } = useAuth();

  // Reactive read. A plain `isSignInAttemptActive()` call during render would work
  // until SignInForm released the flag from an effect: the value would change without
  // notifying React, this component would not re-render, and the redirect would never
  // happen -- leaving a user with a failed profile stuck on the login page with no
  // access to the ProfileGate that offers the retry.
  const signInAttempt = useSyncExternalStore(subscribeSignInFlow, getSignInAttempt, getSignInAttempt);

  // A submitted sign-in owns this render, FULL STOP -- before the loading check.
  //
  // `loading` is not the same as "Firebase is still starting up". AuthContext sets it
  // to true for the PROFILE fetch as well, so on every sign-in there is a window where
  // loading is true AND user is set AND the role tile the user tapped is held in
  // SignInForm's local state. Checking `loading` first rendered a spinner there, which
  // unmounted SignInForm and discarded the submitted role, so its verdict could never
  // be computed and the mismatch effect never ran.
  //
  // That is the regression this whole guard exists to prevent, and it survived four
  // previous fixes because all of them reasoned about `role === undefined` or `loading`
  // while the component being unmounted was gated on the other. A mounted-component test
  // is what finally surfaced it; the source read as correct in every revision.
  if (signInAttempt) return children;

  if (loading) return <div className="loading-screen"><div className="spinner-lg" /></div>;

  // Signed out: the login form, which is also the only place a session can start.
  if (!user) return children;

  // Signed in with a restored session and no attempt pending: wait for the profile
  // rather than bouncing, which would race it and eject a deep-linked user.
  if (role === undefined) return children;

  // Role resolved with nobody adjudicating it: either the profile lookup failed, or
  // this visitor arrived with a session and never touched the form. Both belong to
  // the protected layout, where ProfileGate handles the failure case.
  return <Navigate to="/dashboard" replace />;
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
