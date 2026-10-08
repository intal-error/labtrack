/**
 * Short haptic pulses.
 *
 * WHY THIS EXISTS: a QR scan is a physical action whose result is not visible for
 * 300-800 ms -- the camera teardown, then the lookup request. On the kiosk, in a busy
 * lab, with the operator holding the device one-handed, that delay reads as "did that
 * work?" and people scan again, which is exactly the duplicate-scan case the server
 * has to guard against. A short tick answers the question without a screen.
 *
 * Progressive enhancement throughout:
 *   - navigator.vibrate is absent on iOS Safari and desktop, in which case every
 *     function is a no-op. Nothing depends on it existing.
 *   - It is capped by the user agent (a page may not vibrate repeatedly without
 *     user interaction), and failures are swallowed -- a blocked vibration must never
 *     interrupt a scan.
 *   - `prefers-reduced-motion` is NOT consulted, because haptics are not motion and
 *     that setting governs animation, not touch feedback. The setting that does
 *     govern haptics is the OS-level vibration toggle, which this cannot and should
 *     not override.
 */

const isSupported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function buzz(pattern) {
  if (!isSupported) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Blocked by policy or a user-agent restriction. Silent by design.
  }
}

/** Code recognised -- a scan succeeded. Deliberately brief. */
export function hapticSuccess() {
  buzz(18);
}

/** Code rejected, or a duplicate. A double pulse reads as "no" without a sound. */
export function hapticError() {
  buzz([28, 60, 28]);
}

/**
 * Something needs attention but is not a failure -- e.g. the offline banner appearing,
 * or a camera falling back to the front lens.
 */
export function hapticWarn() {
  buzz([12, 50, 12]);
}

/** Camera opened / closed. */
export function hapticLight() {
  buzz(10);
}

/** Explicitly stop any vibration, e.g. when a component unmounts mid-pattern. */
export function hapticCancel() {
  if (!isSupported) return;
  try {
    navigator.vibrate(0);
  } catch {
    // See buzz().
  }
}

export const hapticsSupported = isSupported;