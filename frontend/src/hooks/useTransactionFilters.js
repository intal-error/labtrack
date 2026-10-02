import { useEffect, useMemo, useState } from "react";
import { ALL } from "../constants/catalog";
import { DATE_RANGE_OPTIONS, rangeToParams } from "../components/ui/exportReport";

const SEARCH_DEBOUNCE_MS = 300;

export const TRANSACTION_SORTS = [
  { value: "date-desc", label: "Newest First" },
  { value: "date-asc", label: "Oldest First" },
  { value: "name-asc", label: "Name A-Z" },
  { value: "name-desc", label: "Name Z-A" },
  { value: "qty-desc", label: "Qty High-Low" },
  { value: "qty-asc", label: "Qty Low-High" },
];

export const TRANSACTION_PAGE_SIZE = 25;
export { DATE_RANGE_OPTIONS };

const FILTER_KEYS = ["search", "course", "year", "dateRange", "customFrom", "customTo", "sort"];

/**
 * Filter state for every transaction surface (/transactions, My Activity).
 *
 * `sort` is sent to the SERVER, not applied client-side. The page used to call
 * sortItems() on the fetched page, so "Name A-Z" only reordered the 25 rows it
 * happened to have; both endpoint families now honour ?sort= before paginating.
 *
 * The student endpoints ignore course/year/dateFrom/dateTo, so My Activity must
 * leave them at their defaults — the shared hook then omits them from the query
 * entirely rather than sending values that would be silently dropped.
 */
export default function useTransactionFilters({ initialSearch = "" } = {}) {
  const [search, setSearch] = useState(initialSearch);
  const [course, setCourse] = useState(ALL);
  const [year, setYear] = useState(ALL);
  const [dateRange, setDateRange] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState("date-desc");
  const [page, setPage] = useState(1);

  const filters = { search, course, year, dateRange, customFrom, customTo, sort };

  // Render-phase reset, matching the existing repo pattern (useCatalogFilters).
  const [prevKeys, setPrevKeys] = useState(FILTER_KEYS.map((k) => filters[k]));
  if (FILTER_KEYS.some((k, i) => prevKeys[i] !== filters[k])) {
    setPrevKeys(FILTER_KEYS.map((k) => filters[k]));
    setPage(1);
  }

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    if (search === debouncedSearch) return undefined;
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const params = useMemo(() => {
    const next = { page, limit: TRANSACTION_PAGE_SIZE, sort };
    const term = debouncedSearch.trim();
    if (term) next.search = term;
    if (course !== ALL) next.course = course;
    if (year !== ALL) next.year = year;
    return { ...next, ...rangeToParams(dateRange, customFrom, customTo) };
  }, [page, sort, debouncedSearch, course, year, dateRange, customFrom, customTo]);

  const setFilters = (patch) => {
    if ("search" in patch) setSearch(patch.search);
    if ("course" in patch) setCourse(patch.course);
    if ("year" in patch) setYear(patch.year);
    if ("dateRange" in patch) setDateRange(patch.dateRange);
    if ("customFrom" in patch) setCustomFrom(patch.customFrom);
    if ("customTo" in patch) setCustomTo(patch.customTo);
    if ("sort" in patch) setSort(patch.sort);
  };

  const resetFilters = () => {
    setSearch("");
    setCourse(ALL);
    setYear(ALL);
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setSort("date-desc");
    setPage(1);
  };

  const activeFilterCount =
    (search.trim() ? 1 : 0) +
    (course !== ALL ? 1 : 0) +
    (year !== ALL ? 1 : 0) +
    (dateRange !== "all" ? 1 : 0) +
    (sort !== "date-desc" ? 1 : 0);

  return { filters, params, page, setPage, setFilters, resetFilters, activeFilterCount, isCustomRange: dateRange === "custom" };
}