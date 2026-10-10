/**
 * Ownership checks on the notification endpoints.
 *
 * WHY THIS FILE EXISTS. `notificationsController` had NO test at all -- the only
 * notification assertions anywhere were incidental checks on written rows inside
 * incidentWorkflow.verify.js. So the read path, and `dismiss` in particular, were
 * completely unverified.
 *
 * `dismiss` used to select only `dismissed_by`, never `target_user_id`, so it had no
 * way to know whose notification it was mutating. Any authenticated user could
 * dismiss anyone's notification. The impact was narrower than it looked --
 * `dismissed_by` is a per-viewer array and the read path filters on the CURRENT
 * caller's uid, so appending your own uid only hides the row from you, not from its
 * owner. It was an unauthorized write to another user's record, not a way to suppress
 * someone else's notifications.
 *
 * NOTE ON ROUTING: `DELETE /api/notifications/:id` maps to `dismiss`, NOT to a delete
 * handler. There is no delete handler in this controller. An earlier claim that the
 * delete route was the destructive one was wrong.
 *
 * Run: node tests/notifications.verify.js
 */

// Stub Supabase before the controller requires it.
const { createClient } = require("./helpers/inMemorySupabase");
const TABLE = {
  notifications: [
    { id: "n-for-marc", target_user_id: "marc", read: false, dismissed_by: [], title: "Borrow approved" },
    { id: "n-for-other", target_user_id: "someone-else", read: false, dismissed_by: [], title: "Borrow approved" },
  ],
};
require.cache[require.resolve("../src/config/supabase")] = {
  id: require.resolve("../src/config/supabase"),
  filename: require.resolve("../src/config/supabase"),
  loaded: true,
  exports: { supabase: createClient(TABLE) },
};

const controller = require("../src/controllers/notificationsController");

let failures = 0;
let passes = 0;
function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passes += 1; console.log(`PASS  ${label}`); } else {
    failures += 1;
    console.log(`FAIL  ${label}`);
    console.log(`      expected ${JSON.stringify(expected)}  actual ${JSON.stringify(actual)}`);
  }
}

const mockRes = () => ({
  statusCode: 200,
  payload: undefined,
  status(c) { this.statusCode = c; return this; },
  json(b) { this.payload = b; return this; },
});

const call = async (fn, req) => {
  const res = mockRes();
  await fn(req, res);
  return { statusCode: res.statusCode, payload: res.payload };
};

// `query: {}` is REQUIRED, not cosmetic: getAll reads `req.query.unreadOnly`
// unguarded (notificationsController.js), so a request without `query` throws inside
// the try block and is swallowed into a 500 with an empty body -- which looks
// exactly like "no notifications returned" if you do not know.
const reqFor = (uid, params = {}) => ({ user: { uid, role: "student" }, params, query: {}, body: {} });
const row = (id) => TABLE.notifications.find((r) => r.id === id);

(async () => {
  console.log("--- dismiss: ownership ---");
  {
    const r = await call(controller.dismiss, reqFor("marc", { id: "n-for-marc" }));
    check("owner CAN dismiss their own", r.statusCode, 200);
    check("  ...and their uid was appended", row("n-for-marc").dismissed_by, ["marc"]);
  }
  {
    const r = await call(controller.dismiss, reqFor("mallory", { id: "n-for-other" }));
    // 404 not 403: a 403 would confirm the notification exists and is addressed
    // to somebody, which is itself a disclosure.
    check("non-owner CANNOT dismiss someone else's (404, not 403)", r.statusCode, 404);
    check("  ...and the row is untouched", row("n-for-other").dismissed_by, []);
  }
  {
    const r = await call(controller.dismiss, reqFor("marc", { id: "does-not-exist" }));
    check("a missing notification is a 404", r.statusCode, 404);
  }

  console.log("--- dismiss is idempotent ---");
  {
    const before = row("n-for-marc").dismissed_by.length;
    const r = await call(controller.dismiss, reqFor("marc", { id: "n-for-marc" }));
    check("dismissing twice is still 200", r.statusCode, 200);
    check("  ...and does not append a duplicate uid", row("n-for-marc").dismissed_by.length, before);
  }

  console.log("--- markRead: ownership ---");
  {
    const r = await call(controller.markRead, reqFor("someone-else", { id: "n-for-other" }));
    check("owner CAN mark their own read", r.statusCode, 200);
    check("  ...and it is read", row("n-for-other").read, true);
  }
  {
    const r = await call(controller.markRead, reqFor("mallory", { id: "n-for-marc" }));
    check("non-owner is refused (403, unchanged behaviour)", r.statusCode, 403);
    check("  ...and the target is still unread", row("n-for-marc").read, false);
  }

  console.log("--- markAllRead: scoped to the caller ---");
  {
    // Snapshot first: an earlier case already marked n-for-other read as its owner,
    // so asserting its value afterwards proves nothing about markAllRead.
    const otherBefore = row("n-for-other").read;
    const ownBefore = row("n-for-marc").read;
    await call(controller.markAllRead, reqFor("marc"));
    check("caller's own unread notification is marked", row("n-for-marc").read, true);
    check(
      "  ...and another user's read flag is left exactly as it was",
      [row("n-for-other").read, ownBefore],
      [otherBefore, false]
    );
  }

  console.log("--- getAll returns only the caller's ---");
  {
    // Reset first: the cases above deliberately marked both rows read, and getAll
    // filters out read notifications (notificationsController.js:23), so without an
    // unread pair this section would assert nothing.
    TABLE.notifications = [
      { id: "n-for-marc", target_user_id: "marc", read: false, dismissed_by: [], title: "Borrow approved" },
      { id: "n-for-other", target_user_id: "someone-else", read: false, dismissed_by: [], title: "Borrow approved" },
    ];
    // getAll returns transformKeys() output, which spreads both snake and camel
    // spellings per row, so the payload shape is an array of objects whose keys are
    // doubled. Asserting on identity rather than shape avoids coupling this test to
    // that serialisation.
    const mine = await call(controller.getAll, reqFor("marc"));
    const mineText = JSON.stringify(mine.payload);
    check("the caller's own notification IS returned", mineText.includes("n-for-marc"), true);
    check("  ...and no other user's is", mineText.includes("n-for-other"), false);
  }
  {
    const none = await call(controller.getAll, reqFor("nobody"));
    const noneText = JSON.stringify(none.payload);
    check("a caller with none gets nothing", noneText.includes("n-for-marc") || noneText.includes("n-for-other"), false);
  }

  console.log("");
  if (failures) { console.log(`${failures} FAILED, ${passes} passed`); process.exit(1); }
  console.log(`notifications: all ${passes} checks passed`);
  process.exit(0);
})().catch((err) => {
  console.error(`notifications suite crashed: ${err.stack || err.message}`);
  process.exit(1);
});