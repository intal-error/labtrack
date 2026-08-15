import { useState, useEffect, useCallback } from "react";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { numOr, getAvailableQuantity } from "../utils/helpers";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Modal from "../components/ui/Modal";
import toast from "react-hot-toast";
import "../styles/pages/catalog.css";

export default function CatalogPage() {
  const [items, setItems] = useState([]);
  const [allItems, setAllItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [filterCourse, setFilterCourse] = useState("All");
  const [sort, setSort] = useState("name");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const [showUpdate, setShowUpdate] = useState(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [form, setForm] = useState({ itemName: "", category: "", course: "", quantity: "", condition: "", status: "Available", imageUrl: "", barcode: "" });
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.getCatalog();
      setAllItems(data);
      let filtered = data;
      if (filter !== "All") filtered = filtered.filter((i) => i.status === filter);
      if (filterCourse !== "All") filtered = filtered.filter((i) => i.course === filterCourse);
      if (sort === "name") filtered.sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""));
      else if (sort === "number") filtered.sort((a, b) => (parseFloat(a.itemName) || 0) - (parseFloat(b.itemName) || 0));
      else if (sort === "date") filtered.sort((a, b) => new Date(b.createdAt?.seconds * 1000 || 0) - new Date(a.createdAt?.seconds * 1000 || 0));
      setItems(filtered);
    } catch (err) { toast.error(err.message || "Failed to load catalog"); }
    finally { setLoading(false); }
  }, [filter, filterCourse, sort]);

  useEffect(() => { load(); }, [load]);

  const stats = {
    total: allItems.length,
    available: allItems.filter((i) => i.status === "Available").length,
    borrowed: allItems.filter((i) => i.status === "Borrowed").length,
    categories: new Set(allItems.map((i) => i.category).filter(Boolean)).size,
  };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await api.uploadImage(file);
      setForm((f) => ({ ...f, imageUrl: url }));
      toast.success("Image uploaded!");
    } catch { toast.error("Upload failed"); }
    finally { setUploading(false); }
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.itemName || !form.imageUrl) { toast.error("Item name and image required"); return; }
    try {
      await api.createCatalogItem({ ...form, quantity: Number(form.quantity) || 0 });
      toast.success("Item created!");
      setShowCreate(false);
      setForm({ itemName: "", category: "", course: "", quantity: "", condition: "", status: "Available", imageUrl: "", barcode: "" });
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    try {
      await api.updateCatalogItem(showUpdate.id, { ...showUpdate, quantity: Number(showUpdate.quantity) || 0 });
      toast.success("Item updated!");
      setShowUpdate(null);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    try { await api.deleteCatalogItem(id); toast.success("Deleted!"); load(); }
    catch (err) { toast.error(err.message); }
  };

  const showQrModal = async (id, name) => {
    try {
      const { dataUrl } = await api.generateQR(`SLSU-TOOL:${id}`);
      setShowQr({ name, value: `SLSU-TOOL:${id}`, dataUrl });
    } catch { toast.error("Failed to generate QR"); }
  };

  function conditionClass(c) {
    const v = (c || "").toLowerCase();
    if (v === "excellent") return "cond-excellent";
    if (v === "good") return "cond-good";
    if (v === "fair") return "cond-fair";
    if (v === "damaged") return "cond-damaged";
    if (v === "for repair") return "cond-repair";
    if (v === "missing") return "cond-missing";
    return "";
  }

  if (loading) return <LoadingSpinner />;

  return (
    <section className="catalog-page">
      <div className="catalog-header">
        <div className="catalog-header-left">
          <h1>Catalog</h1>
          <p className="catalog-subtitle">Manage laboratory tools and equipment inventory</p>
        </div>
        <div className="catalog-header-actions">
          <button className="btn btn-green" onClick={() => setShowCreate(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Create Item
          </button>
          <button className="btn btn-red" onClick={async () => { try { await api.downloadReport("catalog"); toast.success("Downloaded!"); } catch { toast.error("Failed"); } }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7,10 12,15 17,10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Download Report
          </button>
        </div>
      </div>

      <div className="catalog-stats">
        <div className="stat-card stat-total">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.total}</span>
            <span className="stat-label">Total Items</span>
          </div>
        </div>
        <div className="stat-card stat-available">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.available}</span>
            <span className="stat-label">Available</span>
          </div>
        </div>
        <div className="stat-card stat-borrowed">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.borrowed}</span>
            <span className="stat-label">Borrowed</span>
          </div>
        </div>
        <div className="stat-card stat-categories">
          <div className="stat-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          </div>
          <div className="stat-info">
            <span className="stat-number">{stats.categories}</span>
            <span className="stat-label">Categories</span>
          </div>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="catalog-filter-pills">
          {["All", "Available", "Borrowed"].map((f) => (
            <button key={f} className={`filter-pill ${filter === f ? "active" : ""}`} onClick={() => setFilter(f)}>
              {f === "Available" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>}
              {f === "Borrowed" && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>}
              {f}
            </button>
          ))}
          <select className="catalog-course-filter" value={filterCourse} onChange={(e) => setFilterCourse(e.target.value)}>
            <option value="All">All Courses</option>
            {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="catalog-sort">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="16" y2="6"/><line x1="4" y1="12" x2="12" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="name">Name (A-Z)</option>
            <option value="date">Date Created (Newest)</option>
            <option value="number">1-200 (Numeric)</option>
          </select>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="catalog-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <h3>No items found</h3>
          <p>Try adjusting your filter or create a new item</p>
          <button className="btn btn-green" onClick={() => setShowCreate(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            Create Item
          </button>
        </div>
      ) : (
        <div className="catalog-grid">
          {items.map((item) => {
            const avail = getAvailableQuantity(item);
            const total = Math.max(0, numOr(item.quantity));
            return (
              <div className="catalog-card" key={item.id}>
                <div className="catalog-card-image">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.itemName} onClick={() => setImageOverlay(item.imageUrl)} />
                  ) : (
                    <div className="item-placeholder">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                      <span>No image</span>
                    </div>
                  )}
                  <span className={`card-status-badge ${item.status === "Available" ? "status-available" : "status-borrowed"}`}>{item.status || "Available"}</span>
                </div>
                <div className="catalog-card-body">
                  <h3 className="catalog-card-title">{item.itemName || "-"}</h3>
                  <div className="catalog-card-meta">
                    {item.category && <span className="category-pill">{item.category}</span>}
                    {item.condition && <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span>}
                  </div>
                  <div className="catalog-card-quantity">
                    <div className="qty-info">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                      <span>{Number.isFinite(Number(item.availableQuantity)) ? `${avail} / ${total}` : total}</span>
                    </div>
                    {Number.isFinite(Number(item.availableQuantity)) && (
                      <div className="qty-bar">
                        <div className="qty-bar-fill" style={{ width: `${total > 0 ? (avail / total) * 100 : 0}%` }} />
                      </div>
                    )}
                  </div>
                  <div className="catalog-card-actions">
                    <button className="card-btn card-btn-qr" onClick={() => showQrModal(item.id, item.itemName)} title="QR Code">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                    </button>
                    <button className="card-btn card-btn-edit" onClick={() => setShowUpdate({ ...item })} title="Update">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button className="card-btn card-btn-delete" onClick={() => handleDelete(item.id)} title="Delete">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3,6 5,6 21,6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <Modal title="Create Item" onClose={() => setShowCreate(false)}>
          <form onSubmit={handleCreate}>
            <input type="text" placeholder="Item Name" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} required />
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
              <option value="" disabled>Select Category</option>
              <option value="Tools">Tools</option>
              <option value="Equipment">Equipment</option>
            </select>
            <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} required>
              <option value="" disabled>Select Course</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="Quantity" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required />
            <input type="text" placeholder="Barcode (optional)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} required>
              <option value="" disabled>Select Condition</option>
              {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="Available">Available</option>
              <option value="Borrowed">Borrowed</option>
            </select>
            <div className="image-upload-row">
              <input type="url" placeholder="Image URL" value={form.imageUrl} readOnly required />
              <label className="text-btn">
                {uploading ? "Uploading..." : "Upload"}
                <input type="file" accept="image/*" onChange={handleUpload} hidden />
              </label>
            </div>
            <div className="catalog-actions">
              <button type="submit" className="btn btn-green">Create</button>
              <button type="button" className="btn btn-orange" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {showQr && (
        <Modal title={showQr.name || "Item QR Code"} onClose={() => setShowQr(null)} wide>
          <p>Print this code and attach it to the item.</p>
          <div className="qr-canvas"><img src={showQr.dataUrl} alt="QR Code" /></div>
          <p className="qr-value">{showQr.value}</p>
          <div className="catalog-actions">
            <button className="btn btn-green" onClick={() => window.print()}>Print</button>
            <button className="btn btn-orange" onClick={() => setShowQr(null)}>Close</button>
          </div>
        </Modal>
      )}

      {showUpdate && (
        <Modal title="Update Item" onClose={() => setShowUpdate(null)}>
          <form onSubmit={handleUpdate}>
            <input type="text" placeholder="Item Name" value={showUpdate.itemName || ""} onChange={(e) => setShowUpdate({ ...showUpdate, itemName: e.target.value })} required />
            <select value={showUpdate.category || ""} onChange={(e) => setShowUpdate({ ...showUpdate, category: e.target.value })} required>
              <option value="" disabled>Select Category</option>
              <option value="Tools">Tools</option>
              <option value="Equipment">Equipment</option>
            </select>
            <select value={showUpdate.course || ""} onChange={(e) => setShowUpdate({ ...showUpdate, course: e.target.value })} required>
              <option value="" disabled>Select Course</option>
              {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input type="number" placeholder="Quantity" value={showUpdate.quantity || ""} onChange={(e) => setShowUpdate({ ...showUpdate, quantity: e.target.value })} required />
            <select value={showUpdate.condition || ""} onChange={(e) => setShowUpdate({ ...showUpdate, condition: e.target.value })} required>
              <option value="" disabled>Select Condition</option>
              {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={showUpdate.status || "Available"} onChange={(e) => setShowUpdate({ ...showUpdate, status: e.target.value })}>
              <option value="Available">Available</option>
              <option value="Borrowed">Borrowed</option>
            </select>
            <input type="url" placeholder="Image URL" value={showUpdate.imageUrl || ""} readOnly required />
            <div className="catalog-actions">
              <button type="submit" className="btn btn-green">Update</button>
              <button type="button" className="btn btn-orange" onClick={() => setShowUpdate(null)}>Cancel</button>
            </div>
          </form>
        </Modal>
      )}

      {imageOverlay && (
        <div className="image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="image-overlay-content">
            <img src={imageOverlay} alt="Large View" />
            <button className="btn-close" onClick={() => setImageOverlay(null)}>&times;</button>
          </div>
        </div>
      )}
    </section>
  );
}
