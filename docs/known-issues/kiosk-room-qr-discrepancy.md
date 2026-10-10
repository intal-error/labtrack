# Kiosk room-QR discrepancy (documented, not changed)

**Status:** open, documented only. No code change was made. The kiosk workflow is
untouched and behaves exactly as it did before this work.

## Summary

The student scanner follows the printed-QR workflow. The kiosk does not.

| | Student scanner | Kiosk |
|---|---|---|
| Entry | scans the room QR on the door | launched with `?room=` in the URL |
| `room_code` source | parsed from the QR payload | re-derived by slugifying the room **name** |
| room QR scanned at the kiosk | payload **discarded** | — |

## Evidence

`frontend/src/pages/AttendanceKioskPage.jsx`

```
:34    const roomName = searchParams.get("room") || "Laboratory";
:79    if (text.startsWith("LABROOM:")) {          // payload discarded
:197   roomCode: roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-")...
:219   roomCode: roomName.toLowerCase().replace(/[^a-z0-9]+/g, "-")...
```

`frontend/src/pages/components/AttendanceScanner.jsx`

```
:86-98 parseRoomQR()  -> { code, name } taken from the scanned text
:108   setRoomCode(parsed.code)
```

## Root cause

`getRoomQR` (`attendanceController.js:1508`) prints `room.qr_data`, whose format is:

```
LABROOM:<ROOM NAME>
```

The payload carries **no room code** — only a name. So *every* client has to reconstruct
the code by slugifying that name, and that slug is duplicated in three places:

1. `createRoom` (backend, when a room is created)
2. `parseRoomQR` (student scanner)
3. `AttendanceKioskPage` inline (kiosk)

This is rename-safe today only because `room_code` **and** `qr_data` are both frozen at
creation time. The moment those two ever diverge, or a room name contains characters the
three slug implementations treat differently, the kiosk computes a code that resolves to
no room — which is now a hard `404`, because the fail-soft fallback (`resolveLabRoom`) was
removed in favour of `lookupRoom`.

## Why the backend no longer masks it

`resolveLabRoom` used to fall back to the client-supplied room name, which meant a wrong
slug still produced a row. That leniency is what allowed made-up rooms into the logbook,
so it was removed. The consequence is intentional and correct: **an unresolvable room code
is now rejected rather than silently accepted.** The kiosk's re-derived code is simply
another client-supplied code, and is subject to the same rule.

## Options (none applied)

**(a) Kiosk parses the printed room QR**, exactly like the student scanner.
Matches the stated workflow — every room has a printed QR on its door and every entry
scans it. Requires kiosk UX work (scan → confirm room) and kiosk re-testing.

**(b) Give the kiosk the room's frozen `room_code`**, e.g. `?roomCode=net-lab` alongside
the display name, instead of re-slugifying.
Smallest change. Removes the duplicated slug logic from the kiosk entirely and makes the
frozen key explicit. Keeps the kiosk launched per-room via URL rather than QR.

**(c) Leave as-is and accept the divergence.** Lowest effort, but the kiosk then cannot
read a printed room QR, which does not match the documented workflow.

## Recommendation

**(b) now, (a) later.** (b) is a small, low-risk change that closes the duplicate-slug
hazard immediately without altering kiosk behaviour. (a) is the correct end state for
workflow consistency, but it changes how kiosk operators start a session and should be
scheduled deliberately.

Either option should be preceded by moving the slug into a shared helper so the backend
and every client derive `room_code` the same way — ideally by having the server hand the
frozen code to the client rather than each side recomputing it.

## Not affected

- The student scanner is correct and unchanged.
- `timeIn`, `timeOut` and `autoScan` all resolve rooms server-side via `lookupRoom`.
- Same-room sign-out is enforced in `timeOut` and `autoScan`
  (`assertSameRoomForSignOut`).
- Cross-course attendance is unaffected: no handler compares the student's course against
  the room's owning course.