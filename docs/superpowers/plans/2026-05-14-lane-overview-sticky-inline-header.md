# Lane Overview — Sticky Inlined Header — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lane overview's header + filter command bar a single sticky region, and replace the big two-tier `LaneDetails` header with a slim one-row inline lane header (icon + name + count).

**Architecture:** In the shared `@teambit/explorer.ui.components-overview` component, wrap the `header` slot + filter command bar in one `position: sticky` container and measure its height into a CSS variable so section headers tuck under the real height. In `lane-overview`, add a small `LaneOverviewHeader` component and pass it as the `header` prop instead of `LaneDetails`.

**Tech Stack:** React + TypeScript + SCSS modules; bit aspects (`bit compile`).

**Spec:** `docs/superpowers/specs/2026-05-14-lane-overview-sticky-inline-header-design.md`

---

## Conventions

- All paths relative to `/Users/luv/bit.dev/code/____bit/`.
- `bit` monorepo — use `bit compile`, not pnpm.
- This is a UI change; no unit-test harness for these components. Verification = `bit compile` + `npm run lint` + manual smoke (Task 3).
- One commit per task. Fix lint inline (repo enforces `consistent-type-imports`).

## File map

| File                                                                | Change                                                                              |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `components/ui/components-overview/components-overview.tsx`         | wrap header+filterpanel in sticky div; measure height → CSS var                     |
| `components/ui/components-overview/components-overview.module.scss` | add `.stickyHeader`; drop sticky from `.commandBar`; `.sectionHeader` top → CSS var |
| `components/ui/lane-overview/lane-overview-header.tsx`              | NEW — slim inline lane header                                                       |
| `components/ui/lane-overview/lane-overview-header.module.scss`      | NEW — its styles                                                                    |
| `components/ui/lane-overview/lane-overview.tsx`                     | swap `LaneDetails` → `LaneOverviewHeader`                                           |

---

## Task 1: Make the shared `ComponentsOverview` header region sticky

**Files:**

- Modify: `components/ui/components-overview/components-overview.tsx`
- Modify: `components/ui/components-overview/components-overview.module.scss`

- [ ] **Step 1: Add `useLayoutEffect` + `useRef` to the React import**

In `components/ui/components-overview/components-overview.tsx`, the first React import line is currently:

```tsx
import React, { useMemo } from 'react';
```

Change it to:

```tsx
import React, { useMemo, useRef, useLayoutEffect } from 'react';
```

- [ ] **Step 2: Add the sticky-height measurement effect**

In `components-overview.tsx`, inside the `ComponentsOverview` function, immediately AFTER the line `const storageKeyPrefix = `${storageNamespace}:`;` add:

```tsx
const containerRef = useRef<HTMLDivElement>(null);
const stickyRef = useRef<HTMLDivElement>(null);

useLayoutEffect(() => {
  const containerEl = containerRef.current;
  const stickyEl = stickyRef.current;
  if (!containerEl || !stickyEl) return undefined;
  const apply = () => {
    containerEl.style.setProperty('--components-overview-sticky-height', `${stickyEl.offsetHeight}px`);
  };
  apply();
  const observer = new ResizeObserver(apply);
  observer.observe(stickyEl);
  return () => observer.disconnect();
}, []);
```

- [ ] **Step 3: Wrap the header + filter panel in the sticky div, attach refs**

In `components-overview.tsx`, the current `return` JSX is:

```tsx
  return (
    <div className={classnames(styles.container, className)}>
      {header}

      <ComponentsOverviewFilterPanel
        aggregation={aggregation}
        onAggregationChange={setAggregation}
        availableAggregations={availableAggregations}
        items={items}
        activeNamespaces={activeNamespaces}
        onNamespacesChange={setActiveNamespaces}
        activeScopes={activeScopes}
        onScopesChange={setActiveScopes}
      />

      <div className={styles.content}>
```

Replace that portion with:

```tsx
  return (
    <div ref={containerRef} className={classnames(styles.container, className)}>
      <div ref={stickyRef} className={styles.stickyHeader}>
        {header}

        <ComponentsOverviewFilterPanel
          aggregation={aggregation}
          onAggregationChange={setAggregation}
          availableAggregations={availableAggregations}
          items={items}
          activeNamespaces={activeNamespaces}
          onNamespacesChange={setActiveNamespaces}
          activeScopes={activeScopes}
          onScopesChange={setActiveScopes}
        />
      </div>

      <div className={styles.content}>
```

(The closing `</div>` for `styles.content` and the outer container stay as they are — you are only adding one wrapper `<div>` around `{header}` + the filter panel, and adding `ref` attributes.)

- [ ] **Step 4: Update the SCSS — add `.stickyHeader`, de-stick `.commandBar`, fix `.sectionHeader`**

In `components/ui/components-overview/components-overview.module.scss`:

**4a.** Add a new `.stickyHeader` rule (place it just before the `/* ---- Command bar ---- */` comment):

```scss
.stickyHeader {
  position: sticky;
  top: 0;
  z-index: $modal-z-index - 1;
  background: color-mix(in srgb, var(--bit-accent-color, #6c5ce7) 3%, var(--background-color, #fff));
  border-bottom: 1px solid var(--border-medium-color);
}
```

**4b.** In the `.commandBar` rule, REMOVE these five lines (`background`, `border-bottom`, `position`, `top`, `z-index`):

```scss
background: color-mix(in srgb, var(--bit-accent-color, #6c5ce7) 3%, var(--background-color, #fff));
border-bottom: 1px solid var(--border-medium-color);
position: sticky;
top: 0;
z-index: $modal-z-index - 1;
```

After removal `.commandBar` should be:

```scss
.commandBar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 40px;
}
```

(The `.stickyHeader` wrapper now owns the background, border, and stickiness. The header row + command bar read as one band.)

**4c.** In the `.sectionHeader` rule, change:

```scss
top: 57px;
```

to:

```scss
top: var(--components-overview-sticky-height, 57px);
```

- [ ] **Step 5: Compile**

```bash
bit compile teambit.explorer/ui/components-overview
```

Expected: succeeds. Fix any lint issues inline.

- [ ] **Step 6: Commit**

```bash
git add components/ui/components-overview
git commit -m "feat(components-overview): make header + filter bar one sticky region"
```

---

## Task 2: Add `LaneOverviewHeader` and wire it into `lane-overview`

**Files:**

- Create: `components/ui/lane-overview/lane-overview-header.tsx`
- Create: `components/ui/lane-overview/lane-overview-header.module.scss`
- Modify: `components/ui/lane-overview/lane-overview.tsx`

- [ ] **Step 1: Create `lane-overview-header.tsx`**

Create `components/ui/lane-overview/lane-overview-header.tsx` with EXACTLY:

```tsx
import React from 'react';
import classnames from 'classnames';
import type { LaneId } from '@teambit/lane-id';
import styles from './lane-overview-header.module.scss';

export type LaneOverviewHeaderProps = {
  laneId: LaneId;
  componentCount?: number;
  className?: string;
};

export function LaneOverviewHeader({ laneId, componentCount, className }: LaneOverviewHeaderProps) {
  const laneName = laneId.isDefault() ? laneId.name : laneId.toString();

  return (
    <div className={classnames(styles.header, className)}>
      <img src="https://static.bit.dev/bit-icons/lane.svg" className={styles.icon} alt="" />
      <span className={styles.name}>{laneName}</span>
      {componentCount !== undefined && (
        <span className={styles.count}>
          {componentCount} {componentCount === 1 ? 'component' : 'components'}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `lane-overview-header.module.scss`**

Create `components/ui/lane-overview/lane-overview-header.module.scss` with EXACTLY:

```scss
.header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 40px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color, #2b2b40);
}

.icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.name {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.count {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--on-background-medium-color, #6c707c);
  background: var(--surface-color, #f5f5f5);
  border-radius: 10px;
  padding: 2px 8px;
  flex-shrink: 0;
}
```

- [ ] **Step 3: Wire it into `lane-overview.tsx`**

In `components/ui/lane-overview/lane-overview.tsx`:

**3a.** Remove the `LaneDetails` import line:

```tsx
import { LaneDetails } from '@teambit/lanes.ui.lane-details';
```

and add in its place:

```tsx
import { LaneOverviewHeader } from './lane-overview-header';
```

**3b.** In `LaneOverviewBody`, replace the `header` prop value. Current:

```tsx
      header={
        <LaneDetails
          className={styles.laneDetails}
          laneId={currentLane.id}
          description=""
          componentCount={currentLane.components.length}
        />
      }
```

Replace with:

```tsx
      header={
        <LaneOverviewHeader
          laneId={currentLane.id}
          componentCount={currentLane.components.length}
        />
      }
```

(If `styles.laneDetails` becomes unused in `lane-overview.module.scss` after this, leave it — removing dead CSS is out of scope; flag it in the report.)

- [ ] **Step 4: Compile**

```bash
bit compile teambit.lanes/ui/lane-overview
```

Expected: succeeds. Fix any lint issues inline (`consistent-type-imports`: `LaneId` is already a type import above).

- [ ] **Step 5: Commit**

```bash
git add components/ui/lane-overview
git commit -m "feat(lane-overview): slim inline lane header replacing LaneDetails"
```

---

## Task 3: Verification

**Files:** none modified.

- [ ] **Step 1: Lint**

```bash
npm run lint 2>&1 | tail -20
```

Fix anything introduced by Tasks 1-2 (distinguish from pre-existing errors). If a fix is needed, commit it: `git commit -m "fix(components-overview): lint"`.

- [ ] **Step 2: Compile both touched components**

```bash
bit compile teambit.explorer/ui/components-overview teambit.lanes/ui/lane-overview
```

Expected: 2/2 compile successfully.

- [ ] **Step 3: Report manual smoke (do NOT run `bit start` — interactive)**

Report to the user that manual smoke is required:

- **Lane overview**: a one-row lane header (lane icon + name + component count) sits directly above the filter command bar; the header + filter bar stay pinned together as one sticky block while the card grid scrolls; namespace/scope section headers tuck under the full sticky region with no overlap and no gap.
- **Workspace overview**: visually unchanged — the sticky region is still just the filter command bar (no header passed), and section headers still tuck under it correctly.

---

## Done criteria

- `ComponentsOverview` renders `header` + filter panel inside one `.stickyHeader` sticky wrapper; section-header offset driven by the measured `--components-overview-sticky-height` CSS var.
- `lane-overview` renders the new slim `LaneOverviewHeader` instead of `LaneDetails`.
- `bit compile` (both components) and `npm run lint` pass.
- Manual smoke confirms sticky behavior + clean inline header on lanes, workspace overview unchanged.
