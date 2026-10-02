import { useMemo, useState } from "react";
import { MdPeople, MdCheckCircle, MdRefresh, MdDownload } from "react-icons/md";
import { api } from "../services/api";
import { useBorrowed, useReturned, useTransactionStats } from "../hooks/useQueries";
import useTransactionFilters from "../hooks/useTransactionFilters";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import Modal from "../components/ui/Modal";
import LoadError from "../components/ui/LoadError";
import StatStrip from "../components/ui/StatStrip";
import ExportReportModal from "../components/ui/ExportReportModal";
import { buildExportQuery } from "../components/ui/exportReport";
import TransactionTable from "../components/transactions/TransactionTable";
import TransactionCard from "../components/transactions/TransactionCard";
import TransactionDetail from "../components/transactions/TransactionDetail";
import TransactionToolbar from "../components/transactions/TransactionToolbar";
import TransactionEmpty from "../components/transactions/TransactionEmpty";
import { toTxnView } from "../components/transactions/txnView";
import toast from "react-hot-toast";
import "../styles/pages/tables.css";
import "../styles/pages/transactions-browser.css";

const normalize = (src) => (!src ? [] : Array.isArray(src) ? src : src.data || []);
const toPagination = (src) => (!src || Array.isArray(src) ? null : src.pagination || null);

export default function TransactionsPage() {
  const { filters, params, setPage, setFilters, resetFilters, activeFilterCount } = useTransactionFilters();
  const [tab, setTab] = useState("borrowed");
  const [viewMode, setViewMode] = useState("list");
  const [selected, setSelected] = useState(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const borrowedQ = useBorrowed(params);
  const returnedQ = useReturned(params);

  const borrowed = useMemo(() => normalize(borrowedQ.data), [borrowedQ.data]);
  const returned = useMemo(() => normalize(returnedQ.data), [returnedQ.data]);

  const borrowedPagination = useMemo(() => toPagination(borrowedQ.data), [borrowedQ.data]);
  const returnedPagination = useMemo(() => toPagination(returnedQ.data), [returnedQ.data]);

  const isBorrowedTab = tab === "borrowed";
  const items = isBorrowedTab ? borrowed : returned;
  const pagination = isBorrowedTab ? borrowedPagination : returnedPagination;
  const activeQuery = isBorrowedTab ? borrowedQ : returnedQ;

  // Sorted by the server now (?sort= is in params), so the rows arrive in the
  // requested order across the whole result set rather than just this page.
  const rows = useMemo(() => items.map((item) => toTxnView(item, tab)), [items, tab]);

  const { data: stats } = useTransactionStats();

  const error = activeQuery.isError ? activeQuery.error : null;
  const total = pagination?.total ?? items.length;

  const refresh = () => {
    borrowedQ.refetch();
    returnedQ.refetch();
  };

  const handleExport = async (draft) => {
    setExporting(true);
    try {
      const query = buildExportQuery(draft);
      const qs = Object.entries(query)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("&");
      await api.downloadReport(draft.tab, qs);
      setExportOpen(false);
      toast.success("Report downloaded!");
    } catch (err) {
      toast.error(err.message || "Download failed");
    } finally {
      setExporting(false);
    }
  };

  // isPending (no data at all yet), not isLoading (which keepPreviousData now
  // also reports while merely refetching).
  if (borrowedQ.isPending && returnedQ.isPending) return <LoadingSpinner />;

  if (error && rows.length === 0) {
    return (
      <section className="transactions-page">
        <LoadError message={error?.message || "Couldn't load transactions."} onRetry={refresh} />
      </section>
    );
  }

  const exportFilters = {
    tab,
    course: filters.course,
    year: filters.year,
    dateRange: filters.dateRange,
    dateFrom: filters.customFrom,
    dateTo: filters.customTo,
    search: filters.search,
    sort: filters.sort,
  };

  return (
    <section className="transactions-page">
      <StatStrip
        variant="stack"
        /* These four are deliberately ALL-TIME figures and ignore the filter bar
           below. Do not "unify" them with the tab badges, which count only what
           the table currently shows. See the tabs prop below. */
        items={[
          { label: "Active Borrows", value: stats?.active ?? 0 },
          { label: "Total Borrowed", value: stats?.totalBorrowed ?? 0 },
          { label: "Total Returned", value: stats?.totalReturned ?? 0 },
          { label: "This Week", value: stats?.thisWeek ?? 0 },
        ]}
      />

      <TransactionToolbar
        filters={filters}
        onFilterChange={setFilters}
        activeTab={tab}
        onTabChange={setTab}
        /* Badge counts come from the list endpoints' own pagination.total, not
           from stats. Two reasons stats was wrong:
             - stats.totalBorrowed counts every action="borrowed" row ever,
               including loans already returned, while /transactions/borrowed
               lists only open loans (isOpenBorrow). The badge could read 13
               while the table showed 4.
             - stats ignores the filter bar, so the badge stayed at the global
               number after filtering.
           pagination.total is computed after filtering, so it matches the rows on
           screen exactly. Left undefined while loading rather than defaulted to
           0: the toolbar omits the badge for a non-number, and the page is behind
           <LoadingSpinner /> until a query resolves anyway, so there is no
           window where a wrong or zero count would be visible. */
        tabsLabel="Borrowed or returned"
        tabs={[
          { value: "borrowed", label: "Borrowed", icon: <MdPeople size={15} />, count: borrowedPagination?.total },
          { value: "returned", label: "Returned", icon: <MdCheckCircle size={15} />, count: returnedPagination?.total },
        ]}
        resultCount={rows.length}
        total={total}
        showCourseFilter
        showYearFilter
        showDateFilter
        viewMode={viewMode}
        onViewChange={setViewMode}
        viewStorageKey="labtrack-transactions-view"
        pagination={pagination}
        onPageChange={setPage}
        actions={
          <>
            <button className="btn btn-green" onClick={() => setExportOpen(true)}>
              <MdDownload size={16} /> Report
            </button>
            <button className="btn btn-outline" onClick={refresh} aria-label="Refresh">
              <MdRefresh size={16} /> Refresh
            </button>
          </>
        }
      />

      {rows.length === 0 ? (
        <TransactionEmpty
          mode={tab}
          title={`No ${tab} records found`}
          message={activeFilterCount > 0 ? "No transaction matches the current filters." : `No ${tab} transactions yet.`}
          action={
            activeFilterCount > 0 ? (
              <button className="btn btn-green" onClick={resetFilters}>
                Clear filters
              </button>
            ) : null
          }
        />
      ) : (
        <div className={`tx-results${activeQuery.isFetching ? " tx-results--busy" : ""}`}>
          {viewMode === "grid" ? (
            <div className="tx-grid">
              {rows.map((view) => (
                <TransactionCard key={view.id} view={view} onSelect={setSelected} />
              ))}
            </div>
          ) : (
            <TransactionTable rows={rows} onSelect={setSelected} showReturnedColumn={!isBorrowedTab} />
          )}
        </div>
      )}

      {selected && (
        <Modal title={selected.fullName || "Transaction Details"} onClose={() => setSelected(null)}>
          <TransactionDetail view={selected} />
        </Modal>
      )}

      <ExportReportModal
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        initialFilters={exportFilters}
        onExport={handleExport}
        exporting={exporting}
      />
    </section>
  );
}