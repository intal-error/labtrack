import { MdSearch } from "react-icons/md";
import { COURSES, YEARS } from "../../constants/courses";
import { ALL } from "../../constants/catalog";
import { TRANSACTION_SORTS, DATE_RANGE_OPTIONS } from "../../hooks/useTransactionFilters";
import ViewToggle from "../ui/ViewToggle";
import Pagination from "../ui/Pagination";
import "../../styles/pages/transactions-browser.css";

/**
 * One toolbar for all three transaction surfaces.
 *
 * The flag props exist because the endpoint families differ: /transactions
 * honours course, year and date range, while /transactions/my-* silently ignore
 * them. Rather than render controls that would do nothing, My Activity omits
 * them instead of shipping dead filters.
 */
export default function TransactionToolbar({
  filters,
  onFilterChange,
  tabs = null,
  tabsLabel = "Dataset",
  activeTab = null,
  onTabChange = null,
  resultCount = null,
  total = null,
  showCourseFilter = false,
  showYearFilter = false,
  showDateFilter = false,
  showSearch = true,
  showSort = true,
  searchPlaceholder = "Search borrower, ID, item...",
  viewMode,
  onViewChange,
  viewStorageKey,
  pagination = null,
  onPageChange,
  actions = null,
}) {
  const isCustom = showDateFilter && filters.dateRange === "custom";

  return (
    <div className="tx-toolbar">
      {tabs && (
        /* aria-pressed toggle buttons, not role="tab". A tablist must be paired
           with a role="tabpanel" and aria-controls, and these switches have no
           in-page panel to point at — they swap which dataset the results area
           shows. RequestsPanel additionally uses this group for plain status
           filters (all/pending/approved), which are not tabs at all. MyActivityPage
           and ResourcesPage keep their real tab/tabpanel pairing. */
        <div className="tx-tabs" role="group" aria-label={tabsLabel}>
          {tabs.map((t) => (
            <button
              key={t.value}
              type="button"
              aria-pressed={activeTab === t.value}
              className={`tx-tab${activeTab === t.value ? " active" : ""}`}
              onClick={() => onTabChange?.(t.value)}
            >
              {t.icon}
              <span>{t.label}</span>
              {typeof t.count === "number" && <span className="tx-tab-count">{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {resultCount !== null && (
        <span className="tx-count">
          Showing {resultCount} of {total}
        </span>
      )}

      {showSearch && (
        <div className="tx-search">
          <MdSearch size={16} />
          <input
            type="search"
            className="tx-search-input"
            placeholder={searchPlaceholder}
            aria-label="Search transactions"
            value={filters.search}
            onChange={(e) => onFilterChange({ search: e.target.value })}
          />
        </div>
      )}

      {showCourseFilter && (
        <select className="tx-select" aria-label="Course" value={filters.course} onChange={(e) => onFilterChange({ course: e.target.value })}>
          <option value={ALL}>All Courses</option>
          {COURSES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}

      {showYearFilter && (
        <select className="tx-select" aria-label="Year" value={filters.year} onChange={(e) => onFilterChange({ year: e.target.value })}>
          <option value={ALL}>All Years</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      )}

      {showDateFilter && (
        <select className="tx-select" aria-label="Date range" value={filters.dateRange} onChange={(e) => onFilterChange({ dateRange: e.target.value })}>
          {DATE_RANGE_OPTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      )}

      {isCustom && (
        <>
          <input
            type="date"
            className="tx-date"
            aria-label="From date"
            value={filters.customFrom}
            max={filters.customTo || undefined}
            onChange={(e) => onFilterChange({ customFrom: e.target.value })}
          />
          <input
            type="date"
            className="tx-date"
            aria-label="To date"
            value={filters.customTo}
            min={filters.customFrom || undefined}
            onChange={(e) => onFilterChange({ customTo: e.target.value })}
          />
        </>
      )}

      {showSort && (
        <select className="tx-select" aria-label="Sort" value={filters.sort} onChange={(e) => onFilterChange({ sort: e.target.value })}>
          {TRANSACTION_SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      )}

      {viewMode !== undefined && (
        <ViewToggle value={viewMode} onChange={onViewChange} localStorageKey={viewStorageKey} />
      )}

      <div className="tx-toolbar-tail">
        {pagination && (
          <Pagination
            compact
            maxVisible={5}
            currentPage={pagination.page}
            totalPages={pagination.totalPages}
            totalItems={pagination.total}
            pageSize={pagination.limit}
            onPageChange={onPageChange}
          />
        )}
      </div>

      {actions && <div className="tx-toolbar-actions">{actions}</div>}
    </div>
  );
}