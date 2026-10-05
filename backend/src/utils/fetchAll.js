/**
 * Supabase/PostgREST silently caps a response at `max-rows` (1000 by default),
 * so every unbounded read must be paged out or the result comes back short.
 * Nothing throws when the cap is hit — the query just returns its first 1000
 * rows — which is how a totals query can quietly under-report.
 *
 * `build` is called once per page and must return a fresh PostgREST builder
 * (`.range()` mutates the builder, so the same instance cannot be reused).
 */
const FETCH_BATCH = 1000;
const FETCH_MAX_BATCHES = 200;

async function fetchAll(build) {
  const first = await build().range(0, FETCH_BATCH - 1);
  if (first.error) throw first.error;
  const out = first.data ? [...first.data] : [];
  // If the count header is missing, keep paging until a page comes back empty.
  const total = typeof first.count === "number" ? first.count : Infinity;
  let fetched = out.length;
  for (let i = 1; fetched < total && i < FETCH_MAX_BATCHES; i++) {
    const page = await build().range(fetched, fetched + FETCH_BATCH - 1);
    if (page.error) throw page.error;
    const rows = page.data || [];
    if (rows.length === 0) break;
    out.push(...rows);
    fetched += rows.length;
  }
  return out;
}

/**
 * True when a read came back short of the row count PostgREST reported.
 *
 * `count > rowCount` is the whole test for an unfiltered, unlimited query: the
 * server counted more rows than it sent, so it hit its `max-rows` cap. The cap
 * is a per-project setting and is NOT guaranteed to be 1000, so nothing here may
 * assume a batch size — a lower cap would otherwise pass every row it did return
 * straight through as if it were complete.
 *
 * `count` is null/undefined when the caller did not ask for an exact count, in
 * which case truncation cannot be detected and the caller must page instead.
 */
function isTruncated(count, rowCount) {
  return typeof count === "number" && count > rowCount;
}

module.exports = { fetchAll, isTruncated };