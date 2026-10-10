-- Course ownership for the two tables that lack a course column.
--
-- Everything else already carries one:
--   catalog.course, transactions.course, transactions.equipment_course,
--   incidents.reporter_course, lab_attendance.course, Firestore users.course.
--
-- maintenance has no course column at all today, and lab_rooms gets one because
-- a room is the SHARED facility several courses use through the day: `course`
-- is the room's OWNING course, which decides who administers the room and who
-- sees its logbook. It is deliberately NOT a rule about who may scan there --
-- attendance is room-based and any student may log any room.

-- Ownership column. NULL until assigned through RoomManagementTab. A NULL is
-- visible to the Super Admin only (fail closed, never fail open).
ALTER TABLE maintenance ADD COLUMN IF NOT EXISTS course TEXT;
ALTER TABLE lab_rooms   ADD COLUMN IF NOT EXISTS course TEXT;

CREATE INDEX IF NOT EXISTS idx_maintenance_course ON maintenance(course);
CREATE INDEX IF NOT EXISTS idx_lab_rooms_course   ON lab_rooms(course);

-- lab_attendance needs NO new index. Its scope key is room OWNERSHIP, which
-- resolves to `.in("room_code", [...])` -- and idx_lab_attendance_room already
-- exists (see 13-lab-attendance.sql:33) on exactly that column.