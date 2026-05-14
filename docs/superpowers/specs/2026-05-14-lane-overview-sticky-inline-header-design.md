# Lane Overview — Sticky Inlined Header — Design

**Date:** 2026-05-14
**Author:** Luv Kapur (with Claude)
**Status:** Approved — proceeding to implementation

## 1. Goal

Two refinements to the lane overview (built on the shared `@teambit/explorer.ui.components-overview` component):

1. **Sticky top region** — the header and the filter command bar should stay pinned together while the card grid scrolls. Currently only the filter command bar is `position: sticky`; the lane header scrolls away.
2. **Inlined, cleaner lane header** — replace the current `LaneDetails` (a big two-tier `ScopeTitle` + a separate `ComponentCount` block) with a single slim row: lane icon + lane name + component count, all inline at one consistent size.

## 2. Scope

### In scope

- `ComponentsOverview` (shared): make the `header` slot + filter command bar a single sticky region; section headers tuck under the real (variable) sticky height.
- `lane-overview`: a new slim inline header component, swapped in for `LaneDetails`.

### Out of scope

- Workspace overview visual changes — it passes no `header`, so its sticky region remains just the command bar (unchanged).
- The card grid, filter logic, aggregation — untouched.

## 3. Changes

### 3.1 `components/ui/components-overview/components-overview.tsx`

- Wrap `{header}` and `<ComponentsOverviewFilterPanel … />` in a single `<div ref={stickyRef} className={styles.stickyHeader}>`.
- Add a `useLayoutEffect` + `ResizeObserver` on `stickyRef` that measures the wrapper's `offsetHeight` and writes it to a CSS custom property `--components-overview-sticky-height` on the root container element. This keeps the section-header offset correct whether or not a `header` is present.

### 3.2 `components/ui/components-overview/components-overview.module.scss`

- New `.stickyHeader` rule: `position: sticky; top: 0; z-index: $modal-z-index - 1;` — owns the tinted background (`color-mix(in srgb, var(--bit-accent-color, #6c5ce7) 3%, var(--background-color, #fff))`) and the bottom border, so the header row and filter row read as one band.
- `.commandBar`: remove `position: sticky; top: 0;` and its `z-index` (the wrapper is now the sticky element); the command bar keeps its own internal styling but no longer sticks independently. Its `border-bottom` becomes the divider between the header row and the filter row.
- `.sectionHeader`: change `top: 57px` → `top: var(--components-overview-sticky-height, 57px)`. The `57px` fallback preserves current behavior before the measurement effect runs / for consumers without a header.

### 3.3 `components/ui/lane-overview/lane-overview-header.tsx` + `.module.scss` (new)

A small presentational component:

```tsx
export type LaneOverviewHeaderProps = {
  laneId: LaneId;
  componentCount?: number;
  className?: string;
};
```

Renders one flex row: lane icon (`https://static.bit.dev/bit-icons/lane.svg`), lane name (`laneId.isDefault() ? laneId.name : laneId.toString()`), and the component count — all at one consistent type size, vertically centered. No `ScopeTitle` / `Subtitle` / `ComponentCount`.

### 3.4 `components/ui/lane-overview/lane-overview.tsx`

- Replace `header={<LaneDetails … />}` with `header={<LaneOverviewHeader laneId={currentLane.id} componentCount={currentLane.components.length} />}`.
- Drop the `LaneDetails` import; add the `LaneOverviewHeader` import.

## 4. Verification

- `bit compile teambit.explorer/ui/components-overview teambit.lanes/ui/lane-overview`.
- `npm run lint`.
- Manual smoke:
  - Lane overview: one-row lane header (icon + name + count) sits above the filter bar; header + filter bar stay pinned as one block while the card grid scrolls; namespace/scope section headers tuck under the full sticky region (no overlap, no gap).
  - Workspace overview: visually unchanged — sticky region is still just the filter command bar.

## 5. Risks

1. `ResizeObserver` availability — it is standard in all browsers bit targets; no polyfill needed.
2. The `--components-overview-sticky-height` measurement runs after first paint; the `57px` fallback in the `.sectionHeader` `top` covers the pre-measurement frame, so there is no visible jump for the common (workspace) case.

## 6. Open questions

None.
