import { MdCloudOff, MdRefresh, MdLogout } from "react-icons/md";

/**
 * Shown when the app is authenticated but the profile could not be resolved.
 *
 * WHY THIS COMPONENT EXISTS: AuthContext calls api.getProfile() after Firebase
 * authenticates, and on failure leaves `user` set with `role === null`.
 * DashboardLayout's gate was `if (loading || !role) return <spinner/>`, so that
 * combination produced a FULL-SCREEN SPINNER with no sidebar -- and therefore no
 * logout button, no error text and no way forward. The only escape was a full page
 * reload, which just failed again.
 *
 * `role === null` has two very different causes, and this distinguishes them:
 *   - profileError set  -> the server was unreachable or errored. Retryable.
 *   - profileError null -> the uid is genuinely in neither the users nor admins
 *     collection. Retrying cannot help; the user needs to sign out.
 *
 * The message names which, because "something went wrong" on a login that visibly
 * worked is the most confusing thing this app could say.
 */
export default function ProfileGate({ error, onRetry, onSignOut }) {
  const failed = Boolean(error);

  return (
    <div className="loading-screen" style={{ flexDirection: "column", gap: 16, padding: 24, textAlign: "center" }}>
      <span style={{ color: failed ? "var(--danger, #d32f2f)" : "var(--text-muted, #666)", display: "flex" }}>
        <MdCloudOff size={40} />
      </span>

      <h2 style={{ margin: 0, fontSize: 18, color: "var(--text, #1a1a1a)" }}>
        {failed ? "Couldn't load your account" : "No account found"}
      </h2>

      <p style={{ margin: 0, maxWidth: 420, color: "var(--text-muted, #666)", fontSize: 14, lineHeight: 1.5 }}>
        {failed ? (
          <>
            You are signed in, but the server could not return your profile:{" "}
            <strong style={{ color: "var(--text, #1a1a1a)" }}>{error}</strong>
            <br />
            Your data has not been changed.
          </>
        ) : (
          <>
            You are signed in, but no account record is linked to this login. It may
            have been removed, or it may belong to a different system.
          </>
        )}
      </p>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>
        {/* Retry is only offered when it could plausibly help. */}
        {failed && (
          <button type="button" className="btn btn-green" onClick={onRetry}>
            <MdRefresh size={16} /> Try again
          </button>
        )}
        <button type="button" className="btn btn-outline" onClick={onSignOut}>
          <MdLogout size={16} /> Sign out
        </button>
      </div>
    </div>
  );
}