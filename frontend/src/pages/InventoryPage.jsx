import { useState, useEffect, useCallback, useMemo } from "react";
import { api } from "../services/api";
import { COURSES } from "../constants/courses";
import { numOr, getAvailableQuantity } from "../utils/helpers";
import { filterBySearch } from "../utils/search";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Pagination from "../components/ui/Pagination";
import toast from "react-hot-toast";
import "../styles/pages/catalog.css";
import { MdInventory } from "react-icons/md";
import PageHero from "../components/ui/PageHero";
import ViewToggle from "../components/ui/ViewToggle";

export default function InventoryPage() {
  const [allItems, setAllItems] = useState([]);
  const [filter, setFilter] = useState("All");
  const [filterCourse, setFilterCourse] = useState("All");
  const [sort, setSort] = useState("name");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [paginationData, setPaginationData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [viewMode, setViewMode] = useState("list");

  useEffect(() => { setPage(1); }, [search, filter, filterCourse, sort]);

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
    } catch (err) { toast.error(err.message || "Failed to load inventory"); }
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
      <PageHero icon={MdInventory} title="Catalog" />

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
        <ViewToggle value={viewMode} onChange={setViewMode} localStorageKey="labtrack-inventory-view" />
      </div>

      {filteredItems.length === 0 ? (
        <div className="catalog-empty">
          <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>
          <h3>No items found</h3>
          <p>Try adjusting your search or filter</p>
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
                    <span className={`card-status-badge ${item.status === "Available" ? "status-available" : "status-borrowed"}`}>{item.status || "Available"}</span>
                  </div>
                  <div className="catalog-card-body">
                    <h3 className="catalog-card-title">{item.itemName || "-"}</h3>
                    <div className="catalog-card-meta">
                      {item.category && <span className="category-pill">{item.category}</span>}
                      {item.condition && <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span>}
                      {item.course && <span className="category-pill" style={{ background: "#e3f2fd", color: "#1565c0" }}>{item.course}</span>}
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
                  <th>Status</th>
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
                      <td><span className={`card-status-badge ${item.status === "Available" ? "status-available" : "status-borrowed"}`}>{item.status || "Available"}</span></td>
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
