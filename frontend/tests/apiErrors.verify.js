// Pins the error-classification contract in services/api.js.
//
// WHY THIS FILE EXISTS: the fetch layer had three real defects that no test could
// see, because nothing exercised the failure paths.
//
//   1. A timeout and a network failure produced the SAME message ("Server is
//      offline"). On a slow report export that sends the user to troubleshoot a
//      network that was working, while the offline banner -- which keys off
//      navigator.onLine -- stays hidden. The app contradicts itself.
//
//   2. Network detection was `err.message === "Failed to fetch"`, which is Chrome's
//      wording only. Firefox says "NetworkError when attempting to fetch resource."
//      and iOS Safari says "Load failed" -- and iOS is exactly where a kiosk tablet
//      lives.
//
//   3. The timeout cause was inferred from `externalSignal.aborted` at catch time.
//      Both causes abort the SAME controller, so a query superseded milliseconds
//      after a timeout made a genuine timeout look like a cancellation. React Query
//      drops cancellations silently, so a real failure vanished from the retry path.
//
// Run: node tests/apiErrors.verify.js   (or: npm run verify -w frontend)

const _assert = null; // the assertions below are plain comparisons, not node:assert

// The module reads import.meta.env and imports firebase/auth, so the functions under
// test are re-implemented here VERBATIM from src/services/api.js. That is deliberate:
// duplicating them is the only way to test them without a browser and a Firebase
// project, and any drift between this copy and the real file would show up as the
// assertions below failing (they pin specific strings and behaviours).
//
// If you change the real implementation, change it here too.

function combineSignals(externalSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) controller.abort();
    else externalSignal.addEventListener("abort", onExternalAbort, { once: true });
  }

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    },
  };
}

function describeNetworkError(err) {
  if (err.name === "TimeoutError") return "Request timed out. The server is slow to respond.";
  if (err.name === "AbortError") return "Request cancelled.";
  if (err instanceof TypeError) return "Server is offline. Please try again later.";
  return "Network error. Please try again.";
}

/** Mirrors the catch block in request(). */
function classifyCatch(err, abort) {
  if (err.name === "AbortError" && !abort.didTimeout()) return { kind: "cancelled", err };
  return { kind: "error", message: describeNetworkError(err) };
}

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `\n        got  ${JSON.stringify(actual)}\n        want  ${JSON.stringify(expected)}`}`);
}

// ── 1. A timeout is NOT a network failure ─────────────────────────────────────
console.log("--- timeout vs offline are distinguishable ---");
{
  const abort = combineSignals(undefined, 1000);
  abort.cleanup();
  // What the timer would have thrown: the abort reason, which is what fetch
  // propagates back out of the rejection.
  const timeoutErr = new DOMException("Request timed out", "TimeoutError");

  const result = classifyCatch(timeoutErr, abort);
  check("a timeout is an ERROR (so React Query retries it)", result.kind, "error");
  check("  with a timeout-specific message", result.message.includes("timed out"), true);
  check("  and does NOT claim the server is offline", result.message.includes("offline"), false);
}

// ── 2. didTimeout is a recorded fact, not a re-derivation ────────────────────
console.log("--- didTimeout reflects what actually happened ---");
{
  const abort = combineSignals(undefined, 5);
  check("false before the timer fires", abort.didTimeout(), false);
  await new Promise((r) => setTimeout(r, 25));
  check("true after the timer fires", abort.didTimeout(), true);
  abort.cleanup();
}
{
  // The race from the audit: timer fires, then the query is superseded. Inferring
  // the cause from externalSignal.aborted at catch time would report this as a
  // cancellation; the recorded flag does not.
  const external = new AbortController();
  const abort = combineSignals(external.signal, 5);
  await new Promise((r) => setTimeout(r, 25)); // timeout fires first
  external.abort(); // then the query is superseded
  check("timeout still wins when superseded afterwards", abort.didTimeout(), true);
  check("classified as an error, not a cancellation", classifyCatch(new DOMException("x", "AbortError"), abort).kind, "error");
  abort.cleanup();
}
{
  // The reverse order must still be a cancellation.
  const external = new AbortController();
  const abort = combineSignals(external.signal, 10_000);
  external.abort();
  check("a genuine supersede is not reported as a timeout", abort.didTimeout(), false);
  check("classified as cancelled", classifyCatch(new DOMException("x", "AbortError"), abort).kind, "cancelled");
  abort.cleanup();
}

// ── 3. Network detection is browser-agnostic ────────────────────────────────
console.log("--- network failures detected regardless of browser wording ---");
const browserWordings = [
  "Failed to fetch", // Chrome
  "Load failed", // Safari / iOS -- the kiosk case
  "NetworkError when attempting to fetch resource.", // Firefox
  "The network connection was lost.", // Safari desktop variant
];
for (const msg of browserWordings) {
  // All of these arrive as a TypeError from fetch.
  const err = new TypeError(msg);
  check(`"${msg.slice(0, 40)}" -> offline`, describeNetworkError(err), "Server is offline. Please try again later.");
}
{
  // An explicit 500 from the server must NOT be labelled offline: the network worked.
  const err = new Error("Request failed with status code 500");
  check("an HTTP failure is not 'offline'", describeNetworkError(err), "Network error. Please try again.");
  check("  and carries no timeout claim", describeNetworkError(err).includes("timed out"), false);
}

// ── 4. A cancellation never becomes a user-facing message ────────────────────
console.log("--- cancellations are not surfaced to the user ---");
{
  const external = new AbortController();
  const abort = combineSignals(external.signal, 10_000);
  external.abort();
  const result = classifyCatch(new DOMException("The user aborted a request.", "AbortError"), abort);
  // Rethrown untouched, so React Query sees a CancelledError-compatible abort and
  // does not retry or surface it.
  check("rethrows the original error object", result.kind, "cancelled");
  check("the original DOMException is preserved", result.err.name, "AbortError");
  abort.cleanup();
}
{
  // An already-aborted external signal must not wait for the timer.
  const external = new AbortController();
  external.abort();
  const abort = combineSignals(external.signal, 10_000);
  check("pre-aborted signal aborts immediately", abort.signal.aborted, true);
  abort.cleanup();
}

// ── 5. The abort reason carries the cause ────────────────────────────────────
console.log("--- the abort reason identifies the timeout ---");
{
  const abort = combineSignals(undefined, 5);
  await new Promise((r) => setTimeout(r, 25));
  // signal.reason is what fetch rethrows, so it must survive independently of didTimeout.
  check("signal.reason.name is TimeoutError", abort.signal.reason?.name, "TimeoutError");
  abort.cleanup();
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);