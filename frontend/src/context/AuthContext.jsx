import { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "../services/firebase";
import { api } from "../services/api";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  /*
 * Tri-state on purpose:
 *   undefined -> the profile lookup has not completed yet
 *   null      -> it completed and found no role (no profile, or a network failure)
 *   "..."     -> the confirmed role
 *
 * Initialising to `null` (as this did before) collapses "not known yet" into "known
 * to have no role", and that distinction is load-bearing: GuestRoute waits on
 * `role === undefined` before redirecting, because redirecting early unmounted
 * SignInForm before it could verify the account's real role -- so picking the wrong
 * role tile signed you straight in anyway.
 *
 * `!role` remains true for both null and undefined, so every existing falsy check
 * keeps working unchanged.
 */
const [role, setRole] = useState(undefined);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Set only when the profile lookup failed. Distinct from role === null, which
  // is also what a genuinely profileless account produces -- the UI must tell those
  // apart, because only one of them is worth retrying.
  const [profileError, setProfileError] = useState(null);

  // The profile fetch, held in a ref so ProfileGate can retry it without the
  // subscription effect having to re-run (which would resubscribe to Firebase).
  const loadProfileRef = useRef(null);
  // Monotonic session counter, so an in-flight response can tell whether it is still
  // answering for the current user.
  const sessionIdRef = useRef(0);
  const sessionRef = useRef(0);
  // Set on unmount so a response landing after teardown cannot setState. A ref
  // because loadProfileRef outlives this effect's closure.
  const unmountedRef = useRef(false);

  useEffect(() => {
    // WHY api.getProfile AND NOT Firestore: this callback used to do two
    // getDoc() calls on `firebase/firestore`. Importing that module put the
    // ENTIRE Firestore SDK into the eagerly-loaded entry chunk -- WebChannel
    // streaming, offline persistence, the query engine -- measured at 215 kB of
    // a 562 kB bundle, re-downloaded on every app-code deploy, so two
    // single-document reads could decide the app's role.
    //
    // The server reads the very same document on every authenticated request to
    // decide permissions (middleware/auth.js resolveProfile), so the lookup was
    // never avoidable. Asking for the answer costs one small response and keeps
    // 215 kB off the critical path. authController.getProfile checks `users`
    // then `admins`, matching what this did.
    loadProfileRef.current = async () => {
      if (!auth.currentUser) return;

      // Anything stale from a previous attempt must not survive into this one.
      setProfileError(null);
      setLoading(true);
      try {
        const data = await api.getProfile();
        // Two guards, and BOTH are needed.
        //
        // sessionRef: rejects a response for a session that has already been
        // replaced. Sign out and sign in again while this request is in flight and
        // the late response would otherwise overwrite role/userProfile with the
        // PREVIOUS account's values -- a privilege leak, not just stale data, since
        // role gates every admin route.
        //
        // unmountedRef: rejects anything arriving after teardown.
        if (unmountedRef.current || sessionRef.current !== sessionIdRef.current) return;
        setRole((data.role || "").toLowerCase() || null);
        setUserProfile({ id: data.id, ...data });
      } catch (err) {
        if (unmountedRef.current || sessionRef.current !== sessionIdRef.current) return;
        // Distinguish "no profile" from "could not reach the server". Both leave
        // the user signed in, but only the second is worth retrying -- and a
        // silent role=null on a network blip used to produce a full-screen spinner
        // with no logout button and no way forward.
        console.error("Failed to load user profile:", err);
        setProfileError(err.message || "Could not load your profile");
        setRole(null);
        setUserProfile(null);
      } finally {
        if (!unmountedRef.current && sessionRef.current === sessionIdRef.current) {
          setLoading(false);
        }
      }
    };

    unmountedRef.current = false;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      sessionIdRef.current += 1;
      sessionRef.current = sessionIdRef.current;

      setUser(firebaseUser);
      if (!firebaseUser) {
        // Signed out is a DEFINITIVE "no role", not an unresolved one, so `null`
        // rather than `undefined`. `loading` is already false by the time
        // onAuthStateChanged first fires with null, which is why this also covers
        // the cold-start case where role stays `undefined` on a logged-out visitor --
        // no gate above reads `role` without `user` first.
        setRole(null);
        setUserProfile(null);
        setProfileError(null);
        setLoading(false);
        return;
      }

      await loadProfileRef.current();
    });

    return () => {
      unmountedRef.current = true;
      unsubscribe();
    };
  }, []);

  // Re-run the profile fetch for the CURRENT user. Exposed so ProfileGate can offer a
  // real retry, since the profile is precisely what failed.
  const refreshProfile = useCallback(async () => {
    await loadProfileRef.current?.();
  }, []);

  const logout = useCallback(async () => {
    try {
      await signOut(auth);
    } catch {
      // Firebase sign-out failed (it is a network operation). Local state is cleared
      // anyway -- see below for why that matters.
    }

    // setUser(null) is required and cannot be left to onAuthStateChanged.
    //
    // The listener fires asynchronously, and if signOut threw above it may never
    // fire. Leaving `user` set while clearing `role` puts the app into the exact
    // state that used to produce an inescapable spinner: role === null, user truthy,
    // ProtectedRoute satisfied, and no logout button anywhere.
    //
    // Bumping the session counter also invalidates any profile request still in
    // flight, so a slow response cannot restore the session we just ended.
    sessionIdRef.current += 1;
    sessionRef.current = sessionIdRef.current;
    setUser(null);
    setRole(null);
    setUserProfile(null);
    setProfileError(null);
    const savedEmail = localStorage.getItem("slsu_remembered_email");
    const savedTheme = localStorage.getItem("theme");
    localStorage.clear();
    sessionStorage.clear();
    if (savedEmail) {
      localStorage.setItem("slsu_remembered_email", savedEmail);
    }
    if (savedTheme) {
      localStorage.setItem("theme", savedTheme);
    }
  }, []);

  /*
 * profileError and refreshProfile are BOTH in the dependency list, deliberately.
 *
 * Omitting profileError is a correctness bug rather than an optimisation: the memo
 * captures the value from the closure at its last run, so a consumer reading it later
 * would see `null` -- which is the "no such profile" answer -- even when the real cause
 * was a network failure. ProfileGate offers a retry on exactly that distinction.
 *
 * refreshProfile is a stable useCallback, so including it costs nothing.
 *
 * The re-render cost is bounded in practice: both change at most once per sign-in,
 * alongside `role`, which is already in the list.
 */
const value = useMemo(
    () => ({ user, role, userProfile, setUserProfile, loading, logout, profileError, refreshProfile }),
    [user, role, userProfile, loading, logout, profileError, refreshProfile]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
