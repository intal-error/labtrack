import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useMyBorrowed, useMyReturned, useMyTransactionStats } from "../../hooks/useQueries";
import useTransactionFilters from "../../hooks/useTransactionFilters";
import Modal from "../../components/ui/Modal";
import LoadError from "../../components/ui/LoadError";
import StatStrip from "../../components/ui/StatStrip";
import TransactionTable from "../../components/transactions/TransactionTable";
import TransactionCard from "../../components/transactions/TransactionCard";
import TransactionDetail from "../../components/transactions/TransactionDetail";
import TransactionToolbar from "../../components/transactions/TransactionToolbar";
import TransactionEmpty from "../../components/transactions/TransactionEmpty";
import { toTxnView } from "../../components/transactions/txnView";
import "../../styles/pages/tables.css";
import "../../styles/pages/transactions-browser.css";

const normalize = (src) => (!src ? [] : Array.isArray(src) ? src : src.data || []);
const toPagination = (src) => (!src || Array.isArray(src) ? null : src.pagination || null);

/**
 * The student's own transactions, shown on MyActivityPage.
 *
 * Renders the same shared table/card/toolbar as the admin page, but with the
 * course/year/date filters omitted: /transactions/my-* only honours search and
 * sort, so showing those controls would be three dead dropdowns.
 */
export default function TransactionsPanel({ mode = "borrowed" }) {
  const [searchParams] = useSearchParams();
  // The header search bar drives ?search=, so mirror it into the filter state.
  const urlSearch = searchParams.get("search") || "";
  const [search, setSearch] = useState(urlSearch);

  const [prevUrlSearch, setPrevUrlSearch] = useState(urlSearch);
  if (prevUrlSearch !== urlSearch) {
    setPrevUrlSearch(urlSearch);
    setSearch(urlSearch);
  }

  const { filters, params, setPage, setFilters, resetFilters, activeFilterCount } = useTransactionFilters({ initialSearch: search });
  const [viewMode, setViewMode] = useState("list");
  const [selected, setSelected] = useState(null);

  // Keep the hook's copy of search aligned with the URL without clobbering typing.
  useEffect(() => {
    if (search !== filters.search) setFilters({ search });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const isBorrowed = mode === "borrowed";
  const borrowedQ = useMyBorrowed(params);
  const returnedQ = useMyReturned(params);
  const activeQuery = isBorrowed ? borrowedQ : returnedQ;

  const items = useMemo(() => normalize(activeQuery.data), [activeQuery.data]);
  const pagination = useMemo(() => toPagination(activeQuery.data), [activeQuery.data]);
  const rows = useMemo(() => items.map((item) => toTxnView(item, mode)), [items, mode]);

  const { data: stats } = useMyTransactionStats();

  const error = activeQuery.isError ? activeQuery.error : null;

  if (borrowedQ.isPending && returnedQ.isPending) return <div className="page-loading"><div className="spinner-lg" /></div>;

  if (error && rows.length === 0) {
    return (
      <section className="transactions-page activity-panel">
        <LoadError message={error?.message || `Couldn't load your ${mode} transactions.`} onRetry={() => activeQuery.refetch()} />
      </section>
    );
  }

  return (
    <section className="transactions-page activity-panel">
      <StatStrip
        variant="stack"
        items={[
          { label: "Active Borrows", value: stats?.activeBorrows ?? 0 },
          { label: "Due Soon", value: stats?.dueSoon ?? 0, tone: (stats?.dueSoon ?? 0) > 0 ? "warn" : "default" },
          { label: "Overdue", value: stats?.overdue ?? 0, tone: (stats?.overdue ?? 0) > 0 ? "alert" : "default" },
          { label: "Total Returned", value: stats?.totalReturned ?? 0 },
        ]}
      />

      <TransactionToolbar
        filters={filters}
        onFilterChange={setFilters}
        resultCount={rows.length}
        total={pagination?.total ?? items.length}
        searchPlaceholder="Search item, course..."
        viewMode={viewMode}
        onViewChange={setViewMode}
        viewStorageKey="labtrack-my-transactions-view"
        pagination={pagination}
        onPageChange={setPage}
      />

      {rows.length === 0 ? (
        <TransactionEmpty
          mode={mode}
          title={`No ${mode} records found`}
          message={activeFilterCount > 0 ? "No transaction matches the current search." : `No ${mode} transactions yet.`}
          action={
            activeFilterCount > 0 ? (
              <button className="btn btn-green" onClick={resetFilters}>
                Clear search
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
            <TransactionTable rows={rows} onSelect={setSelected} showReturnedColumn={!isBorrowed} />
          )}
        </div>
      )}

      {selected && (
        <Modal title="Transaction Details" onClose={() => setSelected(null)}>
          <TransactionDetail view={selected} />
        </Modal>
      )}
    </section>
  );
}