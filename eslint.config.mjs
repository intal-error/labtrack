import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";

export default [
  {
    ignores: [
      "node_modules/**",
      "**/node_modules/**",
      "frontend/dist/**",
      "**/coverage/**",
      "**/build/**",
      ".vercel/**",
    ],
  },
  {
    files: ["frontend/**/*.{js,jsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
      },
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat["jsx-runtime"].rules,
      ...reactHooks.configs.flat.recommended.rules,
      "react/prop-types": "off",
      "react/no-unknown-property": "off",
      "react/no-unescaped-entities": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true, allowExportNames: ["useAuth", "useTheme"] },
      ],
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "backend/**/*.js",
      "scripts/**/*.js",
      "*.js",
      "*.cjs",
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["eslint.config.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ["frontend/vite.config.js", "frontend/*.config.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // The service worker runs in the SW global scope, not the window: no DOM, and
    // the worker-lifetime globals instead (self, caches, clients). The workbox
    // imports come from the vite-plugin-pwa dependency tree and are resolved at
    // build time, so they are not declared here.
    files: ["frontend/src/sw.js"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.serviceworker,
      },
    },
  },
  {
    files: ["backend/scripts/**/*.js"],
    languageOptions: {
      sourceType: "commonjs",
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Verification and component-test files are Node-run: they need process/console
    // rather than the browser globals the frontend block supplies, but they are still
    // ES modules because frontend/package.json sets "type": "module".
    //
    // The glob covers .jsx AS WELL AS .js. It used to be `**/*.js` only, so the first
    // component test -- tests/authFlow.test.jsx -- silently fell through to the
    // frontend block above and inherited BROWSER globals. That is invisible until
    // someone writes `process.env` or `__dirname` in a .jsx test and gets two
    // no-undef errors that the identical code in a .js test compiles clean. Verified:
    // before this change, a one-line .jsx probe reported both as undefined while the
    // .js probe reported neither. (backend/tests/** needs no change; it is already
    // covered by the backend/**/*.js block above.)
    files: ["frontend/tests/**/*.{js,jsx}"],
    languageOptions: {
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // react-refresh/only-export-components is a Fast Refresh rule: it warns when a
      // module exports both components and non-components, because HMR cannot swap
      // such a module cleanly. Test files are never HMR boundaries and routinely
      // export helpers alongside components, so the rule only produces noise here.
      "react-refresh/only-export-components": "off",
    },
  },
];
