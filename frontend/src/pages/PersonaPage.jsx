import { useState } from "react";
import { api } from "../services/api";
import { MdSearch, MdPerson, MdSchool, MdEmail, MdPhone, MdBookmark, MdAssignmentReturn, MdInventory } from "react-icons/md";
import "../styles/pages/persona.css";

export default function PersonaPage() {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const data = await api.searchUser(firstName.trim(), lastName.trim());
      setResult(data);
    } catch (err) {
      setError(err.message || "No person found");
    } finally { setLoading(false); }
  };

  const user = result?.user;
  const initials = user ? `${(user.firstName || "")[0] || ""}${(user.lastName || "")[0] || ""}`.toUpperCase() : "?";

  return (
    <section className="persona-page">
      <div className="persona-header">
        <div className="persona-header-icon">
          <MdSearch size={28} />
        </div>
        <div>
          <h1>Persona</h1>
          <p className="persona-subtitle">Look up student or faculty records</p>
        </div>
      </div>

      <div className="persona-search-card">
        <form onSubmit={handleSearch}>
          <div className="persona-row">
            <div className="persona-input-wrap">
              <MdPerson className="persona-input-icon" size={20} />
              <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="persona-input-wrap">
              <MdPerson className="persona-input-icon" size={20} />
              <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <button type="submit" className="persona-search-btn" disabled={loading}>
            <MdSearch size={20} />
            {loading ? "Searching..." : "Find Person"}
          </button>
        </form>
      </div>

      {error && (
        <div className="persona-error-card">
          <MdPerson size={24} />
          <p>{error}</p>
        </div>
      )}

      {result && user && (
        <div className="persona-result fade-in-up">
          <div className="persona-profile-card">
            <div className="persona-avatar" style={user.profileURL ? { background: "transparent" } : {}}>
              {user.profileURL ? (
                <img src={user.profileURL} alt={`${user.firstName} ${user.lastName}`} />
              ) : (
                initials
              )}
            </div>
            <div className="persona-profile-info">
              <h2 className="persona-name">{user.firstName} {user.lastName}</h2>
              <span className="persona-role-badge">{user.role || "Student"}</span>
            </div>
          </div>

          <div className="persona-details-grid">
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdSchool size={18} /></div>
              <div>
                <span className="persona-detail-label">School ID</span>
                <span className="persona-detail-value">{user.schoolID || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdBookmark size={18} /></div>
              <div>
                <span className="persona-detail-label">Course</span>
                <span className="persona-detail-value">{user.course || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdPhone size={18} /></div>
              <div>
                <span className="persona-detail-label">Contact</span>
                <span className="persona-detail-value">{user.contactNumber || user.contact || "-"}</span>
              </div>
            </div>
            <div className="persona-detail-item">
              <div className="persona-detail-icon"><MdEmail size={18} /></div>
              <div>
                <span className="persona-detail-label">Email</span>
                <span className="persona-detail-value">{user.email || "-"}</span>
              </div>
            </div>
          </div>

          <div className="persona-items-section">
            <div className="persona-items-card persona-borrowed-card">
              <div className="persona-items-header">
                <MdInventory size={20} />
                <h3>Borrowed Items</h3>
                <span className="persona-count-badge borrowed">{result.borrowed.length}</span>
              </div>
              <div className="persona-items-list">
                {result.borrowed.length ? result.borrowed.map((i, idx) => (
                  <div className="persona-item-chip borrowed" key={idx}>
                    <span className="persona-item-name">{i.itemName || "Unknown"}</span>
                    <span className="persona-item-qty">x{i.quantity || 1}</span>
                  </div>
                )) : <p className="persona-empty-text">No currently borrowed tools</p>}
              </div>
            </div>

            <div className="persona-items-card persona-returned-card">
              <div className="persona-items-header">
                <MdAssignmentReturn size={20} />
                <h3>Returned Items</h3>
                <span className="persona-count-badge returned">{result.returned.length}</span>
              </div>
              <div className="persona-items-list">
                {result.returned.length ? result.returned.map((i, idx) => (
                  <div className="persona-item-chip returned" key={idx}>
                    <span className="persona-item-name">{i.itemName || "Unknown"}</span>
                    <span className="persona-item-qty">x{i.quantity || 1}</span>
                  </div>
                )) : <p className="persona-empty-text">No returned tools yet</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
