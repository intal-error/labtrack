import { memo, useEffect, useMemo, useState } from "react";
import { MdSearch, MdMoreVert, MdQrCodeScanner, MdEdit, MdDelete, MdImage } from "react-icons/md";
import Pagination from "../ui/Pagination";
import ViewToggle from "../ui/ViewToggle";
import FilterSelect from "../ui/FilterSelect";
import useMediaQuery, { STUDENT_CARD_MAX_WIDTH } from "../../hooks/useMediaQuery";
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
import { Skeleton, SkeletonRegion } from "../ui/Skeleton";
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
function CatalogBrowser({
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
  loading = false,
  canManage = false,
  onImageClick,
  onEdit,
  onDelete,
  onQr,
  actions = null,
  narrowAsCards = false,
  emptyTitle = "No items found",
  emptyMessage = "Try adjusting your filters.",
  emptyAction = null,
}) {
  /*
   * `narrowAsCards` is OPT-IN and is what keeps this out of the admin catalog.
   *
   * This component is shared by /inventory (student) and /catalog (admin). The
   * table is floored at 820px by catalog-browser.css:564 (a <=1024px rule),
   * while an 820px viewport offers only ~788px inside .main-content, so on a
   * tablet the table cannot fit and .main-content's overflow-x:hidden clips it
   * rather than scrolling it.
   *
   * That is a real problem, but it is a STUDENT problem: the student catalog is
   * a browse surface where cards are the right layout anyway, whereas the admin
   * catalog is a work surface whose table carries the per-row QR / Edit / Delete
   * kebab and the Barcode/Asset-Tag popup. Switching the admin view to cards
   * would be an unrequested change to a surface nobody asked us to touch, so the
   * admin call site deliberately does NOT set this flag and keeps its table at
   * every width exactly as before.
   *
   * The hook is called unconditionally (rules of hooks) but only consulted when
   * the caller opted in.
   */
  const isNarrow = useMediaQuery(`(max-width: ${STUDENT_CARD_MAX_WIDTH}px)`);
  const forceCards = narrowAsCards && isNarrow;
  const showGrid = forceCards || viewMode === "grid";

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

  /*
   * First load with nothing to show yet.
   *
   * `loading` is what the page passes when the item query has never resolved. It is
   * NOT the same as `busy` (a refetch over data already on screen, which the
   * `cx-results--busy` class dims rather than replaces).
   *
   * WHY THIS IS HERE RATHER THAN AN EARLY RETURN IN THE PAGE: the toolbar above is
   * the search box, five filters, the sort control, the view toggle, the pagination
   * and the Create/Report buttons, and not one of them depends on the item list. The
   * page used to return a full-height spinner for the whole component, so a user
   * arriving at /catalog could not start typing a search until the first response
   * landed -- and the StatStrip above it independently rendered four zeroed tiles
   * that then jumped, because it resolves on its own clock. Now the toolbar paints
   * immediately and only the rows wait.
   */
  const showSkeleton = loading && isEmpty;

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

        <ViewToggle value={viewMode} onChange={onViewChange} localStorageKey={viewStorageKey} hide={forceCards} />

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

      <CatalogResults
        items={items}
        loading={showSkeleton}
        empty={isEmpty}
        busy={busy}
        showGrid={showGrid}
        canManage={canManage}
        emptyTitle={emptyTitle}
        emptyMessage={emptyMessage}
        emptyAction={emptyAction}
        onImageClick={onImageClick}
        onEdit={onEdit}
        onDelete={onDelete}
        onQr={onQr}
      />
    </>
  );
}

/*
 * The results body, isolated and memoized.
 *
 * -- WHY THIS IS A SEPARATE COMPONENT AND NOT JUST memo(CatalogBrowser) ------
 *
 * Memoizing the whole browser does not work on its own, and the reason is structural.
 * The search box is a CONTROLLED input whose value lives in useCatalogFilters, i.e. in
 * the page component above. So `filters` is a new object on every keystroke, any shallow
 * compare at that boundary misses, and all 25 rows re-render several times per word --
 * each one recomputing getAvailableQuantity / conditionClass / fmtDate -- on keystrokes
 * that have not even issued a request yet, because of the 300 ms debounce.
 *
 * Lifting the search state down here would also have worked, but useCatalogFilters is
 * deliberately shared with /inventory and owns the ?search= deep-link sync and the
 * page-reset edge, so moving it would mean forking that logic into two copies.
 * Splitting the boundary is the smaller change.
 *
 * Nothing in the prop list below changes while the user types: `items` is stable
 * because useCatalog carries keepPreviousData and memoizes the derived array, and every
 * callback and JSX prop is stabilized at the call site. So a keystroke re-renders the
 * toolbar -- a search box and five selects -- and leaves the rows alone.
 *
 * `openKebab` is read and written here rather than lifted, because it is row-local UI
 * state that has no meaning to the page.
 */
function CatalogResultsInner({
  items,
  loading,
  empty,
  busy,
  showGrid,
  canManage,
  emptyTitle,
  emptyMessage,
  emptyAction,
  onImageClick,
  onEdit,
  onDelete,
  onQr,
}) {
  const [openKebab, setOpenKebab] = useState(null);

  /*
   * Dismiss the row menu on an outside click OR on Escape.
   *
   * Both halves are needed and both were here before the split: the click handler is
   * obvious, but Escape is the only dismissal available to a keyboard user once focus
   * has moved into the menu, and a menu that can only be closed by clicking elsewhere
   * is a keyboard trap on the admin catalog's main work surface.
   *
   * Only registered while a menu is actually open, so the common case adds no
   * document-level listeners at all.
   */
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

  return (
    <>
{loading ? (
  <SkeletonRegion label="Loading catalog items" className="cx-skeleton">
    <div className="cx-grid">
      {Array.from({ length: 8 }).map((_, i) => (
        <div className="cx-card" key={i} aria-hidden="true">
          <Skeleton variant="block" height={150} />
          <div className="cx-card-body">
            <Skeleton variant="text" width="75%" height={16} />
            <Skeleton variant="text" width="50%" height={12} />
            <Skeleton variant="text" width="40%" height={10} />
          </div>
        </div>
      ))}
    </div>
  </SkeletonRegion>
) : empty ? (
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
    {showGrid ? (
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

const CatalogResults = memo(CatalogResultsInner);

/*
 * The shell. Deliberately NOT memoized.
 *
 * A memo here would look like an optimisation and be a no-op: `filters` is a fresh
 * object on every keystroke, because the search input is controlled from the page
 * above, so the shallow compare could never hit during typing -- the one case that
 * actually matters. What it would buy is the OTHER re-renders the page triggers
 * (isFetching flipping during a refetch, the StatStrip numbers resolving, `exporting`),
 * which are rare. The row-level saving is what CatalogResults above exists for.
 */
export default CatalogBrowser;