/**
 * CatalogBrowser -- render + re-render behaviour.
 *
 * WHY THIS FILE EXISTS: the results body was split out of the browser shell into a
 * memoized `CatalogResults` so that typing in the search box (whose value is controlled
 * from the page above) no longer reconciles 25 rows per keystroke. That split moved a
 * conditional chain -- skeleton / empty / results -- across a component boundary, and a
 * structural mistake there would compile cleanly and then render the wrong thing: an
 * empty state where rows belong, or a skeleton that never clears.
 *
 * So the three states are asserted explicitly, plus the property the split exists for.
 */

import { describe, expect, it, vi } from "vitest";
import { useMemo, useState } from "react";
import { render, screen, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import useCatalogFilters from "../src/hooks/useCatalogFilters";

/*
 * Wrapped so the per-cell work can be counted. The implementations are kept as-is
 * (the module is spread through from importActual) -- only the call count is wanted,
 * never a stubbed value that would change what renders.
 */
vi.mock("../src/utils/helpers", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAvailableQuantity: vi.fn(actual.getAvailableQuantity),
    conditionClass: vi.fn(actual.conditionClass),
    fmtDate: vi.fn(actual.fmtDate),
  };
});

const { getAvailableQuantity, conditionClass } = await import("../src/utils/helpers");
const { default: CatalogBrowser } = await import("../src/components/catalog/CatalogBrowser");

const NOOP = () => {};

const FILTERS = { search: "", course: "all", status: "all", category: "all", condition: "all", sort: "name" };

const ITEMS = [
  { id: "a", itemName: "Compound Microscope", category: "Optics", course: "BSIT", condition: "Good", status: "Available", quantity: 5, availableQuantity: 3 },
  { id: "b", itemName: "Digital Multimeter", category: "Electrical", course: "BSIT", condition: "Fair", status: "Borrowed", quantity: 10, availableQuantity: 8 },
];

function renderBrowser(props = {}) {
  return render(
    <CatalogBrowser
      items={ITEMS}
      pagination={{ page: 1, limit: 25, total: 2, totalPages: 1 }}
      filters={FILTERS}
      onFilterChange={NOOP}
      onPageChange={NOOP}
      viewMode="list"
      onViewChange={NOOP}
      viewStorageKey="test-catalog-view"
      {...props}
    />
  );
}

describe("CatalogBrowser: the three result states", () => {
  it("renders the rows when there is data", () => {
    renderBrowser();
    expect(screen.getByText("Compound Microscope")).toBeInTheDocument();
    expect(screen.getByText("Digital Multimeter")).toBeInTheDocument();
    expect(screen.queryByText("No items found")).toBeNull();
  });

  it("renders the empty state when there is no data and nothing is loading", () => {
    renderBrowser({ items: [] });
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("renders a skeleton -- not the empty state -- on a first load", () => {
    // The regression this guards: `loading` was previously collapsed into the page's
    // early `return <LoadingSpinner/>`, which took the toolbar with it. Now the
    // toolbar paints immediately and only the rows wait.
    renderBrowser({ items: [], loading: true });

    expect(screen.queryByText("No items found")).toBeNull();
    expect(screen.getByRole("status", { name: /loading catalog items/i })).toBeInTheDocument();
    // The toolbar is present and interactive while the rows are still loading.
    expect(screen.getByLabelText("Search catalog")).toBeInTheDocument();
  });

  it("renders the grid cards in grid view", () => {
    renderBrowser({ viewMode: "grid" });
    expect(screen.getByText("Compound Microscope")).toBeInTheDocument();
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("shows the empty state again once a loading first load resolves empty", () => {
    const { rerender } = renderBrowser({ items: [], loading: true });
    expect(screen.queryByText("No items found")).toBeNull();

    rerender(
      <CatalogBrowser
        items={[]}
        pagination={null}
        filters={FILTERS}
        onFilterChange={NOOP}
        onPageChange={NOOP}
        viewMode="list"
        onViewChange={NOOP}
        viewStorageKey="test-catalog-view"
        loading={false}
      />
    );
    expect(screen.getByText("No items found")).toBeInTheDocument();
  });
});

describe("CatalogBrowser: the toolbar is not gated on the rows", () => {
  it("keeps the filters and the create/report actions usable during a first load", () => {
    renderBrowser({
      items: [],
      loading: true,
      actions: <button type="button">Create Item</button>,
    });

    expect(screen.getByLabelText("Search catalog")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /course/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: /status/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Item" })).toBeInTheDocument();
  });

  it("reports search edits upward", async () => {
    const user = userEvent.setup();
    const onFilterChange = vi.fn();
    renderBrowser({ onFilterChange });

    await user.type(screen.getByLabelText("Search catalog"), "micro");
    expect(onFilterChange).toHaveBeenCalledTimes(5);
    expect(onFilterChange).toHaveBeenLastCalledWith({ search: "o" });
  });
});

describe("CatalogBrowser: the per-row menu", () => {
  it("opens, and closes on Escape", async () => {
    // Escape is the ONLY dismissal available to a keyboard user once focus is inside
    // the menu, so losing this handler turns the admin catalog's main work surface into
    // a keyboard trap. It survived the component split once already by accident.
    const user = userEvent.setup();
    renderBrowser({ canManage: true });

    const trigger = screen.getByRole("button", { name: /actions for compound microscope/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("closes on an outside click", async () => {
    const user = userEvent.setup();
    renderBrowser({ canManage: true });

    const trigger = screen.getByRole("button", { name: /actions for compound microscope/i });
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByLabelText("Search catalog"));
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });

  it("is absent for a read-only (student) browser", () => {
    renderBrowser();
    expect(screen.queryByRole("button", { name: /actions for/i })).toBeNull();
  });
});

describe("CatalogBrowser: typing does not re-render the rows", () => {
  it("recomputes no row cells while the user types", async () => {
    // WHY A CALL COUNT AND NOT A DOM ASSERTION.
    //
    // The obvious check -- "the <tr> node is the same object afterwards" -- proves
    // nothing. React reconciles by key, so it reuses the existing DOM node whether or
    // not the component re-rendered; the output is byte-identical either way, so
    // there is no DOM difference to observe.
    //
    // What actually costs anything is the work inside the rows: each row calls
    // getAvailableQuantity (which scans the borrow records), conditionClass and
    // fmtDate. On a phone that is 25 rows x 3 helpers x every keystroke, on a
    // keystroke that has not even issued a request yet because of the 300 ms debounce.
    // So count the calls. That is the thing the split exists to avoid, and it is
    // directly observable.
    const user = userEvent.setup();

    function Harness() {
      const [filters, setFilters] = useState(FILTERS);

      // Mirrors CatalogPage/InventoryPage EXACTLY: a COUNT, not the raw search string,
      // is what emptyAction depends on, so it changes once (0 -> 1) and then settles.
      //
      // An earlier version of this test omitted `emptyAction` entirely, which hid the
      // fact that the real pages' memo depended on an unstable `resetFilters` -- so the
      // row memo did nothing in the app while this test still passed.
      const activeFilterCount = filters.search.trim() ? 1 : 0;
      const emptyAction = useMemo(
        () =>
          activeFilterCount > 0 ? (
            <button type="button">Clear filters</button>
          ) : (
            <button type="button">Create Item</button>
          ),
        [activeFilterCount]
      );

      return (
        <CatalogBrowser
          items={ITEMS}
          pagination={{ page: 1, limit: 25, total: 2, totalPages: 1 }}
          filters={filters}
          onFilterChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
          onPageChange={NOOP}
          viewMode="list"
          onViewChange={NOOP}
          viewStorageKey="test-catalog-view"
          emptyAction={emptyAction}
        />
      );
    }

    render(<Harness />);
    getAvailableQuantity.mockClear();
    conditionClass.mockClear();

    await user.type(screen.getByLabelText("Search catalog"), "xyzzy");

    /*
     * The rows may be reconciled ONCE -- on the first keystroke, when activeFilterCount
     * goes 0 -> 1 and emptyAction legitimately changes. What must not happen is a
     * reconcile PER KEYSTROKE, which is what an unstable resetFilters caused: the
     * emptyAction memo missed every render, so 5 keystrokes x 2 rows = 10 calls.
     *
     * So the bound is "at most one pass over the rows", not "never".
     */
    expect(getAvailableQuantity.mock.calls.length).toBeLessThanOrEqual(ITEMS.length);
    expect(conditionClass.mock.calls.length).toBeLessThanOrEqual(ITEMS.length * 2);
  });

it("THE REGRESSION: the real filter hook does not defeat the row memo", async () => {
    // The test above uses a LOCAL emptyAction memo, so it could not catch the bug it
    // was written for: `useCatalogFilters().resetFilters` was a plain function, hence a
    // fresh identity every render, so the pages' `useMemo(emptyAction, [activeFilterCount,
    // resetFilters])` missed on every render and CatalogResults' shallow compare missed
    // with it. The row memo did nothing in the real app while this file was green.
    //
    // This wires the ACTUAL hook into the ACTUAL memo shape the two pages use.
    const user = userEvent.setup();

    function RealWiring() {
      const { filters, setFilters, resetFilters, activeFilterCount } = useCatalogFilters();

      const emptyAction = useMemo(
        () =>
          activeFilterCount > 0 ? (
            <button type="button" onClick={resetFilters}>
              Clear filters
            </button>
          ) : (
            <button type="button">Create Item</button>
          ),
        [activeFilterCount, resetFilters]
      );

      return (
        <CatalogBrowser
          items={ITEMS}
          pagination={{ page: 1, limit: 25, total: 2, totalPages: 1 }}
          filters={filters}
          onFilterChange={setFilters}
          onPageChange={NOOP}
          viewMode="list"
          onViewChange={NOOP}
          viewStorageKey="test-catalog-view-real"
          emptyAction={emptyAction}
        />
      );
    }

    render(
      <MemoryRouter>
        <RealWiring />
      </MemoryRouter>
    );

    getAvailableQuantity.mockClear();

    await user.type(screen.getByLabelText("Search catalog"), "xyzzy");

    // One legitimate reconcile on the first keystroke (the filter count goes 0 -> 1).
    // A per-keystroke reconcile would be ITEMS.length x keystrokes.
    expect(getAvailableQuantity.mock.calls.length).toBeLessThanOrEqual(ITEMS.length);
  });

  it("and the hook itself hands back a stable resetFilters", () => {
    // The invariant underneath the assertion above, stated directly so a regression
    // names its own cause instead of only showing up as a render-count failure.
    const { result, rerender } = renderHook(() => useCatalogFilters(), {
      wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
    });

    const first = result.current.resetFilters;
    rerender();
    rerender();
    expect(result.current.resetFilters).toBe(first);

    // setFilters, the sibling the search input calls on every keystroke, is stable too.
    const setFiltersRef = result.current.setFilters;
    rerender();
    expect(result.current.setFilters).toBe(setFiltersRef);
  });
});