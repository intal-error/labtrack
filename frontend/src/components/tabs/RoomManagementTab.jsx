import { useState, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { useCourseOptions } from "../../hooks/useQueries";
import toast from "react-hot-toast";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdRefresh,
  MdQrCodeScanner,
  MdLocationOn,
  MdDownload,
  MdOutlineQrCode,
  MdOutlineBusiness,
  MdWarningAmber,
  MdSchool,
} from "react-icons/md";

// This component renders .room-card, .room-add-card, .rooms-empty,
// .qr-placeholder and .attendance-modal-overlay — every one of which is
// defined only in attendance.css. It used to pick them up transitively because
// AttendanceLogsPage happened to import that file; now that the page is built on
// attendance-logs.css, the dependency has to be declared here or the whole tab
// renders unstyled.
import "../../styles/pages/attendance.css";

export default function RoomManagementTab() {
  const queryClient = useQueryClient();
  const { isSuperAdmin, courseId: myCourseId } = useAuth();
  const { options: courseOptions } = useCourseOptions();
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [location, setLocation] = useState("");
  const [course, setCourse] = useState("");
  const [qrModal, setQrModal] = useState(null);
  const [qrImage, setQrImage] = useState("");

  useEffect(() => { loadRooms(); }, []);

  async function loadRooms() {
    setLoading(true);
    try {
      const data = await api.getRooms();
      setRooms(data);
    } catch (err) {
      toast.error(err.message || "Failed to load rooms");
    } finally {
      setLoading(false);
    }
  }

  // This tab keeps its own local copy of the room list, but two other surfaces
  // read the cached one: the Room Logs grid and the room history hero chips,
  // both via useAttendanceRooms (a 5 minute staleTime). Editing a room here left
  // those stale for minutes -- including the grid still listing a room that had
  // just been deleted. Refreshing the shared cache keeps all three in step.
  function syncRoomCache() {
    queryClient.invalidateQueries({ queryKey: ["attendance", "rooms"] });
  }

  // Both halves are needed. This tab renders from its own local copy, so
  // loadRooms() alone is what updates the grid below; syncRoomCache() is what
  // keeps the Room Logs tab and the room history hero chips in step.
  function refreshRooms() {
    loadRooms();
    syncRoomCache();
  }

  function openAddModal() {
    setEditRoom(null);
    setRoomName("");
    setLocation("");
    // Default a new room to the caller's OWN course, taken from their profile
    // rather than from the first entry in the list. A Course Admin is the only
    // value the backend will accept for them anyway, and defaulting to
    // options[0] would hand a CT admin whichever course sorts first (Automotive,
    // alphabetically) and fail the save with a 400.
    setCourse(isSuperAdmin ? "" : myCourseId || "");
    setShowModal(true);
  }

  function openEditModal(room) {
    setEditRoom(room);
    setRoomName(room.roomName || "");
    setLocation(room.location || "");
    setCourse(room.course || "");
    setShowModal(true);
  }

  // True when saving would move this room to a different owning course.
function courseLabel(id) {
  if (!id) return "Unassigned";
  const match = courseOptions.find((c) => c.value === id);
  return match ? match.label : id;
}

function isReassigning() {
  return Boolean(editRoom) && course !== (editRoom.course || "");
}

async function handleSave() {
    if (!roomName.trim()) return toast.error("Room name is required");
    if (!course) return toast.error("Select the course that owns this room");

    /*
     * Confirm a reassignment BEFORE the request, not after.
     *
     * Moving a room between courses does not rewrite lab_attendance.room_code, so its
     * entire historical logbook transfers to the new owner the instant this saves.
     * That is silent, instant and has no inverse in this UI. The backend returns the
     * number of affected rows (historyTransferred) precisely so it could be confirmed
     * with a real figure rather than a vague warning -- but a confirm() dialog has to
     * be raised before the call, since the count only exists afterwards.
     */
    if (isReassigning()) {
      const from = courseLabel(editRoom.course) || "Unassigned";
      const to = courseLabel(course);
      const ok = window.confirm(
        `Move "${roomName.trim()}" from ${from} to ${to}?\n\n` +
          `Every past logbook entry for this room will belong to ${to} from now on. ` +
          `Entries are not copied or removed, and this cannot be undone from here.`
      );
      if (!ok) return;
    }

    try {
      let transferred = null;
      if (editRoom) {
        const updated = await api.updateRoom(editRoom.id, {
          roomName: roomName.trim(),
          location: location.trim(),
          course,
        });
        transferred = updated?.historyTransferred;
      } else {
        await api.createRoom({ roomName: roomName.trim(), location: location.trim(), course });
      }
      setShowModal(false);
      loadRooms();
      syncRoomCache();

      if (transferred > 0) {
        toast.success(
          `Room moved. ${transferred} logbook ${transferred === 1 ? "entry" : "entries"} now belong to ${courseLabel(course)}.`
        );
      } else if (transferred === 0) {
        toast.success("Room updated");
      } else {
        toast.success(isReassigning() ? "Room updated" : "Room created");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save room");
    }
  }

  async function handleDelete(room) {
    if (!window.confirm(`Delete "${room.roomName}"? This cannot be undone.`)) return;
    try {
      await api.deleteRoom(room.id);
      toast.success("Room deleted");
      loadRooms();
      syncRoomCache();
    } catch (err) {
      toast.error(err.message || "Failed to delete room");
    }
  }

  async function showRoomQR(room) {
    setQrModal(room);
    setQrImage("");
    try {
      const data = await api.getRoomQR(room.id);
      setQrImage(data.dataUrl);
    } catch {
      toast.error("Failed to generate QR code");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="rooms-header">
        <h3>Lab Rooms</h3>
        <div className="rooms-header-actions">
          <button className="btn btn-outline" onClick={refreshRooms} aria-label="Refresh">
            <MdRefresh size={14} /> Refresh
          </button>
          <button className="btn btn-primary" onClick={openAddModal}>
            <MdAdd size={14} /> Add Room
          </button>
        </div>
      </div>

      {/* The spinner is reserved for the first load. Gating it on an empty list
          keeps the QR grid on screen while a Refresh is in flight, instead of
          swapping the whole panel for a full-height loader on every press. */}
      {loading && rooms.length === 0 ? (
        <div className="rooms-empty">
          <div className="spinner-lg" />
          <h3>Loading rooms...</h3>
        </div>
      ) : rooms.length === 0 ? (
        <div className="rooms-empty">
          <div className="rooms-empty-icon">
            <MdOutlineBusiness size={28} />
          </div>
          <h3>No Lab Rooms Yet</h3>
          <p>Add your first lab room to start generating QR codes for attendance</p>
        </div>
      ) : (
        <div className="rooms-grid">
          {rooms.map((room) => (
            <div key={room.id} className="room-card">
              <div className="room-card-header">
                <div>
                  <p className="room-card-name">{room.roomName}</p>
                  {room.location && (
                    <p className="room-card-location">
                      <MdLocationOn size={12} /> {room.location}
                    </p>
                  )}
                  {/*
                    The owning course is shown on the card, not only in the edit form,
                    because an unassigned room is invisible to every Course Admin -- so
                    from their side of the system the room simply does not exist. Seeing
                    it here labelled "Unassigned" is what explains that.
                  */}
                  <p className="room-card-course">
                    <MdSchool size={12} />
                    {courseLabel(room.course)}
                  </p>
                </div>
                <span className={`status-badge ${room.status === "active" ? "active" : "inactive"}`}>
                  {room.status}
                </span>
              </div>

              <div className="room-card-qr">
                {qrModal?.id === room.id && qrImage ? (
                  <img src={qrImage} alt={`QR - ${room.roomName}`} />
                ) : (
                  <div className="qr-placeholder" onClick={() => showRoomQR(room)}>
                    <MdOutlineQrCode size={28} />
                    Show QR Code
                  </div>
                )}
              </div>

              <div className="room-card-actions">
                <button onClick={() => openEditModal(room)}>
                  <MdEdit size={13} /> Edit
                </button>
                <button onClick={() => showRoomQR(room)}>
                  <MdQrCodeScanner size={13} /> QR
                </button>
                <button className="danger" onClick={() => handleDelete(room)}>
                  <MdDelete size={13} /> Delete
                </button>
              </div>
            </div>
          ))}

          <div className="room-add-card" onClick={openAddModal}>
            <span className="add-icon">+</span>
            <span>Add Lab Room</span>
          </div>
        </div>
      )}

      {/* Add/Edit Room Modal */}
      {showModal && (
        <div className="attendance-modal-overlay" onClick={() => setShowModal(false)}>
          <div className="attendance-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editRoom ? "Edit Room" : "Add Lab Room"}</h2>
            <div className="form-group">
              <label>Room Name *</label>
              <input
                type="text"
                placeholder="e.g. Computer Laboratory 1"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Location (optional)</label>
              <input
                type="text"
                placeholder="e.g. Building A, 2nd Floor"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label>Owning Course *</label>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                /*
                 * Locked for a Course Admin. The API refuses to move a room to
                 * another course (updateRoom returns 403 unless the caller is an
                 * explicit Super Admin), so an enabled select here would let them
                 * pick a value and then eat an error toast -- offering an action
                 * and refusing it is worse than showing it is not available.
                 *
                 * Their own course is still the only valid value, and it is still
                 * editable for a Super Admin, so nothing is lost.
                 */
                disabled={!isSuperAdmin}
              >
                <option value="">Select a course...</option>
                {courseOptions.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <p className="room-course-hint">
                {isSuperAdmin ? (
                  <>
                    The course that administers this room and sees its laboratory
                    logbook. Any student may still scan this room&apos;s QR code and
                    record an entry, whichever course they belong to.
                  </>
                ) : (
                  <>
                    This room belongs to your course. Only the Super Admin can move a
                    room to a different course, because that also transfers its
                    logbook.
                  </>
                )}
              </p>
            </div>
            {isReassigning() && (
              <div className="room-reassign-warning" role="alert">
                <MdWarningAmber size={18} />
                <div>
                  <strong>This will move the room&apos;s logbook</strong>
                  <p>
                    Changing the owning course transfers every past logbook entry to the
                    new course. Entries are not copied or deleted, and this cannot be
                    undone from here.
                  </p>
                </div>
              </div>
            )}
            <div className="attendance-modal-actions">
              <button className="btn-cancel" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn-save" onClick={handleSave}>
                {editRoom ? "Save Changes" : "Create Room"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Room QR Display Modal */}
      {qrModal && qrImage && (
        <div className="attendance-modal-overlay" onClick={() => { setQrModal(null); setQrImage(""); }}>
          <div className="attendance-modal student-qr-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{qrModal.roomName}</h2>
            <img src={qrImage} alt={`QR - ${qrModal.roomName}`} />
            <p className="qr-label">Scan this QR code to access the attendance kiosk for this room</p>
            <div className="qr-data-box">
              {qrModal.qrData}
            </div>
            <div className="attendance-modal-actions">
              <button className="btn-cancel" onClick={() => { setQrModal(null); setQrImage(""); }}>Close</button>
              <button className="btn-save" onClick={() => {
                const a = document.createElement("a");
                a.href = qrImage;
                a.download = `qr_${qrModal.roomName.replace(/\s+/g, "_")}.png`;
                a.click();
              }}>
                <MdDownload size={14} /> Download QR
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
