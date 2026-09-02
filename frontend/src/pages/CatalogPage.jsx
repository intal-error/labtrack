import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { numOr, getAvailableQuantity } from "../utils/helpers";
import { filterBySearch } from "../utils/search";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Modal from "../components/ui/Modal";
import Pagination from "../components/ui/Pagination";
import toast from "react-hot-toast";
import "../styles/pages/catalog.css";
import "../styles/pages/scanner.css";
import "../styles/pages/shared-form-panel.css";
import { MdClose, MdEdit, MdInfo, MdImage, MdAssignment, MdTag, MdQrCode, MdInventory, MdDownload, MdMoreVert, MdQrCodeScanner, MdDelete, MdWarning } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import ViewToggle from "../components/ui/ViewToggle";
import { useAuth } from "../context/AuthContext";

export default function CatalogPage() {
  const [allItems, setAllItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [filterCourse, setFilterCourse] = useState("All");
  const [sort, setSort] = useState("name");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const [showUpdate, setShowUpdate] = useState(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [form, setForm] = useState({ itemName: "", category: "", course: "", quantity: "", condition: "", status: "Available", imageUrl: "", barcode: "" });
  const [uploading, setUploading] = useState(false);
  const [viewMode, setViewMode] = useState("list");
  const [openKebab, setOpenKebab] = useState(null);
  const { role, userProfile } = useAuth();
  const [restriction, setRestriction] = useState(null);

  useEffect(() => { setPage(1); }, [search, filter, filterCourse, sort]);

  useEffect(() => {
    const handler = (e) => { if (!e.target.closest(".catalog-kebab-wrap")) setOpenKebab(null); };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, []);

  useEffect(() => {
    if (role === "student" && userProfile?.id) {
      api.checkRestriction(userProfile.id).then((d) => setRestriction(d)).catch(() => {});
    }
  }, [role, userProfile]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = `?page=${page}&limit=25&search=${search}&status=${filter !== "All" ? filter : ""}&course=${filterCourse !== "All" ? filterCourse : ""}&sort=${sort}`;
      const response = await api.getCatalog(params);
      if (Array.isArray(response)) {
        setAllItems(response);
        setPaginationData(null);
      } else {
        setAllItems(response.data);
        setPaginationData(response.pagination);
      }
    } catch (err) { toast.error(err.message || "Failed to load catalog"); }
    finally { setLoading(false); }
  }, [page, search, filter, filterCourse, sort]);

  useEffect(() => { load(); }, [load]);

  const filteredItems = useMemo(() => {
    let result = [...allItems];
    if (filter !== "All") result = result.filter((i) => i.status === filter);
    if (filterCourse !== "All") result = result.filter((i) => i.course === filterCourse);
    if (search) result = filterBySearch(result, search, ["itemName"]);
    if (sort === "name") result.sort((a, b) => (a.itemName || "").localeCompare(b.itemName || ""));
    else if (sort === "number") result.sort((a, b) => (parseFloat(a.itemName) || 0) - (parseFloat(b.itemName) || 0));
    else if (sort === "date") result.sort((a, b) => new Date(b.createdAt?.seconds * 1000 || 0) - new Date(a.createdAt?.seconds * 1000 || 0));
    return result;
  }, [allItems, filter, filterCourse, search, sort]);

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
      <PageHero icon={MdInventory} title="Catalog">
        <button className="hero-action-btn ghost" onClick={() => setShowCreate(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
          Create Item
        </button>
        <button className="hero-action-btn ghost" onClick={async () => { try { await api.downloadReport("catalog"); toast.success("Downloaded!"); } catch { toast.error("Failed"); } }}>
          <MdDownload size={16} /> Download Report
        </button>
      </PageHero>

      {restriction?.restricted && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "14px 18px", background: "linear-gradient(135deg, rgba(211,47,47,.06), rgba(211,47,47,.02))", border: "1.5px solid rgba(211,47,47,.2)", borderRadius: 12, marginBottom: 16 }}>
          <MdWarning size={20} style={{ color: "#d32f2f", flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontWeight: 700, color: "#d32f2f", fontSize: 13, marginBottom: 2 }}>Borrowing Restricted</div>
            <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
              {restriction.message || "You have an unpaid fine. Please settle it before borrowing equipment."}
            </div>
          </div>
        </div>
      )}

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
          <div className="catalog-search-box">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              type="text"
              placeholder="Search items..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
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
        <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-catalog-view" />
      </div>

      {filteredItems.length === 0 ? (
        <div className="catalog-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <h3>No items found</h3>
          {filter === "Borrowed" ? (
            <p>No borrowed items found</p>
          ) : (
            <>
              <p>Try adjusting your filter or create a new item</p>
              <button className="btn btn-green" onClick={() => setShowCreate(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
                Create Item
              </button>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <>
          <div className="catalog-grid">
            {filteredItems.map((item) => {
              const avail = getAvailableQuantity(item);
              const total = Math.max(0, numOr(item.quantity));
              return (
                <div className="catalog-card" key={item.id}>
                  <div className="catalog-card-image">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.itemName} loading="lazy" width="200" height="200" decoding="async" onClick={() => setImageOverlay(item.imageUrl)} />
                    ) : (
                      <div className="item-placeholder">
                        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                        <span>No image</span>
                      </div>
                    )}
                  </div>
                  <div className="catalog-card-body">
                    <h3 className="catalog-card-title">{item.itemName || "-"}</h3>
                    <div className="catalog-card-meta">
                      {item.category && <span className="category-pill">{item.category}</span>}
                      {item.condition && <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span>}
                      {item.course && <span className="category-pill" style={{ background: "#e3f2fd", color: "#1565c0" }}>{item.course}</span>}
                    </div>
                    {item.created_by_admin_name && (
                      <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>Created by: {item.created_by_admin_name}</div>
                    )}
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
          {paginationData && (
            <Pagination
              page={paginationData.page}
              totalPages={paginationData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      ) : (
        <>
          <div className="catalog-table-wrapper">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th>Course</th>
                  <th>Condition</th>
                  <th>Quantity</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const avail = getAvailableQuantity(item);
                  const total = Math.max(0, numOr(item.quantity));
                  return (
                    <tr key={item.id}>
                      <td className="table-name-cell">
                        <div className="table-item-name">
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt="" className="table-item-thumb" loading="lazy" width="40" height="40" decoding="async" onClick={() => setImageOverlay(item.imageUrl)} />
                          ) : (
                            <div className="table-item-thumb-placeholder">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
                            </div>
                          )}
                          <span>{item.itemName || "-"}</span>
                        </div>
                      </td>
                      <td>{item.category ? <span className="category-pill">{item.category}</span> : "-"}</td>
                      <td>{item.course || "-"}</td>
                      <td>{item.condition ? <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span> : "-"}</td>
                      <td>{Number.isFinite(Number(item.availableQuantity)) ? `${avail} / ${total}` : total}</td>
                      <td className="table-actions-cell">
                        <div className="catalog-kebab-wrap">
                          <button className="catalog-kebab-btn" onClick={() => setOpenKebab(openKebab === item.id ? null : item.id)}>
                            <MdMoreVert size={18} />
                          </button>
                          {openKebab === item.id && (
                            <div className="catalog-kebab-dropdown">
                              <button onClick={() => { setOpenKebab(null); showQrModal(item.id, item.itemName); }}>
                                <MdQrCodeScanner size={14} /> QR Code
                              </button>
                              <button onClick={() => { setOpenKebab(null); setShowUpdate({ ...item }); }}>
                                <MdEdit size={14} /> Edit
                              </button>
                              <button className="danger" onClick={() => { setOpenKebab(null); handleDelete(item.id); }}>
                                <MdDelete size={14} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paginationData && (
            <Pagination
              page={paginationData.page}
              totalPages={paginationData.totalPages}
              onPageChange={setPage}
            />
          )}
        </>
      )}

      <div className={`lab-slide-panel ${showCreate ? "open" : ""}`}>
        <div className="lab-slide-header">
          <h2>Create Item</h2>
          <button className="lab-slide-close" onClick={() => setShowCreate(false)}>
            <MdClose size={20} />
          </button>
        </div>
        <div className="lab-slide-body">
          <div className="lab-slide-accent" />
          <form onSubmit={handleCreate}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon details"><MdAssignment size={14} /></div>
                <span className="lab-form-section-title">Item Info</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Item Name <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.itemName} onChange={(e) => setForm({ ...form, itemName: e.target.value })} required placeholder="e.g. Oscilloscope" />
                    <MdEdit size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Category <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
                      <option value="" disabled>Select Category</option>
                      <option value="Tools">Tools</option>
                      <option value="Equipment">Equipment</option>
                    </select>
                    <MdInfo size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Course <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <select value={form.course} onChange={(e) => setForm({ ...form, course: e.target.value })} required>
                    <option value="" disabled>Select Course</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MdAssignment size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon schedule"><MdTag size={14} /></div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Quantity <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} required placeholder="0" />
                    <MdTag size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Barcode</label>
                  <div className="lab-input-wrap">
                    <input type="text" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
                    <MdQrCode size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Condition <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <select value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} required>
                    <option value="" disabled>Select Condition</option>
                    {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MdInfo size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon class"><MdImage size={14} /></div>
                <span className="lab-form-section-title">Image</span>
              </div>
              <div className="lab-form-field">
                <label>Photo <span className="lab-required" /></label>
                <div className="image-upload-row">
                  <div className="lab-input-wrap" style={{ flex: 1 }}>
                    <input type="url" placeholder="Image URL" value={form.imageUrl} readOnly required />
                    <MdImage size={16} />
                  </div>
                  <label className="text-btn">
                    {uploading ? "Uploading..." : "Upload"}
                    <input type="file" accept="image/*" onChange={handleUpload} hidden />
                  </label>
                </div>
              </div>
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => setShowCreate(false)}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn">Create Item</button>
            </div>
          </form>
        </div>
      </div>
      {showCreate && <div className="lab-slide-backdrop" onClick={() => setShowCreate(false)} />}

      {showQr && (
        <Modal title={showQr.name || "Item QR Code"} onClose={() => setShowQr(null)} wide>
          <div className="qr-canvas"><img src={showQr.dataUrl} alt="QR Code" /></div>
          <p className="qr-value">{showQr.value}</p>
          <div className="catalog-actions">
            <button className="btn btn-green" onClick={() => window.print()}>Print</button>
            <button className="btn btn-orange" onClick={() => setShowQr(null)}>Close</button>
          </div>
        </Modal>
      )}

      <div className={`lab-slide-panel ${showUpdate ? "open" : ""}`}>
        {showUpdate && (
        <div className="lab-slide-header">
          <h2>Update Item</h2>
          <button className="lab-slide-close" onClick={() => setShowUpdate(null)}>
            <MdClose size={20} />
          </button>
        </div>
        )}
        <div className="lab-slide-body">
          {showUpdate && (<>
          <div className="lab-slide-accent" />
          <form onSubmit={handleUpdate}>
            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon details"><MdAssignment size={14} /></div>
                <span className="lab-form-section-title">Item Info</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Item Name <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="text" value={showUpdate.itemName || ""} onChange={(e) => setShowUpdate({ ...showUpdate, itemName: e.target.value })} required placeholder="Item name" />
                    <MdEdit size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Category <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <select value={showUpdate.category || ""} onChange={(e) => setShowUpdate({ ...showUpdate, category: e.target.value })} required>
                      <option value="" disabled>Select Category</option>
                      <option value="Tools">Tools</option>
                      <option value="Equipment">Equipment</option>
                    </select>
                    <MdInfo size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Course <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <select value={showUpdate.course || ""} onChange={(e) => setShowUpdate({ ...showUpdate, course: e.target.value })} required>
                    <option value="" disabled>Select Course</option>
                    {COURSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <MdAssignment size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon schedule"><MdTag size={14} /></div>
                <span className="lab-form-section-title">Details</span>
              </div>
              <div className="lab-form-row">
                <div className="lab-form-field">
                  <label>Quantity <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <input type="number" value={showUpdate.quantity || ""} onChange={(e) => setShowUpdate({ ...showUpdate, quantity: e.target.value })} required placeholder="0" />
                    <MdTag size={16} />
                  </div>
                </div>
                <div className="lab-form-field">
                  <label>Condition <span className="lab-required" /></label>
                  <div className="lab-input-wrap">
                    <select value={showUpdate.condition || ""} onChange={(e) => setShowUpdate({ ...showUpdate, condition: e.target.value })} required>
                      <option value="" disabled>Select Condition</option>
                      {["Excellent", "Good", "Fair", "Damaged", "For Repair", "Missing"].map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <MdInfo size={16} />
                  </div>
                </div>
              </div>
              <div className="lab-form-field">
                <label>Status</label>
                <div className="lab-input-wrap">
                  <select value={showUpdate.status || "Available"} onChange={(e) => setShowUpdate({ ...showUpdate, status: e.target.value })}>
                    <option value="Available">Available</option>
                    <option value="Borrowed">Borrowed</option>
                  </select>
                  <MdInfo size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-section">
              <div className="lab-form-section-header">
                <div className="lab-form-section-icon class"><MdImage size={14} /></div>
                <span className="lab-form-section-title">Image</span>
              </div>
              <div className="lab-form-field">
                <label>Photo <span className="lab-required" /></label>
                <div className="lab-input-wrap">
                  <input type="url" placeholder="Image URL" value={showUpdate.imageUrl || ""} readOnly required />
                  <MdImage size={16} />
                </div>
              </div>
            </div>

            <div className="lab-form-actions">
              <button type="button" className="lab-form-cancel-btn" onClick={() => setShowUpdate(null)}>Cancel</button>
              <button type="submit" className="lab-form-submit-btn">Update Item</button>
            </div>
          </form>
          </>)}
        </div>
      </div>
      {showUpdate && <div className="lab-slide-backdrop" onClick={() => setShowUpdate(null)} />}

      {imageOverlay && (
        <div className="image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="image-overlay-content">
            <img src={imageOverlay} alt="Large View" loading="eager" width="800" height="600" decoding="async" />
            <button className="btn-close" onClick={() => setImageOverlay(null)}>&times;</button>
          </div>
        </div>
      )}
    </section>
  );
}
