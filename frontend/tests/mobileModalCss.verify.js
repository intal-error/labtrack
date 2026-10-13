// The mobile CSS for the modal and the Transaction Details dialog.
//
// ── WHY THIS IS A SOURCE CHECK AND NOT A RENDER TEST ──────────────────────────
//
// The reported bug was horizontal overflow at phone widths: the dialog was wider than
// the viewport and its right edge was clipped. That is a LAYOUT outcome, and jsdom has
// no layout engine -- it computes no box sizes, so no amount of rendering in vitest
// can measure it or assert it. A test that appeared to prove the fix would be asserting
// nothing.
//
// So this reads the stylesheet text and pins the DECLARATIONS that produce the
// behaviour. It is explicitly a source check, and it says so. What it catches is the
// realistic regression: someone editing these rules and dropping the guard that stops
// the overflow from coming back. Verifying the rendered result needs a real browser,
// which is called out in the final report rather than papered over here.
//
// Run: node tests/mobileModalCss.verify.js
//
// Why node rather than vitest: this repo's node-verify files are the ones that read
// source as text (swRouting.verify.js already does exactly this for sw.js), and they
// run in the plain `npm run verify` chain with no jsdom in the way.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(here, "..", "src");

let failures = 0;

function check(name, ok, detail = "") {
  if (ok) {
    console.log(`PASS  ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }
}

const read = (rel) => fs.readFileSync(path.join(SRC, rel), "utf8");

const modal = read("styles/pages/modal.css");
const txBrowser = read("styles/pages/transactions-browser.css");
const global = read("styles/global.css");
const tabs = read("styles/pages/tabs.css");

console.log("--- one canonical definition of the modal shell ---");
{
  // The bug underneath bug 2: these classes were defined twice with different
  // widths, padding and backdrop, so which one applied depended on bundle order.
  const globalBase = /^\s*\.modal-(content|overlay)\s*\{/m.test(global);
  const tabsBase = /^\s*\.modal-(content|overlay)\s*\{/m.test(tabs);

  check("global.css no longer defines .modal-content / .modal-overlay", !globalBase);
  check("tabs.css no longer defines .modal-content / .modal-overlay", !tabsBase);
  check(
    "modal.css owns the base definition",
    /^\.modal-content\s*\{/m.test(modal) && /^\.modal-overlay\s*\{/m.test(modal)
  );
  check(
    "the mobile override is no longer stranded in global.css",
    !/@media\(max-width:768px\)\{[^}]*\.modal-overlay\{/s.test(global),
    "the bottom-sheet rules moved to modal.css"
  );
}

console.log("--- the panel cannot outgrow its container ---");
{
  // `width:100%` + `max-width:520px` inside a PADDED flex overlay lets the panel reach
  // 520px regardless of how narrow the viewport is. min(520px, 100%) bounds it to the
  // padded content box, and min-width:0 lets the flex item actually shrink to it.
  check("width is bounded by the container, not just by a fixed max", /max-width:\s*min\(520px,\s*100%\)/.test(modal));
  check("the flex item is allowed to shrink", /min-width:\s*0/.test(modal));
  check(
    "dynamic viewport units are used, with a vh fallback first",
    /max-height:\s*85vh;[\s\S]*max-height:\s*85dvh;/.test(modal) ||
      /max-height:\s*90vh;[\s\S]*max-height:\s*90dvh;/.test(modal),
    "100vh is the LARGEST viewport and can put the panel under the browser chrome"
  );
  check("the home indicator is cleared", /env\(safe-area-inset-bottom/.test(modal));
  check("the sheet is pinned to the bottom on a phone", /align-items:\s*flex-end/.test(modal));
}

console.log("--- long unbreakable values cannot push the rows wide ---");
{
  // The reported symptom. `.txd-tags` wraps BETWEEN tags, but a student email is a
  // single 31-character word with no break opportunity, so it escaped the dialog.
  const tagRule = (txBrowser.match(/\.txd-tag\s*\{[^}]*\}/s) || [""])[0];
  check(".txd-tag can break inside its own token", /overflow-wrap:\s*anywhere/.test(tagRule));
  check(".txd-tag is capped at its container", /max-width:\s*100%/.test(tagRule));

  const tagsRule = (txBrowser.match(/\.txd-tags\s*\{[^}]*\}/s) || [""])[0];
  check(".txd-tags may shrink", /min-width:\s*0/.test(tagsRule));

  // Both cells of a .txd-row default to min-width:auto, i.e. they refuse to shrink and
  // widen the row instead.
  const rowCells = txBrowser.match(/\.txd-label,\s*\n\.txd-value\s*\{[^}]*\}/s);
  check(
    "both .txd-row cells can shrink",
    rowCells !== null && /min-width:\s*0/.test(rowCells[0])
  );
  check(
    "and long values wrap inside the value column",
    /\.txd-value\s*\{[^}]*overflow-wrap:\s*anywhere/s.test(txBrowser)
  );
}

console.log("--- the close button exists and is usable on a phone ---");
{
  check(".modal-close is styled", /\.modal-close\s*\{/.test(modal));
  const closeRule = (modal.match(/\.modal-close\s*\{[^}]*\}/s) || [""])[0];
  check("it is a large touch target (>=40px)", /width:\s*4[04]px/.test(closeRule));
  check("it is absolutely positioned out of the content flow", /position:\s*absolute/.test(closeRule));
  check("it has a visible focus ring for keyboard users", /\.modal-close:focus-visible\s*\{/.test(modal));
  check("the heading is padded so the button cannot cover it", /\.modal-content h2\s*\{[^}]*padding-right:\s*44px/s.test(modal));
}

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);