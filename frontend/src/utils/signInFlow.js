/**
 * Whether a submitted sign-in is still waiting for its role.
 *
 * WHY THIS EXISTS: two components legitimately want to act when the profile resolves,
 * and they must not both do it on the same render.
 *
 *   - SignInForm holds the role tile the user tapped, so it is the only component that
 *     can compare that choice against the real role. On a mismatch it must sign the
 *     browser out.
 *   - GuestRoute must move a returning visitor (valid session, no interaction with the
 *     form) off the login page.
 *
 * GuestRoute cannot tell "a sign-in was submitted and is waiting" from "this visitor
 * already had a session", and every attempt to guess broke the sign-in flow:
 *
 *   - Redirecting on `user` alone fired before the role existed, unmounting the form.
 *   - Waiting with a spinner unmounted it in the same window, one tick later.
 *   - Redirecting on any resolved role fired on the very render the verdict became
 *     computable, so the form was unmounted before its effect could run.
 *   - Gating on `loading` looked right until a component test showed that AuthContext
 *     sets loading=true for the PROFILE fetch too, not just for Firebase startup -- so
 *     the spinner still unmounted the form mid-sign-in.
 *   - Checking the flag LAST worked for the mismatch, but deadlocked the happy path:
 *     the flag was only cleared on unmount, nothing unmounted the form, and a correct
 *     login sat on the login page forever.
 *
 * So the form publishes the one bit the router lacks, and this store is REACTIVE.
 *
 * REACTIVITY IS LOAD-BEARING, NOT DECORATIVE: SignInForm releases the flag from an
 * effect. A plain module boolean would change without notifying anyone, so GuestRoute
 * would not re-render, the redirect would never happen, and ProfileGate would stay
 * unreachable for a failed profile lookup -- the exact dead end this whole mechanism
 * exists to close. useSyncExternalStore gives the read the same semantics a context
 * value would have.
 *
 * Lifetime: set when credentials are accepted, cleared on any terminal verdict, and
 * cleared again on unmount as a backstop. The unmount clear covers the case where the
 * form goes away without reaching a verdict.
 */

let attemptInFlight = false;
const listeners = new Set();

function emit() {
  listeners.forEach((listener) => listener());
}

export function markSignInAttempt() {
  if (attemptInFlight) return;
  attemptInFlight = true;
  emit();
}

export function clearSignInAttempt() {
  if (!attemptInFlight) return;
  attemptInFlight = false;
  emit();
}

/** Stable identities: useSyncExternalStore resubscribes if these change per render. */
export function subscribeSignInFlow(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSignInAttempt() {
  return attemptInFlight;
}