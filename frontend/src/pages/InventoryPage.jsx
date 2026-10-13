import { useMemo, useState } from "react";
import { useCatalog, useCatalogStats } from "../hooks/useQueries";
import useCatalogFilters from "../hooks/useCatalogFilters";
import StatStrip from "../components/ui/StatStrip";
import CatalogBrowser from "../components/catalog/CatalogBrowser";
import "../styles/pages/catalog.css";
import "../styles/pages/catalog-browser.css";

export default function InventoryPage() {
  const { filters, params, setPage, setFilters, resetFilters, activeFilterCount } = useCatalogFilters();
  const [imageOverlay, setImageOverlay] = useState(null);
  const [viewMode, setViewMode] = useState("list");

  const { data: response, isPending, isFetching } = useCatalog(params);
  const { data: statsData } = useCatalogStats();

  const items = useMemo(() => {
    if (!response) return [];
    return Array.isArray(response) ? response : (response.data || []);
  }, [response]);

  const pagination = useMemo(() => {
    if (!response || Array.isArray(response)) return null;
    return response.pagination || null;
  }, [response]);

  /*
   * Memoized for the same reason as in CatalogPage: StatStrip is `memo`d with a
   * shallow compare, so an inline `items` array guarantees the memo misses.
   */
  const statItems = useMemo(
    () => [
      { label: "Total Items", value: statsData?.total ?? 0 },
      { label: "Available", value: statsData?.available ?? 0 },
      { label: "Borrowed", value: statsData?.borrowed ?? 0 },
      { label: "Total Quantity", value: statsData?.totalQuantity ?? 0 },
    ],
    [statsData]
  );

  const emptyAction = useMemo(
    () =>
      activeFilterCount > 0 ? (
        <button className="btn btn-green" onClick={resetFilters}>
          Clear filters
        </button>
      ) : null,
    [activeFilterCount, resetFilters]
  );

  return (
    <section className="catalog-page">
      <StatStrip
        /* Opt-in mobile hide. Inventory is the student catalog, so the four
           summary tiles are redundant on a phone -- the per-item availability
           bar below carries the same information contextually. Desktop keeps
           them. */
        className="hide-stats-mobile"
        variant="stack"
        items={statItems}
      />

      <CatalogBrowser
        items={items}
        pagination={pagination}
        filters={filters}
        onFilterChange={setFilters}
        onPageChange={setPage}
        viewMode={viewMode}
        onViewChange={setViewMode}
        viewStorageKey="labtrack-inventory-view"
        /* Student-only: below the card breakpoint show the grid cards instead of
           a table that is floored at 820px and cannot fit a tablet viewport.
           The admin catalog deliberately does not set this and keeps its table. */
        narrowAsCards
        busy={isFetching}
        loading={isPending}
        onImageClick={setImageOverlay}
        emptyTitle={activeFilterCount > 0 ? "No matching items" : "Nothing available yet"}
        emptyMessage={
          activeFilterCount > 0 ? "No catalog item matches the current filters." : "Check back later for new equipment."
        }
        emptyAction={emptyAction}
      />

      {imageOverlay && (
        <div className="image-overlay" onClick={() => setImageOverlay(null)}>
          <div className="image-overlay-content">
            <img src={imageOverlay} alt="Large view" loading="eager" width="800" height="600" decoding="async" />
            <button className="btn-close" onClick={() => setImageOverlay(null)} aria-label="Close image">
              &times;
            </button>
          </div>
        </div>
      )}
    </section>
  );
}