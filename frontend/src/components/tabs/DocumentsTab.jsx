import { useState, useEffect, useRef } from "react";
import { api } from "../../services/api";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdDescription, MdPictureAsPdf, MdTableChart, MdFolder } from "react-icons/md";

export default function DocumentsTab() {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const fileInputRef = useRef(null);

  useEffect(() => { loadDocuments(); }, []);

  async function loadDocuments() {
    try {
      const data = await api.getDocuments();
      setDocuments(data);
    } catch {
      setDocuments([
        { id: "1", name: "Laboratory Manual 2026", category: "Manuals", type: "pdf", size: "2.4 MB", date: "Jan 15, 2026" },
        { id: "2", name: "Student Grade Sheet Template", category: "Templates", type: "xlsx", size: "156 KB", date: "Feb 3, 2026" },
        { id: "3", name: "Equipment Borrowing Policy", category: "Guidelines", type: "pdf", size: "890 KB", date: "Mar 10, 2026" },
        { id: "4", name: "Faculty Evaluation Form", category: "Forms", type: "pdf", size: "320 KB", date: "Apr 5, 2026" },
        { id: "5", name: "Semester Performance Report", category: "Reports", type: "xlsx", size: "1.1 MB", date: "May 20, 2026" },
        { id: "6", name: "Lab Safety Guidelines", category: "Guidelines", type: "pdf", size: "560 KB", date: "Jun 1, 2026" },
        { id: "7", name: "Inventory Checklist", category: "Templates", type: "xlsx", size: "210 KB", date: "Jul 12, 2026" },
        { id: "8", name: "Student Registration Form", category: "Forms", type: "pdf", size: "180 KB", date: "Aug 1, 2026" },
      ]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = documents.filter((d) => {
    const matchSearch = !search || d.name.toLowerCase().includes(search.toLowerCase());
    const matchCategory = filterCategory === "All" || d.category === filterCategory;
    return matchSearch && matchCategory;
  });

  const categories = [...new Set(documents.map((d) => d.category))];

  function fileIcon(type) {
    switch (type) {
      case "pdf": return <MdPictureAsPdf size={36} color="#d32f2f" />;
      case "xlsx": return <MdTableChart size={36} color="#2e7d32" />;
      default: return <MdDescription size={36} color="#1976d2" />;
    }
  }

  function handleUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const newDoc = {
      id: String(documents.length + 1),
      name: file.name,
      category: "Uploads",
      type: file.name.split(".").pop(),
      size: `${(file.size / 1024).toFixed(0)} KB`,
      date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    };
    setDocuments((prev) => [newDoc, ...prev]);
    toast.success("Document uploaded");
    e.target.value = "";
  }

  function handleDownload(doc) {
    toast.success(`Downloading ${doc.name}`);
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <div className="docs-header">
        <h2>Documents</h2>
        <div className="records-filters">
          <input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option>All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
          <button className="btn btn-green" onClick={() => fileInputRef.current?.click()}>+ Upload</button>
          <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleUpload} accept=".pdf,.xlsx,.xls,.doc,.docx" />
        </div>
      </div>

      <div className="docs-grid">
        {filtered.length === 0 ? (
          <p className="empty-state" style={{ gridColumn: "1/-1" }}>No documents found</p>
        ) : filtered.map((d) => (
          <div className="doc-card" key={d.id} onClick={() => handleDownload(d)}>
            <div className="doc-icon">{fileIcon(d.type)}</div>
            <h4>{d.name}</h4>
            <p>{d.category} &middot; {d.size}</p>
            <p style={{ marginTop: 4 }}><small>{d.date}</small></p>
          </div>
        ))}
      </div>
    </div>
  );
}
