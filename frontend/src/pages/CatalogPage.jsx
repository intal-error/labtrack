import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MdAdd, MdDownload, MdWarning } from "react-icons/md";
import { api } from "../services/api";
import { useCatalog, useCatalogStats } from "../hooks/useQueries";
import useCatalogFilters from "../hooks/useCatalogFilters";
import { COURSES } from "../constants/courses";
import { CATALOG_COURSE_UNASSIGNED } from "../constants/catalog";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Modal from "../components/ui/Modal";
import StatStrip from "../components/ui/StatStrip";
import CatalogBrowser from "../components/catalog/CatalogBrowser";
import CatalogItemDrawer from "../components/catalog/CatalogItemDrawer";
import toast from "react-hot-toast";
import "../styles/pages/catalog.css";
import "../styles/pages/catalog-browser.css";
import "../styles/pages/scanner.css";
import "../styles/pages/shared-form-panel.css";
import { useAuth } from "../context/AuthContext";

export default function CatalogPage() {
  const queryClient = useQueryClient();
  const { filters, params, setPage, setFilters, resetFilters, activeFilterCount } = useCatalogFilters();
  const [showCreate, setShowCreate] = useState(false);
  const [showQr, setShowQr] = useState(null);
  const [editing, setEditing] = useState(null);
  const [imageOverlay, setImageOverlay] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [exporting, setExporting] = useState(false);
  const { role, userProfile } = useAuth();
  const [restriction, setRestriction] = useState(null);

  const { data: response, isPending, isFetching } = useCatalog(params);
  const { data: statsData } = useCatalogStats();

  useEffect(() => {
    if (role === "student" && userProfile?.id) {
      api.checkRestriction(userProfile.id).then((d) => setRestriction(d)).catch(() => {});
    }
  }, [role, userProfile]);

  const items = useMemo(() => {
    if (!response) return [];
    return Array.isArray(response) ? response : (response.data || []);
  }, [response]);

  const pagination = useMemo(() => {
    if (!response || Array.isArray(response)) return null;
    return response.pagination || null;
  }, [response]);

  const invalidateCatalog = () => queryClient.invalidateQueries({ queryKey: ["catalog"] });

  const courseOptions = useMemo(() => {
    const options = COURSES.map((c) => ({ value: c, label: c }));
    const seen = new Set(options.map((o) => o.value));
    (statsData?.byCourse || []).forEach((entry) => {
      const name = entry.course;
      // "Unassigned" is appended by CatalogBrowser; anything else that exists
      // in the data but not in COURSES still needs to be selectable.
      if (!name || name === CATALOG_COURSE_UNASSIGNED) return;
      const match = options.find((o) => o.value === name);
      if (match) match.label = `${name} (${entry.total})`;
      else if (!seen.has(name)) {
        seen.add(name);
        options.push({ value: name, label: `${name} (${entry.total})` });
      }
    });
    return options;
  }, [statsData]);

  const handleDelete = async (item) => {
    if (!confirm(`Delete "${item.itemName || "this item"}"?`)) return;
    try {
      await api.deleteCatalogItem(item.id);
      toast.success("Deleted!");
      invalidateCatalog();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleQr = async (item) => {
    try {
      const { dataUrl } = await api.generateQR(`SLSU-TOOL:${item.id}`);
      setShowQr({ name: item.itemName, value: `SLSU-TOOL:${item.id}`, dataUrl });
    } catch {
      toast.error("Failed to generate QR");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.downloadReport("catalog");
      toast.success("Downloaded!");
    } catch {
      toast.error("Failed");
    } finally {
      setExporting(false);
    }
  };

  // isPending, not isLoading: with keepPreviousData the first paint is the
  // only time isLoading and isPending differ, and isPending is the one that
  // means "no data at all yet" rather than "refetching".
  if (isPending) return <LoadingSpinner />;

  const emptyAction =
    activeFilterCount > 0 ? (
      <button className="btn btn-green" onClick={resetFilters}>
        Clear filters
      </button>
    ) : (
      <button className="btn btn-green" onClick={() => setShowCreate(true)}>
        <MdAdd size={16} /> Create Item
      </button>
    );

  return (
    <section className="catalog-page">
      {restriction?.restricted && (
        <div className="catalog-alert">
          <MdWarning size={20} />
          <div>
            <div className="catalog-alert-title">Borrowing Restricted</div>
            <div className="catalog-alert-body">
              {restriction.message || "You have an unpaid fine. Please settle it before borrowing equipment."}
            </div>
          </div>
        </div>
      )}

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
        viewStorageKey="labtrack-catalog-view"
        courseOptions={courseOptions}
        busy={isFetching}
        canManage
        onImageClick={setImageOverlay}
        onEdit={setEditing}
        onDelete={handleDelete}
        onQr={handleQr}
        emptyTitle={activeFilterCount > 0 ? "No matching items" : "No items yet"}
        emptyMessage={activeFilterCount > 0 ? "No catalog item matches the current filters." : "Create the first item to get started."}
        emptyAction={emptyAction}
        actions={
          <>
            <button className="btn btn-green" onClick={() => setShowCreate(true)}>
              <MdAdd size={16} /> Create Item
            </button>
            <button className="btn btn-outline" onClick={handleExport} disabled={exporting}>
              <MdDownload size={16} /> {exporting ? "Preparing..." : "Report"}
            </button>
          </>
        }
      />

      {/* Both drawers stay mounted so the slide-in transition runs; each
          re-seeds its fields when `open` flips or the edited item changes. */}
      <CatalogItemDrawer open={showCreate} mode="create" onClose={() => setShowCreate(false)} />
      <CatalogItemDrawer open={!!editing} mode="update" initial={editing} onClose={() => setEditing(null)} />

      {showQr && (
        <Modal title={showQr.name || "Item QR Code"} onClose={() => setShowQr(null)} wide>
          <div className="qr-canvas">
            <img src={showQr.dataUrl} alt="QR Code" />
          </div>
          <p className="qr-value">{showQr.value}</p>
          <div className="catalog-actions">
            <button className="btn btn-green" onClick={() => window.print()}>
              Print
            </button>
            <button className="btn btn-orange" onClick={() => setShowQr(null)}>
              Close
            </button>
          </div>
        </Modal>
      )}

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