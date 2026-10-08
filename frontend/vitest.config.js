import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Vitest config, kept SEPARATE from vite.config.js on purpose.
 *
 * vite.config.js carries two plugins that have no business running in a test:
 *
 *   - ViteImageOptimizer shells out to sharp and rewrites images through a build
 *     pipeline. Under test that is pure overhead, and a sharp binary that is missing
 *     or mismatched would fail the suite for reasons unrelated to the code.
 *   - VitePWA runs the whole precache/manifest pipeline at build time, including
 *     generating the service worker. Tests do not need a service worker, and its
 *     output is already asserted directly against dist/sw.js by swRouting.verify.js.
 *
 * A separate file also keeps the production config honest: test-only settings cannot
 * leak into a real build.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // jsdom, not node. Almost everything worth testing here is React: ProfileGate,
    // SignInForm's verdict machine, GuestRoute. Those need a DOM, and Testing Library
    // queries it the way a user would (by role, label, text) rather than by
    // implementation detail.
    environment: "jsdom",

    globals: true,

    setupFiles: ["./tests/setup.js"],

    css: false,

    // Only *.test.js(x) and *.spec.js(x). Critically this EXCLUDES the existing
    // tests/*.verify.js scripts, which are standalone node programs wired into
    // `npm run verify`. They call process.exit and assert against the real
    // filesystem; running them under Vitest would be meaningless at best and
    // would abort the whole run at worst.
    //
    // Note: neither `deps.optimizer` nor `server.deps.inline` is set. Both were
    // tried and both were removed after measuring that the suite passed identically
    // without them -- speculative config that cannot be justified by an observed
    // failure is just a trap for whoever debugs it next.
    include: [
      "src/**/*.{test,spec}.{js,jsx}",
      "tests/**/*.{test,spec}.{js,jsx}",
    ],

    // A hung test should fail, not stall a CI job.
    testTimeout: 15000,
    hookTimeout: 15000,
  },
});