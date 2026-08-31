import { useState, useEffect, useRef, useMemo } from "react";
import { api } from "../../services/api";
import { useAuth } from "../../context/AuthContext";
import { filterBySearch } from "../../utils/search";
import toast from "react-hot-toast";
import "../../styles/pages/tabs.css";
import { MdDescription, MdPictureAsPdf, MdTableChart, MdSearch, MdDownload, MdDelete, MdCloudUpload, MdFolderOpen } from "react-icons/md";
import PageHero from "../ui/PageHero";

export default function DocumentsTab() {
  const { role } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("All");
  const [activeType, setActiveType] = useState("total");
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

  const stats = useMemo(() => ({
    total: documents.length,
    pdf: documents.filter((d) => d.type === "pdf").length,
    spreadsheet: documents.filter((d) => d.type === "xlsx" || d.type === "xls").length,
    other: documents.filter((d) => d.type !== "pdf" && d.type !== "xlsx" && d.type !== "xls").length,
  }), [documents]);

  const filtered = documents.filter((d) => {
    const matchSearch = !search || filterBySearch([d], search, ["name"]).length > 0;
    const matchCategory = filterCategory === "All" || d.category === filterCategory;
    const matchType =
      activeType === "total" ||
      (activeType === "pdf" && d.type === "pdf") ||
      (activeType === "spreadsheet" && (d.type === "xlsx" || d.type === "xls")) ||
      (activeType === "other" && d.type !== "pdf" && d.type !== "xlsx" && d.type !== "xls");
    return matchSearch && matchCategory && matchType;
  });

  const categories = [...new Set(documents.map((d) => d.category))];

  function fileIcon(type) {
    switch (type) {
      case "pdf": return <MdPictureAsPdf size={36} color="#d32f2f" />;
      case "xlsx": case "xls": return <MdTableChart size={36} color="#2E7D32" />;
      default: return <MdDescription size={36} color="#1976d2" />;
    }
  }

  function typeAccent(type) {
    switch (type) {
      case "pdf": return "doc-type-pdf";
      case "xlsx": case "xls": return "doc-type-excel";
      default: return "doc-type-other";
    }
  }

  function categoryBadgeColor(category) {
    switch (category) {
      case "Manuals": return { background: "rgba(25,118,210,.08)", color: "#1976d2" };
      case "Templates": return { background: "rgba(46,125,50,.08)", color: "#2E7D32" };
      case "Guidelines": return { background: "rgba(245,124,0,.08)", color: "#f57c00" };
      case "Forms": return { background: "rgba(106,27,154,.08)", color: "#6a1b9a" };
      case "Reports": return { background: "rgba(211,47,47,.08)", color: "#d32f2f" };
      default: return { background: "rgba(0,0,0,.04)", color: "var(--text-muted)" };
    }
  }

  async function handleUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await api.uploadDocument(file);
      setDocuments((prev) => [{ ...result, date: new Date(result.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) }, ...prev]);
      toast.success("Document uploaded successfully");
    } catch (err) {
      toast.error(err.message || "Upload failed");
    } finally {
      e.target.value = "";
    }
  }

  function handleDownload(doc) {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, "_blank");
    } else {
      toast.error("No file available for download");
    }
  }

  async function handleDelete(doc) {
    if (!window.confirm(`Delete "${doc.name}"?`)) return;
    try {
      await api.deleteDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
      toast.success("Document deleted");
    } catch {
      toast.error("Failed to delete document");
    }
  }

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  return (
    <div className="tab-content">
      <PageHero icon={MdFolderOpen} title="Documents" subtitle="Manage lab documents and files">
        {role === "admin" && (
          <button className="hero-action-btn ghost" onClick={() => fileInputRef.current?.click()}>
            <MdCloudUpload size={16} /> Upload
          </button>
        )}
      </PageHero>
      <input ref={fileInputRef} type="file" style={{ display: "none" }} onChange={handleUpload} accept=".pdf,.xlsx,.xls,.doc,.docx" />

      <div className="doc-stats">
        <div className={`doc-stat-card ${activeType === "total" ? "active" : ""}`} onClick={() => setActiveType("total")}>
          <div className="doc-stat-icon total"><MdDescription size={20} /></div>
          <div className="doc-stat-info">
            <span className="doc-stat-number">{stats.total}</span>
            <span className="doc-stat-label">Total</span>
          </div>
        </div>
        <div className={`doc-stat-card ${activeType === "pdf" ? "active" : ""}`} onClick={() => setActiveType("pdf")}>
          <div className="doc-stat-icon pdf"><MdPictureAsPdf size={20} /></div>
          <div className="doc-stat-info">
            <span className="doc-stat-number">{stats.pdf}</span>
            <span className="doc-stat-label">PDFs</span>
          </div>
        </div>
        <div className={`doc-stat-card ${activeType === "spreadsheet" ? "active" : ""}`} onClick={() => setActiveType("spreadsheet")}>
          <div className="doc-stat-icon spreadsheet"><MdTableChart size={20} /></div>
          <div className="doc-stat-info">
            <span className="doc-stat-number">{stats.spreadsheet}</span>
            <span className="doc-stat-label">Spreadsheets</span>
          </div>
        </div>
        <div className={`doc-stat-card ${activeType === "other" ? "active" : ""}`} onClick={() => setActiveType("other")}>
          <div className="doc-stat-icon other"><MdDescription size={20} /></div>
          <div className="doc-stat-info">
            <span className="doc-stat-number">{stats.other}</span>
            <span className="doc-stat-label">Others</span>
          </div>
        </div>
      </div>

      <div className="doc-toolbar">
        <div className="doc-search">
          <MdSearch size={16} />
          <input placeholder="Search documents..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="doc-toolbar-right">
          <select className="doc-filter-select" value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option>All</option>
            {categories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="docs-grid">
        {filtered.length === 0 ? (
          <div className="docs-empty">
            <MdDescription size={48} />
            <h3>{search || filterCategory !== "All" || activeType !== "total" ? "No matching documents" : "No documents uploaded yet"}</h3>
            <p>{search || filterCategory !== "All" || activeType !== "total" ? "Try adjusting your search or filter" : "Click 'Upload' to add your first document"}</p>
          </div>
        ) : filtered.map((d) => (
          <div className={`doc-card ${typeAccent(d.type)}`} key={d.id}>
            <div className="doc-icon">{fileIcon(d.type)}</div>
            <h4>{d.name}</h4>
            <span className="doc-category-badge" style={categoryBadgeColor(d.category)}>{d.category}</span>
            <p className="doc-meta">{d.size} &middot; {d.date || (d.createdAt ? new Date(d.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "")}</p>
            <div className="doc-card-actions">
              <button className="btn-doc-download" onClick={() => handleDownload(d)} title="Download">
                <MdDownload size={14} /> Download
              </button>
        {role === "admin" && (
                <button className="btn-doc-delete" onClick={() => handleDelete(d)} title="Delete">
                  <MdDelete size={14} /> Delete
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
