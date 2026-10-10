import { useCallback, useEffect, useRef, useState } from "react";
import { setPersistence, browserSessionPersistence, onAuthStateChanged, signOut } from "firebase/auth";

/**
 * Idle timeout for the attendance kiosk.
 *
 * WHY IT EXISTS. A kiosk is a shared, unattended device. With the old shared-secret
 * scheme it held a permanent credential that anyone could read from the bundle. Now it
 * holds a real session, which is far better but still not nothing: an unattended tablet
 * with a live kiosk session is a standing authorised signer-in on the attendance
 * system. Five minutes idle, then out.
 *
 * THE TWO-PHASE TIMER, and why the countdown is not dismissible:
 *
 *   0-4:00   idle, doing nothing
 *   4:00     countdown starts, visible
 *   5:00     hard sign-out
 *
 * A dismissible warning would be defeated by the person it is aimed at -- they would
 * dismiss it. There is no extend, no "stay signed in", no snooze. Activity during the
 * countdown deliberately does NOT reset the timer: the countdown is the warning, and a
 * user who keeps touching the screen to postpone it has exactly the intent the timeout
 * exists to stop.
 *
 * IN-FLIGHT WORK IS ALLOWED TO FINISH. `busy` is set by the page while a scan is being
 * processed. If the timer fires during that window we remember `pendingSignOut` and
 * perform it as soon as `busy` clears. Signing out mid-submit would abort a time-in
 * that the backend had already accepted, leaving the logbook and the student's view
 * disagreeing -- the failure mode is worse than a slightly late sign-out. This is the
 * "finish the in-flight scan safely" requirement.
 *
 * `blocked` is the other half: while the countdown is running, the page must not START
 * a new scan. A scan started at 4:59 would keep the device busy indefinitely, so the
 * countdown would never be able to complete.
 *
 * PERSISTENCE. browserSessionPersistence (tab-scoped) rather than the default
 * localStorage, and it is applied ONLY for the kiosk sign-in. The consequence is the
 * point: a reload does not restore the kiosk session, so a browser restart or a
 * refreshed tab hands the device back unauthenticated. That applies to no other part of
 * the app -- the student and admin flows keep their existing persistence untouched.
 */

export const KIOSK_IDLE_MS = 5 * 60 * 1000; // 5 minutes before the countdown starts
export const KIOSK_COUNTDOWN_MS = 60 * 1000; // 60 seconds of visible warning

export function useKioskSession(auth, { onSignedOut } = {}) {
  const [countdown, setCountdown] = useState(0); // seconds remaining, 0 = not counting down
  const [blocked, setBlocked] = useState(false); // true while the countdown runs

  // Initialised to 0 rather than Date.now(): the ref's first meaningful value is written
  // by the activity listener below, which sets it the moment the session actually goes
  // idle-clock-active. Calling Date.now() in the render body made the value depend on
  // when React happened to render, so two renders of an identical tree could disagree.
  const lastActivity = useRef(0);
  const busy = useRef(false); // a scan is mid-flight
  const pendingSignOut = useRef(false);

  const doSignOut = useCallback(async () => {
    setCountdown(0);
    setBlocked(false);
    try {
      await signOut(auth);
    } catch {
      // Even if the network call fails, drop local state so the gate re-evaluates.
    }
    if (onSignedOut) onSignedOut();
  }, [auth, onSignedOut]);

  const touch = useCallback(() => {
    lastActivity.current = Date.now();
  }, []);

  /**
   * Called by the page. `isBusy` true while a scan is being submitted, which both
   * defers sign-out and blocks new scans during the countdown.
   */
  const setBusy = useCallback((isBusy) => {
    busy.current = Boolean(isBusy);
    if (!busy.current && pendingSignOut.current) {
      // The in-flight scan finished; honour the timeout now.
      pendingSignOut.current = false;
      void doSignOut();
    }
  }, [doSignOut]);

  useEffect(() => {
    // Tab-scoped session, so a reload does NOT restore the kiosk session. Applied only
    // here, only for the kiosk route.
    setPersistence(auth, browserSessionPersistence).catch(() => {});

    const events = ["pointerdown", "keydown", "touchstart", "mousemove", "wheel"];
    const onActivity = () => touch();
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const tick = setInterval(() => {
      // A scan in flight wins over the timer, but the timer keeps its place so the
      // countdown resumes where it stopped rather than restarting.
      if (busy.current) {
        lastActivity.current = Date.now();
        return;
      }
      const idleFor = Date.now() - lastActivity.current;
      if (idleFor < KIOSK_IDLE_MS) {
        setCountdown(0);
        setBlocked(false);
        return;
      }
      const remaining = Math.max(0, Math.ceil((KIOSK_IDLE_MS + KIOSK_COUNTDOWN_MS - idleFor) / 1000));
      setCountdown(remaining);
      setBlocked(true);
      if (remaining <= 0) {
        void doSignOut();
      }
    }, 1000);

    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [auth, doSignOut, touch]);

  return { countdown, blocked, touch, setBusy };
}

export { onAuthStateChanged };