import { useMemo, useState } from "react";
import { useCatalog, useCatalogStats } from "../hooks/useQueries";
import useCatalogFilters from "../hooks/useCatalogFilters";
import LoadingSpinner from "../components/ui/LoadingSpinner";
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

  if (isPending) return <LoadingSpinner />;

  return (
    <section className="catalog-page">
      <StatStrip
        variant="stack"
        items={[
          { label: "Total Items", value: statsData?.total ?? 0 },
          { label: "Available", value: statsData?.available ?? 0 },
          { label: "Borrowed", value: statsData?.borrowed ?? 0 },
          { label: "Total Quantity", value: statsData?.totalQuantity ?? 0 },
        ]}
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
        busy={isFetching}
        onImageClick={setImageOverlay}
        emptyTitle={activeFilterCount > 0 ? "No matching items" : "Nothing available yet"}
        emptyMessage={
          activeFilterCount > 0 ? "No catalog item matches the current filters." : "Check back later for new equipment."
        }
        emptyAction={
          activeFilterCount > 0 ? (
            <button className="btn btn-green" onClick={resetFilters}>
              Clear filters
            </button>
          ) : null
        }
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