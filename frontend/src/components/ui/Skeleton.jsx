import "./skeleton.css";

/**
 * Loading placeholder.
 *
 * WHY THIS EXISTS: the app had LoadingSpinner, EmptyState, ErrorState and LoadError,
 * and a grep for "skeleton" across every stylesheet returned zero matches. So every
 * cold load replaced the content with a centred spinner, which communicates "there is
 * nothing here yet" rather than "the shape of what is coming". A skeleton preserves
 * the layout, so the page does not reflow when data lands -- and it removes the
 * layout-collapse jump that a full-height spinner causes on every route change.
 *
 * It also helps perceived performance on the exact screens this app spends its time
 * on: a 50-row attendance table, a 25-row transactions table, a KPI strip.
 *
 * aria-busy rather than role="status": the region announces itself as loading without
 * interrupting a screen reader mid-sentence on every refresh.
 */

// The shimmer is a transform, so it composites on the GPU and costs no layout or
// paint. `prefers-reduced-motion` disables it in skeleton.css.
export function Skeleton({ variant = "text", width, height, className = "" }) {
  const style = {};
  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height) style.height = typeof height === "number" ? `${height}px` : height;

  return (
    <span
      className={`skeleton skeleton-${variant} ${className}`.trim()}
      style={style}
      aria-hidden="true"
    />
  );
}

/** A table body placeholder: `rows` shimmering rows matching the real column count. */
export function SkeletonRows({ rows = 6, columns = 4 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        // Row index is the correct key here: these rows are positional placeholders
        // that never reorder and carry no identity of their own.
        <tr key={rowIndex} className="skeleton-row" aria-hidden="true">
          {Array.from({ length: columns }).map((__, colIndex) => (
            <td key={colIndex}>
              {/* Varying the widths makes it read as content rather than a grid. */}
              <Skeleton variant="text" width={`${55 + ((rowIndex * 7 + colIndex * 13) % 40)}%`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** A KPI/stat tile placeholder, matching StatStrip's shape. */
export function SkeletonTiles({ count = 4 }) {
  return (
    <div className="skeleton-tiles" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="skeleton-tile" key={i}>
          <Skeleton variant="text" width="48%" height={20} />
          <Skeleton variant="text" width="70%" />
        </div>
      ))}
    </div>
  );
}

/**
 * Wraps a region that is loading, so callers get the aria wiring in one place.
 *
 * `label` is announced instead of a bare "Loading" so a screen-reader user knows
 * what is loading.
 */
export function SkeletonRegion({ label = "Loading", children, className = "" }) {
  return (
    <div className={`skeleton-region ${className}`.trim()} role="status" aria-busy="true" aria-label={label}>
      {children}
    </div>
  );
}

export default Skeleton;