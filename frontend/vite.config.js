import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { ViteImageOptimizer } from "vite-plugin-image-optimizer";

export default defineConfig({
  plugins: [
    react(),
    ViteImageOptimizer({
      png: { quality: 80 },
      jpeg: { quality: 80 },
      jpg: { quality: 80 },
      webp: { lossless: false, quality: 85 },
    }),
    VitePWA({
      // injectManifest rather than the default generateSW. See src/sw.js: the
      // generated worker cannot serve the app shell when online and a friendly
      // offline page when offline, because navigateFallback is a single value.
      // Workbox is still the implementation, so this adds no dependency.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.js",
      registerType: "autoUpdate",
      // includeAssets was ["logo.png", "Lucena.webp", "Lucena.png"] and did
      // nothing: every one of those files is already matched by the workbox
      // globPatterns below, so they were being listed twice while the actual
      // payload stayed the same. The glob patterns are the whole mechanism, so
      // this list is gone rather than trimmed.
      manifest: {
        name: "SLSU LabTrack - Borrowing, Return & Logbook Attendance",
        short_name: "LabTrack",
        description:
          "Laboratory Equipment Borrowing, Return & Logbook Attendance System for SLSU",
        theme_color: "#000000",
        background_color: "#04140c",
        display: "standalone",
        // display_override lets a desktop install opt into the window-controls
        // overlay (title bar drawn by the app) while every other platform keeps
        // plain standalone. Ordering matters: the first supported entry wins.
        display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
        // Portrait-only was a hard lock. The scanner, the 50-row attendance table
        // and the report tables are all landscape-friendly and a lab tablet is
        // often held sideways, so orientation is left to the device. The kiosk at
        // /attend/kiosk still forces portrait in its own CSS.
        orientation: "any",
        // Stable install identity. Without an explicit id the browser derives one
        // from start_url, which changes if the deploy path ever moves -- that
        // would orphan an existing install and prompt the user to install again.
        id: "/",
        scope: "/",
        // Query-suffixed so a reload from the home-screen icon does not inherit
        // the URL the user last happened to be on.
        start_url: "/?source=pwa",
        categories: ["education", "utilities"],
        lang: "en",
        dir: "ltr",
        prefer_related_applications: false,
        // Shortcuts to the two destinations an installed user actually opens.
        // Each is lazy-routed, so these cost nothing until tapped.
        shortcuts: [
          {
            name: "Scan equipment",
            short_name: "Scanner",
            description: "Scan an item or borrower QR code",
            url: "/scanner",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }],
          },
          {
            name: "My activity",
            short_name: "Activity",
            description: "Borrowed items, requests and fines",
            url: "/my-activity",
            icons: [{ src: "/icons/icon-96x96.png", sizes: "96x96", type: "image/png" }],
          },
        ],
        icons: [
          {
            src: "/icons/icon-72x72.png",
            sizes: "72x72",
            type: "image/png",
          },
          {
            src: "/icons/icon-96x96.png",
            sizes: "96x96",
            type: "image/png",
          },
          {
            src: "/icons/icon-128x128.png",
            sizes: "128x128",
            type: "image/png",
          },
          {
            src: "/icons/icon-144x144.png",
            sizes: "144x144",
            type: "image/png",
          },
          {
            src: "/icons/icon-152x152.png",
            sizes: "152x152",
            type: "image/png",
          },
          {
            src: "/icons/icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/icon-384x384.png",
            sizes: "384x384",
            type: "image/png",
          },
          {
            src: "/icons/icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
          // The maskable variant is a separate asset from the "any" one, not a
          // relabelling of it. A maskable icon is cropped to a circle/squircle by
          // the launcher, so the artwork must keep its important content inside
          // the inner 80% safe zone. Pointing "any maskable" at the plain icon
          // (which is what this did) gets the logo's edges clipped on Android.
          // Both sizes are generated: the 192 is what Chrome's install UI
          // previews, so shipping only the 512 made it fetch 204 kB to draw 192 px.
          {
            src: "/icons/maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      // NOTE: injectManifest is a SIBLING of workbox, not a child of it.
      //
      // Everything about caching lives in src/sw.js, which is injected verbatim --
      // precacheAndRoute, the navigation fallback and every runtime rule are
      // defined there so the offline behaviour is readable as code rather than as
      // a config object.
      //
      // Precaching EVERYTHING was the single largest waste in the old PWA: 97
      // files and 3.4 MiB downloaded during service-worker install, before the
      // user had seen anything -- including 401 kB of charting library, a 326 kB
      // QR scanner behind two routes, and a 752 kB PNG fallback no current
      // browser picks. These patterns are now "what a cold start cannot render
      // without": the shell, its CSS, the vendor code the shell executes, the
      // icons and the offline page. Everything else is fetched on navigation and
      // cached by the runtime rules in src/sw.js.
      //
      // maximumFileSizeToCacheInBytes is raised from the 2 MiB default so a future
      // full-resolution image cannot silently fail to precache.
      injectManifest: {
        globPatterns: [
            "index.html",
            "offline.html",
            "assets/index-*.js",
            "assets/index-*.css",
            "assets/vendor-react-*.js",
            "assets/vendor-firebase-*.js",
            "assets/vendor-query-*.js",
            "assets/vendor-toast-*.js",
            "icons/*.png",
          "favicon.ico",
          "favicon-32.png",
        ],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Split by change frequency, not just by package. firebase/auth changes
        // only when its dependency is bumped; app code changes constantly. Keeping
        // them apart is what stops a one-line UI edit from invalidating the whole
        // SDK in every returning visitor's cache.
        //
        // recharts is deliberately NOT listed here. It was, and that is the bug:
        // naming a chunk forces it to be a static dependency of anything that
        // imports it, so `DashboardPage` -- the route every user lands on, via
        // IndexRedirect -- pulled 410 kB of charting library that no student ever
        // renders a pixel of. It now reaches the bundle only through the lazy
        // chart components, so Rollup names the chunk itself.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-firebase": ["firebase/app", "firebase/auth"],
          "vendor-toast": ["react-hot-toast"],
        },
      },
    },
    // The entry chunk is what blocks first paint, so it gets a budget. Before the
    // Firestore SDK left the client this fired on every build at ~550 kB; the limit
    // now exists to catch a regression of the same shape rather than to describe
    // the status quo.
    chunkSizeWarningLimit: 350,
  },
});
