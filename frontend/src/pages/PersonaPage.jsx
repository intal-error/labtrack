import { useState } from "react";
import { api } from "../services/api";
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

  return (
    <section className="persona-page">
      <h1>PERSONA</h1>
      <div className="persona-box">
        <form onSubmit={handleSearch}>
          <div className="persona-row">
            <input type="text" placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            <input type="text" placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-green" disabled={loading}>
            {loading ? "Searching..." : "Find Person"}
          </button>
        </form>

        {error && <div className="persona-result-box"><p>{error}</p></div>}

        {result && (
          <div className="persona-result-box">
            <h3>PERSON FOUND</h3>
            <p><strong>School ID:</strong> {result.user.schoolID || "-"}</p>
            <p><strong>First Name:</strong> {result.user.firstName || "-"}</p>
            <p><strong>Last Name:</strong> {result.user.lastName || "-"}</p>
            <p><strong>Course:</strong> {result.user.course || "-"}</p>
            <p><strong>Contact:</strong> {result.user.contactNumber || "-"}</p>
            <p><strong>Email:</strong> {result.user.email || "-"}</p>
            <hr />
            <p><strong>Borrowed Items:</strong> {result.borrowed.length}</p>
            <ul>
              {result.borrowed.length ? result.borrowed.map((i, idx) => <li key={idx}>{i.itemName || "Unknown"} (x{i.quantity || 1})</li>) : <li>No currently borrowed tools.</li>}
            </ul>
            <p><strong>Returned Items:</strong> {result.returned.length}</p>
            <ul>
              {result.returned.length ? result.returned.map((i, idx) => <li key={idx}>{i.itemName || "Unknown"} (x{i.quantity || 1})</li>) : <li>No returned tools yet.</li>}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}
