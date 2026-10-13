/*
 * A block-level empty state.
 *
 * THIS USED TO RENDER A `<tr>`, which put a table row outside any table. Its only
 * consumer renders it where the roster would have been -- AdminPage, next to a grid or
 * a table that is not rendered at all when the list is empty -- so React logged
 *
 *   validateDOMNesting(...): <tr> cannot appear as a child of <div>
 *
 * on every mount, for every user, and the browser reparents the row. It is surfaced now
 * because a test that renders AdminPage before `getAdmins()` resolves trips it, but it
 * was in the app throughout.
 *
 * A `<div>` is also what the stylesheet already expected: global.css styles
 * `.empty-state` as a centred, padded block, which is a block element and not a table
 * cell. Nothing had to change in the CSS to make this correct.
 *
 * The `colSpan` prop is gone because it only ever applied to the `<td>`. Pass no
 * column count: this is no longer a row.
 */
export default function EmptyState({ message = "No data found" }) {
  return <div className="empty-state">{message}</div>;
}