import { useState, useEffect } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import {
  MdAdd,
  MdEdit,
  MdDelete,
  MdQrCodeScanner,
  MdLocationOn,
  MdDownload,
  MdOutlineQrCode,
  MdOutlineBusiness,
} from "react-icons/md";

export default function RoomManagementTab() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editRoom, setEditRoom] = useState(null);
  const [roomName, setRoomName] = useState("");
  const [location, setLocation] = useState("");
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

  function openAddModal() {
    setEditRoom(null);
    setRoomName("");
    setLocation("");
    setShowModal(true);
  }

  function openEditModal(room) {
    setEditRoom(room);
    setRoomName(room.roomName || "");
    setLocation(room.location || "");
    setShowModal(true);
  }

  async function handleSave() {
    if (!roomName.trim()) return toast.error("Room name is required");
    try {
      if (editRoom) {
        await api.updateRoom(editRoom.id, { roomName: roomName.trim(), location: location.trim() });
        toast.success("Room updated");
      } else {
        await api.createRoom({ roomName: roomName.trim(), location: location.trim() });
        toast.success("Room created");
      }
      setShowModal(false);
      loadRooms();
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
    } catch (err) {
      toast.error("Failed to generate QR code");
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="rooms-header">
        <h3>Lab Rooms</h3>
        <div className="rooms-header-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <MdAdd size={14} /> Add Room
          </button>
        </div>
      </div>

      {loading ? (
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
