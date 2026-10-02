import { useState, useEffect, useMemo } from "react";
import { api } from "../../services/api";
import Modal from "../../components/ui/Modal";
import toast from "react-hot-toast";
import TransactionToolbar from "../../components/transactions/TransactionToolbar";
import TransactionEmpty from "../../components/transactions/TransactionEmpty";
import RequestsTable from "../../components/transactions/RequestsTable";
import { fmtDate } from "../../utils/helpers";
import { REQUEST_STATUS_LABELS, REQUEST_FILTERS } from "../../constants/requests";
import "../../styles/pages/tables.css";
import "../../styles/pages/transactions-browser.css";

const FILTERS = REQUEST_FILTERS;
const DASH = "\u2014";

function RequestDetail({ request, onCancel }) {
  return (
    <div className="txd">
      <section className="txd-section">
        <div className="txd-row">
          <span className="txd-label">Item</span>
          <span className="txd-value">{request.itemName || DASH}</span>
        </div>
        {request.equipment_course && (
          <div className="txd-row">
            <span className="txd-label">Equipment Course</span>
            <span className="txd-value">
              {request.equipment_course}
              {request.equipment_course !== request.course && <span className="tx-course--cross"> (Cross-course)</span>}
            </span>
          </div>
        )}
        {request.assigned_admin_name && (
          <div className="txd-row">
            <span className="txd-label">Assigned Admin</span>
            <span className="txd-value">{request.assigned_admin_name}</span>
          </div>
        )}
        <div className="txd-row">
          <span className="txd-label">Quantity</span>
          <span className="txd-value">{request.quantity ?? 0}</span>
        </div>
        <div className="txd-row">
          <span className="txd-label">Due Date</span>
          <span className="txd-value">{request.dueDate ? fmtDate(request.dueDate) : DASH}</span>
        </div>
        <div className="txd-row">
          <span className="txd-label">Purpose</span>
          <span className="txd-value">{request.purpose || DASH}</span>
        </div>
        <div className="txd-row">
          <span className="txd-label">Status</span>
          <span className="txd-value">{REQUEST_STATUS_LABELS[request.status] || request.status}</span>
        </div>
        {request.reviewerName && (
          <div className="txd-row">
            <span className="txd-label">Reviewed By</span>
            <span className="txd-value">{request.reviewerName}</span>
          </div>
        )}
        {request.reviewNotes && (
          <div className="txd-row">
            <span className="txd-label">Review Notes</span>
            <span className="txd-value">{request.reviewNotes}</span>
          </div>
        )}
      </section>

      {request.status === "pending" && (
        <div className="tx-modal-actions">
          <button className="btn btn-red" onClick={() => onCancel(request.id)}>
            Cancel Request
          </button>
        </div>
      )}
    </div>
  );
}

export default function RequestsPanel() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("list");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await api.getMyBorrowRequests();
        if (cancelled) return;
        setRequests(data || []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to load requests");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function reload() {
    setError(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  }

  async function handleCancel(id) {
    // Destructive and irreversible from the student's side, so it must stay
    // behind a confirmation.
    if (!confirm("Cancel this request?")) return;
    try {
      await api.cancelBorrowRequest(id);
      toast.success("Request cancelled");
      setSelected(null);
      reload();
    } catch (err) {
      toast.error(err.message || "Failed to cancel");
    }
  }

  const filtered = useMemo(
    () => (filter === "all" ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );

  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
      cancelled: requests.filter((r) => r.status === "cancelled").length,
    }),
    [requests],
  );

  if (loading) return <div className="page-loading"><div className="spinner-lg" /></div>;

  if (error) {
    return (
      <section className="transactions-page activity-panel">
        <TransactionEmpty
          mode="requests"
          title="Couldn't load your requests"
          message={error}
          action={
            <button className="btn btn-green" onClick={reload}>
              Retry
            </button>
          }
        />
      </section>
    );
  }

  return (
    <section className="transactions-page activity-panel">
      <TransactionToolbar
        /* Requests have no server-side search or sort, so both sections are
           hidden rather than shipping controls that do nothing. */
        filters={{ search: "", sort: "date-desc" }}
        onFilterChange={() => {}}
        showSearch={false}
        showSort={false}
        tabsLabel="Request status"
        tabs={FILTERS.map((f) => ({
          value: f,
          label: f.charAt(0).toUpperCase() + f.slice(1),
          count: counts[f] ?? 0,
        }))}
        activeTab={filter}
        onTabChange={setFilter}
        resultCount={filtered.length}
        total={requests.length}
        viewMode={viewMode}
        onViewChange={setViewMode}
        viewStorageKey="labtrack-myrequests-view"
      />

      {filtered.length === 0 ? (
        <TransactionEmpty
          mode="requests"
          title="No requests found"
          message={filter === "all" ? "Submit a borrow request from the scanner page." : `You have no ${filter} requests.`}
        />
      ) : (
        <div className="tx-results">
          <RequestsTable requests={filtered} onSelect={setSelected} onView={setSelected} />
        </div>
      )}

      {selected && (
        <Modal title="Request Details" onClose={() => setSelected(null)}>
          <RequestDetail request={selected} onCancel={handleCancel} />
        </Modal>
      )}
    </section>
  );
}