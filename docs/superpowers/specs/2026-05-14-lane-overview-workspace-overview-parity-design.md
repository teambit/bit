# Lane Overview → Workspace Overview Parity — Design

**Date:** 2026-05-14
**Author:** Luv Kapur (with Claude)
**Status:** Approved — proceeding to implementation

## 1. Goal

Make the lane overview look and behave exactly like the workspace overview (the recent "hope" components-grid redesign): a filter command bar (namespace/scope filters + aggregation toggle), namespace/scope section headers, and `HopeComponentCard` grid — but populated with lane components instead of workspace components.

Achieve this by **extracting** the data-source-agnostic pieces of `workspace-overview` into a new shared bit component that both the workspace overview and the lane overview consume as thin data adapters.

## 2. Scope

### In scope

1. Create a new shared bit component `@teambit/explorer.ui.components-overview` at `components/ui/components-overview/`.
2. Move the data-agnostic pieces out of `scopes/workspace/workspace/ui/workspace/workspace-overview/` into it.
3. Refactor `workspace-overview.tsx` into a thin adapter over the new component.
4. Refactor `components/ui/lane-overview/lane-overview.tsx` into a thin adapter over the new component.
5. Add a `getHref` injection point to `HopeComponentCard` so lane components link to lane-component URLs.

### Out of scope

- Changing the visual design of the workspace overview (parity is the target, not redesign).
- The `scope-overview` (`scopes/scope/scope/ui/scope-overview/`) — it has its own card/plugin system and is not part of this migration.
- Build-status data sourcing (`building`/`queued` states) — `getComponentStatus` keeps deriving from existing fields, same as workspace-overview today.

## 3. The new shared component

**Package:** `@teambit/explorer.ui.components-overview`
**Location:** `components/ui/components-overview/`
**Scope:** `teambit.explorer` (domain-neutral; `ComponentGrid` already lives under `@teambit/explorer.ui.gallery.*`)

### Files moved in (from `workspace-overview/`)

| Source file                                                        | Destination                            |
| ------------------------------------------------------------------ | -------------------------------------- |
| `hope-component-card.tsx` + `.module.scss`                         | same names                             |
| `card-overlays.tsx` + `.module.scss`                               | same names                             |
| `namespace-header.tsx` + `.module.scss`                            | same names                             |
| `workspace-filter-panel.tsx`                                       | `components-overview-filter-panel.tsx` |
| `use-workspace-aggregation.ts`                                     | `use-components-aggregation.ts`        |
| `use-query-param-with-default.ts`                                  | same name                              |
| `filter-utils.ts`                                                  | same name                              |
| `namespace-sort.ts`, `scope-sort.ts`, `workspace-overview.sort.ts` | same names                             |
| `workspace-overview.types.ts`                                      | `components-overview.types.ts`         |
| `workspace-overview.module.scss`                                   | `components-overview.module.scss`      |

### New file

`components-overview.tsx` — the orchestrator. Owns: `useCloudScopes` scope-enrichment, building `WorkspaceItem[]`, deprecation filtering, aggregation, filter panel, namespace sections, card grid.

### Public API

```tsx
export type ComponentsOverviewProps = {
  components: ComponentModel[];
  componentDescriptors: ComponentDescriptor[];
  /** link target for a card. Default: workspace-style `${id.fullName}?scope=${id.scope}` */
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
```

### Internal changes to moved files

- **`hope-component-card.tsx`**: replace the hardcoded `href` with a `getHref?: (component: ComponentModel) => string` prop; default preserves today's `${component.id.fullName}?scope=${component.id.scope}`.
- **`use-query-param-with-default.ts`**: the hardcoded `STORAGE_KEY_PREFIX = 'workspace-overview:'` becomes a parameter. `useQueryParamWithDefault` / `useListParamWithDefault` gain a `storageKeyPrefix` argument (or read it from a small context the orchestrator provides). The orchestrator threads `storageNamespace` through.
- All intra-directory relative imports updated to the new filenames.
- The `index.ts` of the new component exports `ComponentsOverview`, `ComponentsOverviewProps`, and the still-useful primitives (`HopeComponentCard`, `NamespaceHeader`, types) for any future consumer.

## 4. `workspace-overview.tsx` adapter

```tsx
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

- No `getHref` → default workspace-style links, unchanged.
- `storageNamespace="workspace-overview"` preserves the exact existing localStorage prefix → persisted user prefs survive.
- `scopes/workspace/workspace/ui/workspace/workspace-overview/index.ts` re-exports `useQueryParamWithDefault` / `useListParamWithDefault` from `@teambit/explorer.ui.components-overview` (no current external importers, but kept for safety).
- All other files in the `workspace-overview/` directory are deleted (moved).

## 5. `lane-overview.tsx` adapter

```tsx
export function LaneOverview({ routeSlot, overviewSlot, host, useLanes = defaultUseLanes }: LaneOverviewProps) {
  const { lanesModel } = useLanes();
  const viewedLane = lanesModel?.viewedLane;
  if (!viewedLane?.id) return null;
  if (viewedLane.components.length === 0) return <EmptyLaneOverview name={viewedLane.id.name} />;
  return <LaneOverviewBody currentLane={viewedLane} host={host} routeSlot={routeSlot} overviewSlot={overviewSlot} />;
}

function LaneOverviewBody({ currentLane, host, routeSlot, overviewSlot }) {
  const { loading, components, componentDescriptors } = useLaneComponents(currentLane.id);
  const overviewItems = useMemo(() => flatten(overviewSlot?.values()), [overviewSlot]);
  if (loading) return null;
  const getHref = (component: ComponentModel) => LanesModel.getLaneComponentUrl(component.id, currentLane.id);
  return (
    <ComponentsOverview
      components={components ?? []}
      componentDescriptors={componentDescriptors ?? []}
      getHref={getHref}
      storageNamespace="lane-overview"
      header={<LaneDetails laneId={currentLane.id} description="" componentCount={currentLane.components.length} />}
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

### Removed from `lane-overview.tsx`

- The `WorkspaceComponentCard` / `ScopeComponentCard` branching on `host`.
- `useCardPlugins`, `LinkPlugin` (no external importers — verified).
- Imports of `ComponentGrid`, `ScopeComponentCard`, `WorkspaceComponentCard`, `PreviewPlaceholder`, `Tooltip`, `ComponentCardPluginType`, `ScopeID`, `useCloudScopes` — all now handled inside the shared component.

`host` is retained on `LaneOverviewProps` (callers still pass it) and now feeds only the `getHref` derivation. `LaneOverviewLine` / `LaneOverviewLineSlot` exports are unchanged.

## 6. Behavior changes (intentional)

1. **Deprecation filtering**: the shared component always skips `component.deprecation?.isDeprecate` (matching workspace-overview). The old lane-overview only skipped deprecated components in workspace-host; scope-host showed them. New behavior is consistent across both hosts.
2. **Card type**: the lane overview now always renders `HopeComponentCard` instead of the host-specific `WorkspaceComponentCard` / `ScopeComponentCard`.
3. **Filter / aggregation UI**: the lane overview gains the namespace/scope filter command bar and aggregation toggle it previously lacked.

## 7. Risks

1. **Refactoring the freshly-built workspace-overview** carries regression risk for the workspace view. Mitigation: the moved files are copied verbatim (only relative-import paths and the two injection points change); `workspace-overview.tsx` keeps identical inputs and the same `storageNamespace`.
2. **`LanesModel.getLaneComponentUrl` signature** — verify it accepts `(componentId, laneId)` as the old `LinkPlugin` used it.
3. **`useLaneComponents` shape** — the lane adapter relies on `{ loading, components, componentDescriptors }`; confirmed present in `@teambit/lanes.hooks.use-lane-components`.
4. **Bit component registration** — the new component must be registered with `bit add` (the literal `.bitmap` JSON form is rejected; established during the lane-compare port).

## 8. Testing

No unit tests exist for either overview; this is a UI refactor. Verification:

- `bit compile` for the new component, the `workspace` aspect, and the `lane-overview` component.
- `npm run lint`.
- Manual smoke:
  - Workspace overview: filter/aggregation/preview still work; persisted prefs intact; layout unchanged.
  - Lane overview: filter command bar + namespace sections + hope cards render; lane component links navigate to lane-component URLs; `routeSlot` / `overviewSlot` extensions still render below the grid; empty lane still shows `EmptyLaneOverview`.

## 9. Open questions

None blocking. Risks above are implementation-time verifications.
