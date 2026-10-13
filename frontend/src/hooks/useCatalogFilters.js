import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ALL, CATALOG_PAGE_SIZE } from "../constants/catalog";

const SEARCH_DEBOUNCE_MS = 300;

const KEYS = ["search", "course", "status", "category", "condition", "sort"];

/**
 * Single source of truth for the catalog filter bar, shared by /catalog
 * (admin) and /inventory (student) so the two can no longer drift apart.
 *
 * `params` is returned as a plain object, NOT a hand-built query string:
 * api.toQuery() runs it through URLSearchParams, which percent-encodes values.
 * The old inline template string in CatalogPage did not, so a search for
 * "R&D #3" silently truncated the query.
 */
export default function useCatalogFilters() {
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("search") || "";

  const [search, setSearch] = useState(urlSearch);
  const [course, setCourse] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [condition, setCondition] = useState(ALL);
  const [sort, setSort] = useState("name");
  const [page, setPage] = useState(1);

  // Deep links (the scanner lands on /catalog?search=...) must win over state.
  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  /*
   * Memoized because CatalogBrowser is memoized and receives this as a prop.
   *
   * WHY IT MATTERS: `search` is raw input state, so it changes on every keystroke.
   * An unmemoized object here is a new reference every render, which makes
   * CatalogBrowser's memo miss every time and re-reconciles all 25 rows -- each row
   * recomputing getAvailableQuantity / conditionClass / fmtDate -- for a keystroke
   * that (thanks to the debounce above) has not yet produced a request.
   */
  const filters = useMemo(
    () => ({ search, course, status, category, condition, sort }),
    [search, course, status, category, condition, sort]
  );

  // Render-phase reset, matching the pattern already used in this repo
  // (ViewToggle.jsx:18, TransactionsPage). Any filter change invalidates the
  // current page number, otherwise page 7 of a 3-page result renders empty.
  const [prevResetKeys, setPrevResetKeys] = useState(KEYS.map((k) => filters[k]));
  const changed = KEYS.some((k, i) => prevResetKeys[i] !== filters[k]);
  if (changed) {
    setPrevResetKeys(KEYS.map((k) => filters[k]));
    setPage(1);
  }

  // Typing "microscope" used to fire 10 requests; this collapses it to one.
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    if (search === debouncedSearch) return undefined;
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search, debouncedSearch]);

  const params = useMemo(() => {
    const next = { page, limit: CATALOG_PAGE_SIZE, sort };
    const term = debouncedSearch.trim();
    if (term) next.search = term;
    // "All" is a no-op server-side, so it is omitted to keep the key small.
    if (course !== ALL) next.course = course;
    if (status !== ALL) next.status = status;
    if (category !== ALL) next.category = category;
    if (condition !== ALL) next.condition = condition;
    return next;
  }, [page, sort, debouncedSearch, course, status, category, condition]);

  /*
   * Stable identity: passed straight to CatalogBrowser as `onFilterChange`.
   *
   * Every useState setter above is referentially stable for the life of the
   * component, so the dependency list is genuinely empty -- this closure can never
   * read a stale value.
   */
  const setFilters = useCallback((patch) => {
    if ("search" in patch) setSearch(patch.search);
    if ("course" in patch) setCourse(patch.course);
    if ("status" in patch) setStatus(patch.status);
    if ("category" in patch) setCategory(patch.category);
    if ("condition" in patch) setCondition(patch.condition);
    if ("sort" in patch) setSort(patch.sort);
  }, []);

  /*
 * Memoized, and the dependency list is genuinely empty.
 *
 * Every setState setter above is referentially stable for the life of the component,
 * so this closure can never read a stale value.
 *
 * WHY THIS MATTERS AND IT IS NOT OBVIOUS: both catalog pages memoise their
 * `emptyAction` element on `[activeFilterCount, resetFilters]` and hand it to the
 * memoized CatalogResults. An unmemoized `resetFilters` is a fresh function identity
 * on every render, so `emptyAction` was rebuilt on every render too, so the shallow
 * prop compare on CatalogResults missed on every render -- and the entire row-level
 * memo, the thing that stops 25 rows reconciling per keystroke, did nothing in the
 * real app. It looked fine in the component test because that test passes no
 * `emptyAction`. Now that `emptyAction` is passed in a test too, so this cannot
 * regress silently again.
 */
const resetFilters = useCallback(() => {
    setSearch("");
    setCourse(ALL);
    setStatus(ALL);
    setCategory(ALL);
    setCondition(ALL);
    setSort("name");
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(
    () =>
      (search.trim() ? 1 : 0) +
      (course !== ALL ? 1 : 0) +
      (status !== ALL ? 1 : 0) +
      (category !== ALL ? 1 : 0) +
      (condition !== ALL ? 1 : 0) +
      (sort !== "name" ? 1 : 0),
    [search, course, status, category, condition, sort]
  );

  return { filters, params, page, setPage, setFilters, resetFilters, activeFilterCount };
}