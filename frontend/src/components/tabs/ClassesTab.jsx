import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";

export default function ClassesTab() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => { loadClasses(); }, []);

  async function loadClasses() {
    try {
      const data = await api.getClasses();
      setClasses(data);
    } catch {
      setClasses([
        { id: "1", course: "BSIT", section: "A", subject: "CS101", averageGrade: 87, passed: 28, failed: 4, total: 32, completion: 88 },
        { id: "2", course: "BSIT", section: "B", subject: "CS101", averageGrade: 82, passed: 25, failed: 7, total: 32, completion: 78 },
        { id: "3", course: "BSCS", section: "A", subject: "CS201", averageGrade: 91, passed: 30, failed: 2, total: 32, completion: 94 },
        { id: "4", course: "BSIS", section: "A", subject: "IS101", averageGrade: 79, passed: 22, failed: 10, total: 32, completion: 69 },
        { id: "5", course: "BSIT", section: "C", subject: "CS102", averageGrade: 85, passed: 27, failed: 5, total: 32, completion: 84 },
        { id: "6", course: "BSCS", section: "B", subject: "CS202", averageGrade: 88, passed: 29, failed: 3, total: 32, completion: 91 },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = classes.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.course || "").toLowerCase().includes(s) || (c.section || "").toLowerCase().includes(s) || (c.subject || "").toLowerCase().includes(s);
  });

  const chartData = filtered.map((c) => ({
    name: `${c.course}-${c.section}`,
    passed: c.passed || 0,
    failed: c.failed || 0,
  }));

  function avgGradeColor(avg) {
    if (avg >= 90) return "#2e7d32";
    if (avg >= 80) return "#1976d2";
    if (avg >= 75) return "#ef6c00";
    return "#d32f2f";
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="records-header">
        <h2>Classes</h2>
        <input placeholder="Search course, section, subject..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
      </div>

      <div className="chart-box" style={{ marginBottom: 25 }}>
        <h3>Passed vs Failed by Class</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="passed" fill="#2e7d32" name="Passed" radius={[4, 4, 0, 0]} />
            <Bar dataKey="failed" fill="#d32f2f" name="Failed" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="classes-grid">
        {filtered.map((c) => (
          <div className="class-card" key={c.id}>
            <h3>{c.course} - Section {c.section}</h3>
            <div className="stat-row"><span className="stat-label">Subject</span><span className="stat-value">{c.subject}</span></div>
            <div className="stat-row">
              <span className="stat-label">Average Grade</span>
              <span className="stat-value" style={{ color: avgGradeColor(c.averageGrade) }}>{c.averageGrade}</span>
            </div>
            <div className="stat-row"><span className="stat-label">Total Students</span><span className="stat-value">{c.total}</span></div>
            <div className="stat-row"><span className="stat-label">Passed</span><span className="stat-value" style={{ color: "#2e7d32" }}>{c.passed}</span></div>
            <div className="stat-row"><span className="stat-label">Failed</span><span className="stat-value" style={{ color: "#d32f2f" }}>{c.failed}</span></div>
            <div className="stat-row">
              <span className="stat-label">Completion</span>
              <span className="stat-value"><span className={`status-badge ${c.completion >= 75 ? "passed" : "failed"}`}>{c.completion}%</span></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
