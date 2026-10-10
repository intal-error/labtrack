import { useMemo, useState } from "react";
import { MdPeople, MdSearch, MdRefresh } from "react-icons/md";
import { useStudents, useCourseOptions } from "../hooks/useQueries";
import { useAuth } from "../context/AuthContext";
import LoadingSpinner from "../components/ui/LoadingSpinner";
import LoadError from "../components/ui/LoadError";
import "../styles/pages/tables.css";
import "../styles/pages/students.css";

/*
 * The student roster.
 *
 * SCOPING IS SERVER-SIDE. This page never filters by course itself: the backend
 * derives the caller's course from their profile and ignores any ?course= for
 * anything but a Super Admin. Filtering here as well would be a second, divergent
 * copy of the rule -- and the interesting failure of that is not a leak but an
 * empty page: a Course Admin who typed a course into the filter would see nothing
 * and conclude the roster is empty, rather than that the filter does not apply to
 * them. So the control is shown to the Super Admin only.
 *
 * Borrow counts come from the same response (one batched query per page on the
 * server) rather than a per-student request, which is what made this a single
 * round trip instead of one per row.
 */
export default function StudentsPage() {
  const { isSuperAdmin, courseName, courseId } = useAuth();

  const [search, setSearch] = useState("");
  const [courseFilter, setCourseFilter] = useState("");
  const [page, setPage] = useState(1);

  const limit = 25;
  const { options: courseOptions } = useCourseOptions();

  // Scoped to the caller's course server-side; `course` only narrows for a Super
  // Admin. Kept out of the key when empty so it does not create a second cache
  // entry for "no filter".
  const params = useMemo(
    () => ({
      page: String(page),
      limit: String(limit),
      ...(search.trim() ? { search: search.trim() } : {}),
      ...(isSuperAdmin && courseFilter ? { course: courseFilter } : {}),
    }),
    [page, search, courseFilter, isSuperAdmin]
  );

  const query = useStudents(params);

  const rows = useMemo(() => {
    const d = query.data;
    if (!d) return [];
    return Array.isArray(d) ? d : d.data || [];
  }, [query.data]);

  const pagination = useMemo(() => {
    const d = query.data;
    if (!d || Array.isArray(d)) return null;
    return d.pagination || null;
  }, [query.data]);

  const total = pagination?.total ?? rows.length;
  const totalPages = pagination?.totalPages ?? 1;

  const scopeLabel = isSuperAdmin
    ? courseFilter
      ? courseOptions.find((c) => c.value === courseFilter)?.label || courseFilter
      : "All courses"
    : courseName || courseId || "your course";

  return (
    <div className="students-page">
      <div className="students-head">
        <div>
          <h1 className="students-title">Students</h1>
          <p className="students-sub">
            {isSuperAdmin
              ? `${total} student${total === 1 ? "" : "s"} across all courses`
              : `${total} student${total === 1 ? "" : "s"} in ${scopeLabel}`}
          </p>
        </div>
        <div className="students-head-actions">
          <button
            className="btn btn-outline"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
            aria-label="Refresh"
          >
            <MdRefresh size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="students-toolbar">
        <div className="students-search">
          <MdSearch size={16} />
          <input
            type="search"
            placeholder="Search name or student ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {isSuperAdmin && (
          <select
            className="students-course-filter"
            value={courseFilter}
            onChange={(e) => {
              setCourseFilter(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by course"
          >
            <option value="">All courses</option>
            {courseOptions.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {query.isLoading ? (
        <LoadingSpinner />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        <div className="students-empty">
          <MdPeople size={32} />
          <h3>{search || courseFilter ? "No students match" : "No students yet"}</h3>
          <p>
            {search || courseFilter
              ? "Try a different search or clear the filter."
              : "Students appear here once they register."}
          </p>
        </div>
      ) : (
        <>
          <div className="students-table-wrapper">
            <table className="students-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Student ID</th>
                  <th>Course</th>
                  <th>Year</th>
                  <th>Section</th>
                  <th>Open Loans</th>
                  <th>Returns</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="students-name">
                        {s.profileURL ? (
                          <img src={s.profileURL} alt="" className="students-avatar" />
                        ) : (
                          <span className="students-avatar">
                            {(s.firstName?.[0] || "").toUpperCase()}
                            {(s.lastName?.[0] || "").toUpperCase()}
                          </span>
                        )}
                        <span>
                          {s.firstName} {s.lastName}
                        </span>
                      </div>
                    </td>
                    <td className="students-mono">{s.schoolId || "—"}</td>
                    <td>{s.course || "—"}</td>
                    <td>{s.year || "—"}</td>
                    <td>{s.section || "—"}</td>
                    <td>{s.openBorrows}</td>
                    <td>{s.totalReturns}</td>
                    <td>
                      <span className={`status-badge ${s.status === "active" ? "active" : "inactive"}`}>
                        {s.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="students-pagination">
              <button
                className="btn btn-outline"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="students-page-info">
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}