import { useMemo } from "react";
import { MdChevronLeft, MdChevronRight, MdFirstPage, MdLastPage } from "react-icons/md";
import "./pagination.css";

export default function Pagination({ currentPage, totalPages, totalItems, pageSize, onPageChange }) {
  const pageNumbers = useMemo(() => {
    const pages = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("...");

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);

      if (currentPage < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }

    return pages;
  }, [currentPage, totalPages]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);

  if (totalPages <= 1) return null;

  return (
    <div className="pagination">
      <span className="pagination-info">
        Showing {startItem}–{endItem} of {totalItems}
      </span>
      <div className="pagination-controls">
        <button
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
          title="First page"
        >
          <MdFirstPage size={18} />
        </button>
        <button
          className="pagination-btn"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
          title="Previous page"
        >
          <MdChevronLeft size={18} />
        </button>

        {pageNumbers.map((num, i) =>
          num === "..." ? (
            <span key={`ellipsis-${i}`} className="pagination-ellipsis">...</span>
          ) : (
            <button
              key={num}
              className={`pagination-btn pagination-page ${num === currentPage ? "active" : ""}`}
              onClick={() => onPageChange(num)}
            >
              {num}
            </button>
          )
        )}

        <button
          className="pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
          title="Next page"
        >
          <MdChevronRight size={18} />
        </button>
        <button
          className="pagination-btn"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
          title="Last page"
        >
          <MdLastPage size={18} />
        </button>
      </div>
    </div>
  );
}
