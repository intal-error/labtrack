#!/usr/bin/env node
/**
 * Audit Script: lab_rooms identifier integrity. READ-ONLY — makes no writes.
 *
 * Why this exists: `room_code` is the join key between lab_rooms and
 * lab_attendance, and `normRoom("") === ""`. A room whose name slugifies to an
 * empty string ("!!!", "###") therefore matched EVERY attendance row in the
 * building that has no room_code, silently merging unrelated rooms into one
 * history. createRoom now refuses such names, and getRoomAttendanceHistory
 * returns a 400 rather than serving merged data — but both only prevent NEW
 * problems. Rooms created before those guards may still hold an empty code.
 *
 * This script finds them, plus two related integrity problems, and reports how
 * many attendance rows each one affects:
 *
 *   1. empty room_code   — the cross-room bleed described above
 *   2. duplicate room_code — two rooms sharing a join key, so their history is
 *                            permanently interleaved
 *   3. room_code that does not match the slug of its own room_name — almost
 *      always a room renamed before room_code was frozen, meaning its history
 *                            is orphaned under the old code
 *
 * It also reports attendance rows with NO room_code at all, which are the rows
 * that would leak into any broken room's view.
 *
 * Usage:
 *   cd backend
 *   node scripts/check-room-codes.js
 *
 * Exit code is 0 when clean and 1 when problems were found, so it can gate a
 * deploy. Requires backend/.env with SUPABASE_URL and SUPABASE_SERVICE_KEY.
 */

require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Kept identical to the controller's slug (attendanceController.js createRoom)
// and the kiosk's (AttendanceKioskPage.jsx:144). A mismatch here would report
// false positives, so it is duplicated deliberately and asserted in the tests.
const slug = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const rowsFor = async (roomCode) => {
  const { data, error } = await supabase.from("lab_attendance").select("id").eq("room_code", roomCode || "");
  if (error) throw error;
  return (data || []).length;
};

(async () => {
  const [{ data: rooms, error: roomsErr }, { data: attendance, error: attErr }] = await Promise.all([
    supabase.from("lab_rooms").select("id, room_name, room_code, qr_data"),
    supabase.from("lab_attendance").select("id, room_code"),
  ]);

  if (roomsErr) {
    console.error("Failed to read lab_rooms:", roomsErr.message);
    process.exit(2);
  }
  if (attErr) {
    console.error("Failed to read lab_attendance:", attErr.message);
    process.exit(2);
  }

  const roomRows = rooms || [];
  const attRows = attendance || [];

  console.log(`Checked ${roomRows.length} room(s) and ${attRows.length} attendance row(s).\n`);

  const problems = [];

  const empty = roomRows.filter((r) => !r.room_code);
  for (const room of empty) {
    // Every room-less row would match this room, since normRoom("") === "".
    const affected = await rowsFor("");
    problems.push({
      kind: "EMPTY room_code",
      room: room.room_name || "(unnamed)",
      detail: `matches ALL ${affected} attendance row(s) that have no room_code — cross-room data bleed`,
    });
  }

  const byCode = new Map();
  for (const room of roomRows) {
    if (!room.room_code) continue;
    const list = byCode.get(room.room_code) || [];
    list.push(room);
    byCode.set(room.room_code, list);
  }
  for (const [code, list] of byCode) {
    if (list.length > 1) {
      problems.push({
        kind: "DUPLICATE room_code",
        room: list.map((r) => r.room_name).join(" / "),
        detail: `"${code}" is shared by ${list.length} rooms — their attendance is interleaved permanently`,
      });
    }
  }

  for (const room of roomRows) {
    if (!room.room_code) continue;
    const expected = slug(room.room_name);
    if (expected && expected !== room.room_code) {
      const affected = await rowsFor(room.room_code);
      problems.push({
        kind: "STALE room_code",
        room: room.room_name,
        detail: `room_code "${room.room_code}" no longer matches its name (would be "${expected}"). Likely renamed before room_code was frozen — its ${affected} row(s) are only reachable under the old code.`,
      });
    }
  }

  const orphans = attRows.filter((r) => !r.room_code).length;
  if (orphans > 0) {
    console.log(`NOTE  ${orphans} attendance row(s) have no room_code at all. These are the rows that leak into`);
    console.log("      any broken room's history, so the empty-code problem above is the one to fix first.\n");
  }

  if (problems.length === 0) {
    console.log("OK  No room identifier problems found.");
    process.exit(0);
  }

  console.log(`${problems.length} problem(s) found:\n`);
  for (const p of problems) {
    console.log(`  [${p.kind}] ${p.room}`);
    console.log(`      ${p.detail}\n`);
  }
  console.log("Fixing an empty code: rename the room to one containing a letter or digit");
  console.log("(the Room QR Codes tab refuses the edit until the name is unique).");
  process.exit(1);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(2);
});
