/**
 * Vitest setup, loaded before every test file.
 *
 * Two jobs:
 *   1. Teach Testing Library's matchers (toBeInTheDocument, toBeDisabled, ...)
 *      to Vitest. Imported here rather than per-test so no test can forget.
 *   2. Provide the handful of browser APIs jsdom does not implement but this app
 *      touches at import time. Each is stubbed deliberately, and the reason is
 *      recorded, because "why does this test need matchMedia" is otherwise a
 *      twenty-minute investigation.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

// ── 1. Cleanup between tests ────────────────────────────────────────────────
// Without this, a rendered tree from one test stays in document.body and the next
// test's getByRole finds elements it did not render. With React 18 and RTL this is
// automatic when globals are enabled, but stating it removes the ambiguity.
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── 2. matchMedia ───────────────────────────────────────────────────────────
// ThemeContext reads prefers-color-scheme at mount to pick the initial theme.
// jsdom ships no matchMedia at all, so this throws on the first render of anything
// wrapped in the provider. A stub returning a fixed `matches: false` gives light
// mode; tests that care about dark mode override this locally.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

// ── 3. scrollTo ─────────────────────────────────────────────────────────────
// Several components scroll a table container into view on filter change. jsdom has
// no layout engine and no scrollTo, so it is absent and the call throws.
if (!window.scrollTo) {
  window.scrollTo = () => {};
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => {};
}

// ── 4. ResizeObserver ───────────────────────────────────────────────────────
// Recharts and the sidebar collapse both observe their container. jsdom lacks it.
// A no-op class is enough: nothing under test asserts on observed dimensions.
if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

// ── 5. IntersectionObserver ─────────────────────────────────────────────────
// Same reasoning as ResizeObserver: present-but-inert beats absent-and-throwing.
if (!globalThis.IntersectionObserver) {
  globalThis.IntersectionObserver = class {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  };
}

// ── 6. crypto.subtle ────────────────────────────────────────────────────────
// AuthContext hashes nothing, but the service worker's identity partitioning does,
// and any component test that reaches that code would otherwise fail on a missing
// API rather than on its own logic. Node 18+ provides webcrypto on globalThis.crypto
// for secure contexts only; jsdom's is a stub without digest.
if (globalThis.crypto && !globalThis.crypto.subtle) {
  const { webcrypto } = await import("node:crypto");
  Object.defineProperty(globalThis.crypto, "subtle", {
    value: webcrypto.subtle,
    configurable: true,
  });
}

// ── 7. localStorage / sessionStorage leak between files ─────────────────────
// jsdom gives each FILE a fresh environment, so cross-file leakage is not a concern,
// but the stored-credentials helpers in AuthContext do persist a remembered email and
// theme preference. Clearing keeps tests order-independent within a file.
if (typeof window !== "undefined" && window.localStorage) {
  window.localStorage.clear();
}