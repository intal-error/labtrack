import { useEffect, useMemo, useState } from "react";
import { MdSearch, MdMoreVert, MdQrCodeScanner, MdEdit, MdDelete, MdImage } from "react-icons/md";
import Pagination from "../ui/Pagination";
import ViewToggle from "../ui/ViewToggle";
import FilterSelect from "../ui/FilterSelect";
import {
  ALL,
  CATALOG_CATEGORIES,
  CATALOG_CONDITIONS,
  CATALOG_COURSE_UNASSIGNED,
  CATALOG_SORTS,
  CATALOG_STATUSES,
} from "../../constants/catalog";
import { COURSES } from "../../constants/courses";
import { numOr, getAvailableQuantity, conditionClass, fmtDate } from "../../utils/helpers";
import "../../styles/pages/catalog-browser.css";

const DASH = "\u2014";

// Accepts either plain strings or ready-made {value, label} pairs.
const toValue = (o) => (typeof o === "string" ? o : o.value);

// The "no filter" sentinel row. ALL is the value the backend treats as a no-op.
const withAll = (allLabel, values) => [{ value: ALL, label: allLabel }, ...values];

function ItemThumb({ item, onImageClick }) {
  if (item.imageUrl) {
    return (
      <img
        className="cx-thumb"
        src={item.imageUrl}
        alt=""
        loading="lazy"
        width="34"
        height="34"
        decoding="async"
        onClick={() => onImageClick?.(item.imageUrl)}
      />
    );
  }
  return (
    <span className="cx-thumb cx-thumb--empty">
      <MdImage size={18} />
    </span>
  );
}

function StatusPill({ status }) {
  const key = (status || "").toLowerCase() === "borrowed" ? "borrowed" : "available";
  return <span className={`cx-status cx-status--${key}`}>{status || DASH}</span>;
}

function AvailableCell({ item }) {
  const available = getAvailableQuantity(item);
  const total = Math.max(0, numOr(item.quantity));
  const pct = total > 0 ? Math.min(100, Math.max(0, (available / total) * 100)) : 0;
  return (
    <div className="cx-avail">
      <span className="cx-avail-num">
        {available} <span className="cx-avail-sep">/</span> {total}
      </span>
      <span className="cx-avail-bar">
        <span className="cx-avail-fill" style={{ width: `${pct}%` }} />
      </span>
    </div>
  );
}

/**
 * Toolbar + results table/grid for the catalog, shared by /catalog (admin) and
 * /inventory (student).
 *
 * Everything here is namespaced `.cx-*`. That is deliberate: the pre-existing
 * `.catalog-table` / `.catalog-card` / `.category-pill` classes in catalog.css
 * are also rendered by BorrowRequestsTab, MaintenanceTab and RequestsPanel, so
 * repurposing them would have restyled three unrelated screens.
 */
export default function CatalogBrowser({
  items,
  pagination,
  filters,
  onFilterChange,
  onPageChange,
  viewMode,
  onViewChange,
  viewStorageKey,
  courseOptions,
  busy = false,
  canManage = false,
  onImageClick,
  onEdit,
  onDelete,
  onQr,
  actions = null,
  emptyTitle = "No items found",
  emptyMessage = "Try adjusting your filters.",
  emptyAction = null,
}) {
  const [openKebab, setOpenKebab] = useState(null);

  useEffect(() => {
    if (!openKebab) return undefined;
    const onDocClick = (e) => {
      if (!e.target.closest(".catalog-kebab-wrap")) setOpenKebab(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpenKebab(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [openKebab]);

  const courseSelectOptions = useMemo(() => {
    const base = courseOptions && courseOptions.length ? courseOptions : COURSES;
    const values = new Set(base.map(toValue));
    const extras = values.has(CATALOG_COURSE_UNASSIGNED) ? [] : [CATALOG_COURSE_UNASSIGNED];
    return [{ value: ALL, label: "All Courses" }, ...base, ...extras];
  }, [courseOptions]);

  const statusOptions = useMemo(() => withAll("All Statuses", CATALOG_STATUSES), []);
  const categoryOptions = useMemo(() => withAll("All Categories", CATALOG_CATEGORIES), []);
  const conditionOptions = useMemo(() => withAll("All Conditions", CATALOG_CONDITIONS), []);

  const isEmpty = items.length === 0;

  return (
    <>
      <div className="cx-toolbar">
        <div className="cx-search">
          <MdSearch size={16} />
          <input
            type="search"
            className="cx-search-input"
            placeholder="Search items, barcode, asset tag..."
            aria-label="Search catalog"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
          />
        </div>

        <FilterSelect label="Course" value={filters.course} onChange={(v) => onFilterChange({ course: v })} options={courseSelectOptions} />
        <FilterSelect label="Status" value={filters.status} onChange={(v) => onFilterChange({ status: v })} options={statusOptions} />
        <FilterSelect label="Category" value={filters.category} onChange={(v) => onFilterChange({ category: v })} options={categoryOptions} />
        <FilterSelect label="Condition" value={filters.condition} onChange={(v) => onFilterChange({ condition: v })} options={conditionOptions} />

        <select
          className="cx-select cx-select--sort"
          aria-label="Sort"
          title="Sort"
          value={filters.sort}
          onChange={(e) => onFilterChange({ sort: e.target.value })}
        >
          {CATALOG_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>

        <ViewToggle value={viewMode} onChange={onViewChange} localStorageKey={viewStorageKey} />

        <div className="cx-toolbar-tail">
          {pagination && (
            <Pagination
              compact
              /* 5, not the default 7: this instance sits inside a single-row
                 toolbar that already holds search + 5 filters + view toggle +
                 actions, and a 7-wide window pushed the whole row to wrap. */
              maxVisible={5}
              currentPage={pagination.page}
              totalPages={pagination.totalPages}
              totalItems={pagination.total}
              pageSize={pagination.limit}
              onPageChange={onPageChange}
            />
          )}
        </div>

        {actions && <div className="cx-toolbar-actions">{actions}</div>}
      </div>

      {isEmpty ? (
        <div className="catalog-empty">
          <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
            <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
          </svg>
          <h3>{emptyTitle}</h3>
          <p>{emptyMessage}</p>
          {emptyAction}
        </div>
      ) : (
        <div className={`cx-results${busy ? " cx-results--busy" : ""}`}>
          {viewMode === "grid" ? (
            <div className="cx-grid">
              {items.map((item) => (
                <div className="cx-card" key={item.id}>
                  <div className="cx-card-image">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.itemName || ""}
                        loading="lazy"
                        width="200"
                        height="150"
                        decoding="async"
                        onClick={() => onImageClick?.(item.imageUrl)}
                      />
                    ) : (
                      <div className="cx-card-placeholder">
                        <MdImage size={34} />
                        <span>No photo</span>
                      </div>
                    )}
                    <span className="cx-card-status">
                      <StatusPill status={item.status} />
                    </span>
                  </div>
                  <div className="cx-card-body">
                    <h3 className="cx-card-title" title={item.itemName}>
                      {item.itemName || DASH}
                    </h3>
                    <div className="cx-card-meta">
                      {item.category && <span className="category-pill">{item.category}</span>}
                      {item.condition && <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span>}
                      {item.course && <span className="category-pill cx-pill-course">{item.course}</span>}
                    </div>
                    <AvailableCell item={item} />
                    {canManage && (
                      <div className="cx-card-actions">
                        <button className="cx-card-btn" onClick={() => onQr?.(item)} title="QR code" aria-label="QR code">
                          <MdQrCodeScanner size={15} />
                        </button>
                        <button className="cx-card-btn" onClick={() => onEdit?.(item)} title="Edit" aria-label="Edit">
                          <MdEdit size={15} />
                        </button>
                        <button className="cx-card-btn cx-card-btn--danger" onClick={() => onDelete?.(item)} title="Delete" aria-label="Delete">
                          <MdDelete size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="cx-table-wrap">
              <table className="cx-table">
                <thead>
                  <tr>
                    <th className="cx-th-item">Item</th>
                    <th>Category</th>
                    <th>Course</th>
                    <th>Condition</th>
                    <th>Status</th>
                    <th className="cx-th-avail">Available</th>
                    {canManage && <th className="cx-th-actions">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td className="cx-td-item">
                        <div className="cx-item">
                          <ItemThumb item={item} onImageClick={onImageClick} />
                          <div className="cx-item-text">
                            <span className="cx-item-name" title={item.itemName}>
                              {item.itemName || DASH}
                            </span>
                            {item.created_at && <span className="cx-item-sub">Added {fmtDate(item.created_at)}</span>}
                          </div>
                        </div>
                      </td>
                      <td>{item.category ? <span className="category-pill">{item.category}</span> : <span className="cx-none">{DASH}</span>}</td>
                      <td>{item.course || <span className="cx-none">{DASH}</span>}</td>
                      <td>
                        {item.condition ? (
                          <span className={`condition-badge ${conditionClass(item.condition)}`}>{item.condition}</span>
                        ) : (
                          <span className="cx-none">{DASH}</span>
                        )}
                      </td>
                      <td>
                        <StatusPill status={item.status} />
                      </td>
                      <td>
                        <AvailableCell item={item} />
                      </td>
                      {canManage && (
                        <td className="cx-td-actions">
                          <div className="catalog-kebab-wrap">
                            <button
                              className="catalog-kebab-btn"
                              aria-haspopup="true"
                              aria-expanded={openKebab === item.id}
                              aria-label={`Actions for ${item.itemName || "item"}`}
                              onClick={() => setOpenKebab(openKebab === item.id ? null : item.id)}
                            >
                              <MdMoreVert size={18} />
                            </button>
                            {openKebab === item.id && (
                              /* No role="menu": the popup is a mix of read-only
                                 metadata and buttons, and a menu role may only
                                 contain menuitem children. */
                              <div className="catalog-kebab-dropdown">
                                {/* Barcode / Asset Tag used to be their own
                                    columns, but they are empty for most items
                                    and pushed the kebab off-screen. */}
                                <div className="cx-kebab-meta">
                                  <div className="cx-kebab-meta-row">
                                    <span className="cx-kebab-meta-label">Barcode</span>
                                    {item.barcode ? (
                                      <span className="cx-kebab-meta-value" title={item.barcode}>
                                        {item.barcode}
                                      </span>
                                    ) : (
                                      <span className="cx-kebab-meta-value empty">None</span>
                                    )}
                                  </div>
                                  <div className="cx-kebab-meta-row">
                                    <span className="cx-kebab-meta-label">Asset Tag</span>
                                    {item.assetTag ? (
                                      <span className="cx-kebab-meta-value" title={item.assetTag}>
                                        {item.assetTag}
                                      </span>
                                    ) : (
                                      <span className="cx-kebab-meta-value empty">None</span>
                                    )}
                                  </div>
                                </div>
                                <div className="cx-kebab-divider" />
                                <button
                                  onClick={() => {
                                    setOpenKebab(null);
                                    onQr?.(item);
                                  }}
                                >
                                  <MdQrCodeScanner size={14} /> QR Code
                                </button>
                                <button
                                  onClick={() => {
                                    setOpenKebab(null);
                                    onEdit?.(item);
                                  }}
                                >
                                  <MdEdit size={14} /> Edit
                                </button>
                                <button
                                  className="danger"
                                  onClick={() => {
                                    setOpenKebab(null);
                                    onDelete?.(item);
                                  }}
                                >
                                  <MdDelete size={14} /> Delete
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </>
  );
}