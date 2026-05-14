# Lane Overview → Workspace Overview Parity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the lane overview render with the same filter command bar + namespace/scope sections + `HopeComponentCard` grid as the workspace overview, by extracting the data-agnostic pieces of `workspace-overview` into a shared bit component that both consume as thin adapters.

**Architecture:** New bit component `@teambit/explorer.ui.components-overview` owns all data-agnostic UI (filter panel, aggregation, namespace headers, hope card, card overlays, sort/filter utils, types, styles) plus a new orchestrator. `workspace-overview.tsx` and `lane-overview.tsx` become thin adapters that build `{ components, componentDescriptors }` and feed the shared component, injecting `getHref` / `header` / `footer` / `emptyState` / `storageNamespace` as needed.

**Tech Stack:** React + TypeScript + SCSS modules; bit aspects (`bit add`, `bit compile`, `bit install`).

**Spec:** `docs/superpowers/specs/2026-05-14-lane-overview-workspace-overview-parity-design.md`

---

## Conventions

- All paths relative to `/Users/luv/bit.dev/code/____bit/`.
- New bit components are registered with `bit add` (the literal `.bitmap` JSON form is rejected by bit).
- After each task: `bit compile <component-id>` for the touched component(s); if compile fails on import resolution, run `bit install` once and retry.
- One commit per task at the end.
- This is a UI refactor; there is no unit-test harness for these overviews. Verification is `bit compile` + `npm run lint` + manual smoke (Task 4).

## File-by-file map

**New component `components/ui/components-overview/`** (scope `teambit.explorer`, name `ui/components-overview`):

| File                                       | Origin                                      |
| ------------------------------------------ | ------------------------------------------- |
| `components-overview.tsx`                  | NEW — orchestrator                          |
| `components-overview.types.ts`             | moved from `workspace-overview.types.ts`    |
| `components-overview.module.scss`          | moved from `workspace-overview.module.scss` |
| `components-overview-filter-panel.tsx`     | moved from `workspace-filter-panel.tsx`     |
| `use-components-aggregation.ts`            | moved from `use-workspace-aggregation.ts`   |
| `hope-component-card.tsx` + `.module.scss` | moved verbatim (one injection-point edit)   |
| `card-overlays.tsx` + `.module.scss`       | moved verbatim                              |
| `namespace-header.tsx` + `.module.scss`    | moved verbatim                              |
| `use-query-param-with-default.ts`          | moved (one injection-point edit)            |
| `filter-utils.ts`                          | moved verbatim                              |
| `namespace-sort.ts`                        | moved verbatim                              |
| `index.ts`                                 | NEW                                         |

**Dead files NOT moved** (no importers anywhere — verified): `workspace-overview/scope-sort.ts`, `workspace-overview/workspace-overview.sort.ts`, `workspace-overview/link-plugin.ts`. Deleted in Task 2.

**Modified:** `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`, `.../workspace-overview/index.ts`, `components/ui/lane-overview/lane-overview.tsx`.

---

## Task 1: Create the shared `components-overview` component

**Files:**

- Create dir: `components/ui/components-overview/`
- Create: 12 files (see below)
- Modify: `.bitmap` (via `bit add`)

- [ ] **Step 1: Create the directory and copy the data-agnostic files**

```bash
mkdir -p components/ui/components-overview
SRC=scopes/workspace/workspace/ui/workspace/workspace-overview
DST=components/ui/components-overview
cp "$SRC/hope-component-card.tsx"        "$DST/hope-component-card.tsx"
cp "$SRC/hope-component-card.module.scss" "$DST/hope-component-card.module.scss"
cp "$SRC/card-overlays.tsx"              "$DST/card-overlays.tsx"
cp "$SRC/card-overlays.module.scss"      "$DST/card-overlays.module.scss"
cp "$SRC/namespace-header.tsx"           "$DST/namespace-header.tsx"
cp "$SRC/namespace-header.module.scss"   "$DST/namespace-header.module.scss"
cp "$SRC/filter-utils.ts"                "$DST/filter-utils.ts"
cp "$SRC/namespace-sort.ts"              "$DST/namespace-sort.ts"
cp "$SRC/use-query-param-with-default.ts" "$DST/use-query-param-with-default.ts"
cp "$SRC/workspace-overview.types.ts"    "$DST/components-overview.types.ts"
cp "$SRC/workspace-overview.module.scss" "$DST/components-overview.module.scss"
cp "$SRC/workspace-filter-panel.tsx"     "$DST/components-overview-filter-panel.tsx"
cp "$SRC/use-workspace-aggregation.ts"   "$DST/use-components-aggregation.ts"
```

- [ ] **Step 2: Fix relative imports in the renamed files**

In `components/ui/components-overview/`, three source filenames changed (`workspace-overview.types` → `components-overview.types`, `workspace-overview.module.scss` → `components-overview.module.scss`, `workspace-filter-panel` → `components-overview-filter-panel`). Update every relative import that references the old names:

```bash
cd components/ui/components-overview
sed -i.bak -E "s|'\./workspace-overview\.types'|'./components-overview.types'|g" \
  namespace-header.tsx components-overview-filter-panel.tsx filter-utils.ts use-components-aggregation.ts namespace-sort.ts
sed -i.bak -E "s|'\./workspace-overview\.module\.scss'|'./components-overview.module.scss'|g" \
  components-overview-filter-panel.tsx
rm -f *.bak
cd - >/dev/null
```

Then verify no stale path references remain:

```bash
grep -rn "'\./workspace-overview" components/ui/components-overview/ || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 3: Rename the moved files' exported symbols**

Two moved files keep their original `Workspace*` export names; rename them to match the new component:

```bash
cd components/ui/components-overview
# aggregation hook
sed -i.bak -E "s/useWorkspaceAggregation/useComponentsAggregation/g" use-components-aggregation.ts
# filter panel component + its props type
sed -i.bak -E "s/WorkspaceFilterPanelProps/ComponentsOverviewFilterPanelProps/g; s/WorkspaceFilterPanel/ComponentsOverviewFilterPanel/g" components-overview-filter-panel.tsx
rm -f *.bak
cd - >/dev/null
```

(`WorkspaceItem` and the other type names in `components-overview.types.ts` are intentionally left as-is — they are internal and renaming them ripples needlessly.)

- [ ] **Step 4: Add the `storageKeyPrefix` injection point to `use-query-param-with-default.ts`**

Edit `components/ui/components-overview/use-query-param-with-default.ts`. Replace the hardcoded module-level constant and thread a prefix parameter through both hooks.

Replace:

```ts
const STORAGE_KEY_PREFIX = 'workspace-overview:';
```

with:

```ts
const DEFAULT_STORAGE_KEY_PREFIX = 'components-overview:';
```

In `useQueryParamWithDefault`, change the signature and `storageKey`:

```ts
export function useQueryParamWithDefault<T extends string>(
  paramName: string,
  fallback: T,
  options: QueryParamOptions & { storageKeyPrefix?: string } = {}
): [T, (value: T | null) => void] {
  const { persist = true, storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = storageKeyPrefix + paramName;
```

In `useListParamWithDefault`, the same:

```ts
export function useListParamWithDefault(
  paramName: string,
  options: QueryParamOptions & { storageKeyPrefix?: string } = {}
): [string[], (values: string[]) => void] {
  const { persist = false, storageKeyPrefix = DEFAULT_STORAGE_KEY_PREFIX } = options;
  const [searchParams, setSearchParams] = useSearchParams();
  const storageKey = storageKeyPrefix + paramName;
```

Leave the rest of the file (the `useMemo`/`useCallback` bodies, the `safeGetItem`/`safeSetItem`/`safeRemoveItem` helpers) unchanged.

- [ ] **Step 5: Add the `getHref` injection point to `hope-component-card.tsx`**

Edit `components/ui/components-overview/hope-component-card.tsx`.

Add `getHref` to the props type:

```ts
export type HopeComponentCardProps = {
  component: ComponentModel;
  componentDescriptor: ComponentDescriptor;
  scope?: { id: ScopeID; icon?: string; backgroundIconColor?: string };
  showPreview?: boolean;
  getHref?: (component: ComponentModel) => string;
};
```

Destructure it in the function signature:

```ts
export function HopeComponentCard({
  component,
  componentDescriptor,
  scope,
  showPreview: showPreviewProp,
  getHref,
}: HopeComponentCardProps) {
```

Replace the hardcoded `href` line:

```ts
const href = `${component.id.fullName}?scope=${component.id.scope}`;
```

with:

```ts
const href = getHref ? getHref(component) : `${component.id.fullName}?scope=${component.id.scope}`;
```

- [ ] **Step 6: Create the orchestrator `components-overview.tsx`**

Create `components/ui/components-overview/components-overview.tsx`:

```tsx
import type { ReactNode } from 'react';
import React, { useMemo } from 'react';
import classnames from 'classnames';
import { ComponentGrid } from '@teambit/explorer.ui.gallery.component-grid';
import compact from 'lodash.compact';
import { ScopeID } from '@teambit/scopes.scope-id';
import { useCloudScopes } from '@teambit/cloud.hooks.use-cloud-scopes';
import type { ComponentModel } from '@teambit/component';
import type { ComponentDescriptor } from '@teambit/component-descriptor';
import { useComponentsAggregation } from './use-components-aggregation';
import { useQueryParamWithDefault, useListParamWithDefault } from './use-query-param-with-default';
import { NamespaceHeader } from './namespace-header';
import { HopeComponentCard } from './hope-component-card';
import type { AggregationType, WorkspaceItem } from './components-overview.types';
import { ComponentsOverviewFilterPanel } from './components-overview-filter-panel';
import styles from './components-overview.module.scss';

export type ComponentsOverviewProps = {
  components: ComponentModel[];
  componentDescriptors: ComponentDescriptor[];
  /** link target for a card. Default: `${id.fullName}?scope=${id.scope}` */
  getHref?: (component: ComponentModel) => string;
  /** rendered above the filter command bar */
  header?: ReactNode;
  /** rendered inside the content container, after the sections */
  footer?: ReactNode;
  /** rendered when the filtered set is empty */
  emptyState?: ReactNode;
  /** localStorage key prefix for persisted filter/aggregation prefs */
  storageNamespace?: string;
  /** forwarded to HopeComponentCard */
  showPreview?: boolean;
  className?: string;
};

export function ComponentsOverview({
  components,
  componentDescriptors,
  getHref,
  header,
  footer,
  emptyState,
  storageNamespace = 'components-overview',
  showPreview,
  className,
}: ComponentsOverviewProps) {
  const storageKeyPrefix = `${storageNamespace}:`;

  const uniqueScopes = useMemo(() => [...new Set(components.map((c) => c.id.scope))], [components]);
  const { cloudScopes } = useCloudScopes(uniqueScopes);
  const cloudMap = useMemo(() => new Map((cloudScopes || []).map((s) => [s.id.toString(), s])), [cloudScopes]);
  const compDescriptorMap = useMemo(
    () => new Map(componentDescriptors.map((d) => [d.id.toString(), d])),
    [componentDescriptors]
  );

  const items: WorkspaceItem[] = useMemo(
    () =>
      compact(
        components.map((component) => {
          if (component.deprecation?.isDeprecate) return null;
          const descriptor = compDescriptorMap.get(component.id.toString());
          if (!descriptor) return null;
          const cloudScope = cloudMap.get(component.id.scope);
          const scope =
            cloudScope ||
            (ScopeID.isValid(component.id.scope) && { id: ScopeID.fromString(component.id.scope) }) ||
            undefined;
          return {
            component,
            componentDescriptor: descriptor,
            scope: scope
              ? {
                  id: scope.id,
                  icon: (scope as any).icon,
                  backgroundIconColor: (scope as any).backgroundIconColor,
                }
              : undefined,
          };
        })
      ),
    [components, compDescriptorMap, cloudMap]
  );

  const [aggregation, setAggregation] = useQueryParamWithDefault<AggregationType>('aggregation', 'namespaces', {
    storageKeyPrefix,
  });
  const [activeNamespaces, setActiveNamespaces] = useListParamWithDefault('ns', { storageKeyPrefix });
  const [activeScopes, setActiveScopes] = useListParamWithDefault('scopes', { storageKeyPrefix });

  const filters = useMemo(
    () => ({ namespaces: activeNamespaces, scopes: activeScopes, statuses: new Set() as any }),
    [activeNamespaces, activeScopes]
  );

  const { groups, groupType, availableAggregations, filteredCount } = useComponentsAggregation(
    items,
    aggregation,
    filters
  );

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
        {filteredCount === 0 && emptyState}

        {groups.map((group) => (
          <section key={group.name} className={styles.section}>
            {groupType !== 'none' && (
              <div className={styles.sectionHeader}>
                <NamespaceHeader
                  namespace={group.name}
                  items={group.items}
                  scopeIcon={group.scopeIcon}
                  scopeIconColor={group.scopeIconColor}
                />
              </div>
            )}

            <ComponentGrid className={styles.cardGrid}>
              {group.items.map((item) => (
                <HopeComponentCard
                  key={item.component.id.toString()}
                  component={item.component}
                  componentDescriptor={item.componentDescriptor}
                  scope={item.scope as any}
                  showPreview={showPreview}
                  getHref={getHref}
                />
              ))}
            </ComponentGrid>
          </section>
        ))}

        {footer}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Create `index.ts`**

Create `components/ui/components-overview/index.ts`:

```ts
export { ComponentsOverview } from './components-overview';
export type { ComponentsOverviewProps } from './components-overview';
export { HopeComponentCard } from './hope-component-card';
export type { HopeComponentCardProps } from './hope-component-card';
export { NamespaceHeader } from './namespace-header';
export { ComponentsOverviewFilterPanel } from './components-overview-filter-panel';
export { useComponentsAggregation } from './use-components-aggregation';
export { useQueryParamWithDefault, useListParamWithDefault } from './use-query-param-with-default';
export type {
  WorkspaceItem,
  AggregationType,
  AggregationGroup,
  AggregationResult,
  ComponentStatus,
  Density,
} from './components-overview.types';
```

- [ ] **Step 8: Register and compile**

```bash
bit add components/ui/components-overview --id ui/components-overview --scope teambit.explorer
bit install && bit compile teambit.explorer/ui/components-overview
ls node_modules/@teambit/explorer.ui.components-overview/dist/index.js
```

Expected: compiles; `dist/index.js` exists. If imports like `@teambit/explorer.ui.gallery.component-grid`, `lodash.compact`, `@teambit/cloud.hooks.use-cloud-scopes`, `@teambit/scopes.scope-id`, `@teambit/component.filters.base-filter`, `@teambit/design.inputs.toggle-button`, `@teambit/workspace.ui.load-preview`, `@teambit/preview.ui.preview-placeholder` fail to resolve, run `bit install` and retry (they are all already used by the original workspace-overview, so they exist in the workspace).

Fix any lint issues inline (e.g. `consistent-type-imports`).

- [ ] **Step 9: Commit**

```bash
git add components/ui/components-overview .bitmap workspace.jsonc pnpm-lock.yaml 2>/dev/null
git commit -m "feat(components-overview): extract shared overview from workspace-overview"
```

---

## Task 2: Refactor `workspace-overview.tsx` into an adapter, delete moved/dead files

**Files:**

- Modify: `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx`
- Modify: `scopes/workspace/workspace/ui/workspace/workspace-overview/index.ts`
- Delete: 16 files from `scopes/workspace/workspace/ui/workspace/workspace-overview/`

- [ ] **Step 1: Replace `workspace-overview.tsx` with the adapter**

Overwrite `scopes/workspace/workspace/ui/workspace/workspace-overview/workspace-overview.tsx` with:

```tsx
import React, { useContext } from 'react';
import { EmptyWorkspace } from '@teambit/workspace.ui.empty-workspace';
import { useWorkspaceMode } from '@teambit/workspace.ui.use-workspace-mode';
import { ComponentsOverview } from '@teambit/explorer.ui.components-overview';
import { WorkspaceContext } from '../workspace-context';

export function WorkspaceOverview() {
  const workspace = useContext(WorkspaceContext);
  const { components, componentDescriptors } = workspace;
  const { isMinimal } = useWorkspaceMode();

  if (!components.length) return <EmptyWorkspace name={workspace.name} />;

  return (
    <ComponentsOverview
      components={components}
      componentDescriptors={componentDescriptors}
      showPreview={isMinimal}
      storageNamespace="workspace-overview"
      emptyState={<EmptyWorkspace name={workspace.name} />}
    />
  );
}
```

- [ ] **Step 2: Replace `workspace-overview/index.ts`**

Overwrite `scopes/workspace/workspace/ui/workspace/workspace-overview/index.ts` with:

```ts
export { WorkspaceOverview } from './workspace-overview';
export { useQueryParamWithDefault, useListParamWithDefault } from '@teambit/explorer.ui.components-overview';
```

- [ ] **Step 3: Delete the moved and dead files**

```bash
cd scopes/workspace/workspace/ui/workspace/workspace-overview
rm -f hope-component-card.tsx hope-component-card.module.scss \
      card-overlays.tsx card-overlays.module.scss \
      namespace-header.tsx namespace-header.module.scss \
      filter-utils.ts namespace-sort.ts use-query-param-with-default.ts \
      workspace-overview.types.ts workspace-overview.module.scss \
      workspace-filter-panel.tsx use-workspace-aggregation.ts \
      scope-sort.ts workspace-overview.sort.ts link-plugin.ts
cd - >/dev/null
ls scopes/workspace/workspace/ui/workspace/workspace-overview/
```

Expected remaining files: `index.ts`, `workspace-overview.tsx`.

- [ ] **Step 4: Compile the workspace aspect**

```bash
bit compile teambit.workspace/workspace
```

Expected: succeeds. If a deleted file is still referenced somewhere in the `workspace` aspect, the error will name it — fix that importer to use `@teambit/explorer.ui.components-overview` instead.

- [ ] **Step 5: Commit**

```bash
git add scopes/workspace/workspace/ui/workspace/workspace-overview
git commit -m "refactor(workspace-overview): consume shared components-overview component"
```

---

## Task 3: Refactor `lane-overview.tsx` into an adapter

**Files:**

- Modify: `components/ui/lane-overview/lane-overview.tsx`

- [ ] **Step 1: Replace `lane-overview.tsx` with the adapter**

Overwrite `components/ui/lane-overview/lane-overview.tsx` with:

```tsx
import type { ComponentType } from 'react';
import React, { useMemo } from 'react';
import type { LaneModel, LanesHost } from '@teambit/lanes.ui.models.lanes-model';
import { LanesModel } from '@teambit/lanes.ui.models.lanes-model';
import { SlotRouter } from '@teambit/ui-foundation.ui.react-router.slot-router';
import type { RouteSlot } from '@teambit/ui-foundation.ui.react-router.slot-router';
import { useLanes as defaultUseLanes } from '@teambit/lanes.hooks.use-lanes';
import { useLaneComponents } from '@teambit/lanes.hooks.use-lane-components';
import flatten from 'lodash.flatten';
import type { SlotRegistry } from '@teambit/harmony';
import type { ComponentModel } from '@teambit/component';
import { LaneDetails } from '@teambit/lanes.ui.lane-details';
import { ComponentsOverview } from '@teambit/explorer.ui.components-overview';
import { EmptyLaneOverview } from './empty-lane-overview';

import styles from './lane-overview.module.scss';

export type LaneOverviewLine = ComponentType;
export type LaneOverviewLineSlot = SlotRegistry<LaneOverviewLine[]>;

export type LaneOverviewProps = {
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
  host: LanesHost;
  useLanes?: () => { lanesModel?: LanesModel; loading?: boolean };
};

export function LaneOverview({
  routeSlot,
  overviewSlot,
  host,
  useLanes: useLanesFromProps = defaultUseLanes,
}: LaneOverviewProps) {
  const { lanesModel } = useLanesFromProps();
  const viewedLane = lanesModel?.viewedLane;

  if (!viewedLane || !viewedLane.id) return null;
  if (viewedLane.components.length === 0) return <EmptyLaneOverview name={viewedLane.id.name} />;

  return <LaneOverviewBody currentLane={viewedLane} host={host} routeSlot={routeSlot} overviewSlot={overviewSlot} />;
}

type LaneOverviewBodyProps = {
  currentLane: LaneModel;
  host: LanesHost;
  routeSlot: RouteSlot;
  overviewSlot?: LaneOverviewLineSlot;
};

function LaneOverviewBody({ currentLane, host, routeSlot, overviewSlot }: LaneOverviewBodyProps) {
  const { loading, components, componentDescriptors } = useLaneComponents(currentLane.id);
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);

  if (loading) return null;

  const getHref = (component: ComponentModel) => LanesModel.getLaneComponentUrl(component.id, currentLane.id);

  return (
    <ComponentsOverview
      className={styles.container}
      components={components ?? []}
      componentDescriptors={componentDescriptors ?? []}
      getHref={getHref}
      storageNamespace="lane-overview"
      header={
        <LaneDetails
          className={styles.laneDetails}
          laneId={currentLane.id}
          description=""
          componentCount={currentLane.components.length}
        />
      }
      footer={
        <>
          {routeSlot && <SlotRouter slot={routeSlot} />}
          {overviewItems.map((Item, index) => (
            <Item key={index} />
          ))}
        </>
      }
      emptyState={<EmptyLaneOverview name={currentLane.id.name} />}
    />
  );
}
```

Notes:

- `host` is retained on `LaneOverviewProps` (callers in `lanes.ui.runtime.tsx` still pass it) but is no longer used to switch card types — only `getHref` differs, and it does not need `host`. Keep the param to avoid changing the caller; if lint flags it as unused, prefix the destructured name with `_` (`host: _host`).
- `LaneOverviewLine` / `LaneOverviewLineSlot` exports are unchanged — `lanes.ui.runtime.tsx` imports them.
- `LinkPlugin` and `useCardPlugins` are removed (verified: no external importers).

- [ ] **Step 2: Verify `index.ts` still matches**

`components/ui/lane-overview/index.ts` currently is:

```ts
export { LaneOverviewProps, LaneOverview, LaneOverviewLine, LaneOverviewLineSlot } from './lane-overview';
export { EmptyLaneOverview, EmptyLaneOverviewProps } from './empty-lane-overview';
```

All four names from `./lane-overview` still exist after the rewrite — no change needed. Confirm by reading the file.

- [ ] **Step 3: Compile**

```bash
bit install && bit compile teambit.lanes/ui/lane-overview
```

Expected: succeeds. Fix any lint issues inline.

- [ ] **Step 4: Commit**

```bash
git add components/ui/lane-overview workspace.jsonc pnpm-lock.yaml 2>/dev/null
git commit -m "refactor(lane-overview): consume shared components-overview component"
```

---

## Task 4: Full verification

**Files:** none modified (verification only)

- [ ] **Step 1: Lint**

```bash
npm run lint 2>&1 | tail -40
```

Distinguish errors introduced by this change from pre-existing ones (the lane-compare port left some known pre-existing TS issues elsewhere). Fix anything introduced by Tasks 1-3. If a fix is needed, make it, then re-commit with `git commit -m "fix(components-overview): lint"`.

- [ ] **Step 2: Full compile**

```bash
bit compile teambit.explorer/ui/components-overview teambit.workspace/workspace teambit.lanes/ui/lane-overview
```

Expected: 3/3 compile successfully.

- [ ] **Step 3: Confirm no stale references**

```bash
grep -rn "use-workspace-aggregation\|workspace-filter-panel\|workspace-overview.types\|workspace-overview.module" scopes/ components/ --include=*.ts --include=*.tsx 2>/dev/null | grep -v node_modules || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 4: Manual smoke (report, do not run `bit start` — it is interactive)**

Report to the user that manual smoke is required:

- **Workspace overview**: filter command bar, namespace/scope aggregation toggle, preview behavior, and persisted prefs all still work; layout visually unchanged.
- **Lane overview**: now shows the filter command bar + namespace sections + `HopeComponentCard` grid; the `LaneDetails` header renders above it; lane component card links navigate to lane-component URLs (`~lane/.../~component/...`); `routeSlot` / `overviewSlot` extension content still renders below the grid; an empty lane still shows `EmptyLaneOverview`.

- [ ] **Step 5: Final commit (if Step 1 required fixes and they were not yet committed)**

Otherwise nothing to commit — the plan is complete.

---

## Done criteria

- New `@teambit/explorer.ui.components-overview` component exists, compiles, and is registered in `.bitmap`.
- `workspace-overview.tsx` and `lane-overview.tsx` are thin adapters; the 16 moved/dead files are deleted from `workspace-overview/`.
- `npm run lint` and `bit compile` (all three components) pass.
- Manual smoke confirms workspace overview unchanged and lane overview at parity.
