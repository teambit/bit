# Lane Compare Redesign — Port from `ws/new-changes` to `____bit`

**Date:** 2026-05-13
**Author:** Luv Kapur (with Claude)
**Status:** Draft — pending review

## 1. Goal

Port the redesigned lane-compare UI from the `ws/new-changes` workspace into the main `____bit` repo. The new design replaces the previous "two lane columns of drawers" layout with a code-review-style **toolbar + sidebar + diff-pane** layout: view-mode tabs (Code / Preview / Docs / Dependencies / Config / API), group-by (Scope / Namespace / Status), per-component inline compare cards, file-tree sidebar, split/unified diff toggle, multi-component search, and a full-pane API diff mode.

Two hard constraints define success:

- **No drawer** anywhere in the lane-compare chain. The old `LaneCompareDrawer` family is removed; even vestigial drawer state from `ws/new-changes` is stripped.
- **No monaco** anywhere in the lane-compare chain. Diff rendering uses the new non-monaco `inline-diff-viewer` (npm `diff` package).

A follow-up spec will redesign component-compare reusing the same primitives. That is out of scope here.

## 2. Scope

### In scope

1. Replace `components/ui/compare/lane-compare/*` with the ported new design (rewired to `____bit`'s existing data hooks and entity types).
2. Replace `components/ui/compare/lane-compare-page/*` with the ported page.
3. Add shared presentation primitives required by lane-compare into `components/ui/component-compare/component-compare/`:
   `CompareToolbar`, `CompareSidebar`, `FileRegistryProvider` / `useFileRegistry`, `DiffModeProvider` / `useDiffMode`, `InlineComponentCompare`, `ComponentCompareHeader`.
4. Add the new full-pane `ApiDiffFullView` as a new bit component under `components/ui/api-diff-view/`.
5. Add the new non-monaco diff renderer components used as lane-compare tabs:
   - `components/ui/code/inline-diff-viewer`
   - `components/ui/code/inline-code-compare`
   - `components/ui/preview/inline-preview-compare`
   - `components/ui/review/inline-deps-compare`
   - `components/ui/review/inline-tests-compare`
   - `components/ui/review/inline-config-compare`
   - `components/ui/dependencies/deps-diff-table`
   - `components/ui/docs/overview-compare` (reuse existing if present, otherwise port)
6. Rewire `scopes/lanes/lanes/lanes.ui.runtime.tsx#getLaneCompare` to:
   - Build the `tabs: TabItem[]` array locally from the six new `Inline*Compare` components.
   - Stop falling back to `this.componentCompareUI.tabs` (which is monaco-based).
7. Bind UI to `____bit`'s existing data sources:
   - `ChangeType`, `LaneComponentDiff` from `@teambit/lanes.entities.lane-diff` (workspace entity) — drop the `lane-diff-types.ts` from `ws/new-changes`.
   - `useLaneDiffStatus` from `@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status` (unchanged).
   - `useLaneComponents` from `@teambit/lanes.hooks.use-lane-components` (workspace package — not `@teambit/dot-lanes.*`).
   - `useLanes` from `@teambit/lanes.hooks.use-lanes` (unchanged).
8. Fully remove drawer remnants from the ported provider/models/types.

### Out of scope

- Component-compare page redesign — separate follow-up spec.
- Cloud-specific extensions (`dot-cloud`, `dot-lanes` packages).
- Migration of unrelated data models, hooks, or domain logic from `ws/new-changes` beyond the UI presentation layer.

## 3. Architecture

### Components added or replaced

| Path in `____bit`                                                                        | Status                | Source in `ws/new-changes`                                  | Notes                                                                                                                                                        |
| ---------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `components/ui/compare/lane-compare/lane-compare.tsx`                                    | replace               | `lanes/ui/compare/lane-compare/lane-compare.tsx`            | New layout, rewired imports                                                                                                                                  |
| `components/ui/compare/lane-compare/lane-compare.module.scss`                            | replace               | same                                                        | New styles                                                                                                                                                   |
| `components/ui/compare/lane-compare/lane-compare.provider.tsx`                           | edit                  | same                                                        | Strip drawer state                                                                                                                                           |
| `components/ui/compare/lane-compare/lane-compare.models.ts`                              | edit                  | same                                                        | Strip `DrawerWidgetProps`                                                                                                                                    |
| `components/ui/compare/lane-compare/lane-compare.context.ts`                             | edit if needed        | same                                                        | Keep `LaneCompareContextModel` shape                                                                                                                         |
| `components/ui/compare/lane-compare/lane-compare.utils.ts`                               | edit                  | same                                                        | Keep `displayChangeType`, `extractCompsToDiff`, `filterDepKey`                                                                                               |
| `components/ui/compare/lane-compare/index.ts`                                            | edit                  | same                                                        | Drop `lane-diff-types` export; export from `@teambit/lanes.entities.lane-diff` if anything still needs `ChangeType` re-export                                |
| `components/ui/compare/lane-compare-page/lane-compare-page.tsx`                          | replace               | `lanes/ui/compare/lane-compare-page/lane-compare-page.tsx`  | New page layout                                                                                                                                              |
| `components/ui/compare/lane-compare-page/lane-compare-page.module.scss`                  | replace               | same                                                        |                                                                                                                                                              |
| `components/ui/component-compare/component-compare/component-compare.tsx`                | additive edit         | `component/ui/component-compare/component-compare.tsx`      | Append `InlineComponentCompare`, `ComponentCompareHeader`, `EagerFileRegistrar`, `EagerAspectRegistrar`. Leave existing `ComponentCompare` export untouched. |
| `components/ui/component-compare/component-compare/compare-toolbar.tsx` + `.module.scss` | new                   | `component/ui/component-compare/compare-toolbar.{tsx,scss}` |                                                                                                                                                              |
| `components/ui/component-compare/component-compare/compare-sidebar.tsx` + `.module.scss` | new                   | `component/ui/component-compare/compare-sidebar.{tsx,scss}` |                                                                                                                                                              |
| `components/ui/component-compare/component-compare/file-registry.tsx`                    | new                   | same                                                        |                                                                                                                                                              |
| `components/ui/component-compare/component-compare/diff-mode-context.tsx`                | new                   | same                                                        |                                                                                                                                                              |
| `components/ui/component-compare/component-compare/index.ts`                             | edit                  | same                                                        | Re-export new primitives                                                                                                                                     |
| `components/ui/api-diff-view/` (new bit component)                                       | new                   | `semantics/ui/api-diff-view/`                               | Full-pane API diff                                                                                                                                           |
| `components/ui/code/inline-diff-viewer/`                                                 | new                   | `code/ui/inline-diff-viewer/`                               | npm `diff`, no monaco                                                                                                                                        |
| `components/ui/code/inline-code-compare/`                                                | new                   | `code/ui/inline-code-compare/`                              | Uses inline-diff-viewer                                                                                                                                      |
| `components/ui/preview/inline-preview-compare/`                                          | new                   | `preview/ui/inline-preview-compare/`                        |                                                                                                                                                              |
| `components/ui/review/inline-deps-compare/`                                              | new                   | `review/ui/inline-deps-compare/`                            | Uses deps-diff-table                                                                                                                                         |
| `components/ui/review/inline-tests-compare/`                                             | new                   | `review/ui/inline-tests-compare/`                           |                                                                                                                                                              |
| `components/ui/review/inline-config-compare/`                                            | new                   | `review/ui/inline-config-compare/`                          |                                                                                                                                                              |
| `components/ui/dependencies/deps-diff-table/`                                            | new                   | `dependencies/ui/deps-diff-table/`                          |                                                                                                                                                              |
| `components/ui/docs/overview-compare/`                                                   | reuse or new          | `docs/ui/overview-compare/`                                 | Check existing first                                                                                                                                         |
| `scopes/lanes/lanes/lanes.ui.runtime.tsx`                                                | edit `getLaneCompare` | n/a (workspace-side)                                        | Build `tabs` from new `Inline*Compare`; drop fallback to `componentCompareUI.tabs`                                                                           |

### Data flow

```
LaneComparePage
  └── useLanes() ─────────────────────► LanesModel (workspace data)
  └── LaneSelector (base selection)
  └── getLaneCompare({ base, compare, groupBy:'status' })
         │
         ▼
LaneCompare (wrapper)
  ├── LaneCompareProvider
  │     └── useLaneDiffStatus({ base, compare }) ──► LaneDiff / LaneComponentDiff[]
  ├── FileRegistryProvider
  └── LaneCompareInline
        ├── useLaneCompareContext()  ─────────────► laneComponentDiffByCompId, componentsToDiff
        ├── useLaneComponents(compare.id, compare.hash) ─► compositionsMap
        ├── CompareToolbar  (view modes, group-by, diff-mode, search)
        ├── CompareSidebar  (groups, items, files, status)
        └── Diff pane (per groupBy):
              ApiDiffFullView (when viewMode === 'api')
              InlineComponentCompare[] (other modes)
                ├── ComponentCompareHeader
                ├── EagerFileRegistrar  (populates FileRegistry)
                ├── EagerAspectRegistrar
                └── DeferredTab[] from `tabs` prop:
                      ├── InlineCodeCompare (uses inline-diff-viewer; no monaco)
                      ├── InlinePreviewCompare
                      ├── OverviewCompare
                      ├── InlineDepsCompare (uses deps-diff-table)
                      ├── InlineTestsCompare
                      └── InlineConfigCompare
```

URL params synced: `view`, `groupBy`, `diffMode`, `componentId`, `file`.

### Drawer removal — explicit deltas vs `ws/new-changes`

The `ws/new-changes` provider/models still carry vestigial drawer state. The ported version strips:

- `lane-compare.provider.tsx`: `defaultOpenDrawers`, `defaultFullScreen`, `openDrawerList`, `setOpenDrawerList`, `fullScreenDrawerKey`, `setFullScreen`, and the effects that maintain them.
- `lane-compare.models.ts`: `DrawerWidgetProps` type.
- `lane-compare.tsx`: `Drawer`, `DrawerWidgets`, `onFullScreenChanged`, `onDrawerToggled`, `onDrawerVersionChanged` props from `LaneCompareProps`.
- `lane-compare/index.ts`: any re-export of `DrawerWidgetProps`.
- `components/ui/compare/lane-compare/lane-compare.tsx`: remove `import ... from '@teambit/lanes.ui.compare.lane-compare-drawer'` (current `____bit`).

### Monaco removal — explicit deltas

- `scopes/lanes/lanes/lanes.ui.runtime.tsx#getLaneCompare`: replace the body to build `tabs` from the six new `Inline*Compare` components. Do NOT use `this.componentCompareUI.tabs`.
- No file under the new lane-compare chain (see §5 grep targets) imports `monaco-editor`, `@monaco-editor/react`, or any `code-editor` / `code-compare-view` / `code-compare-editor` aspect that wraps Monaco.
- Existing `components/ui/code-editor` and `components/ui/code-compare/{code-compare-view,code-compare-editor}` remain in the repo — they're still used by the (untouched) component-compare page. They are NOT pulled into lane-compare's chain.

## 4. Hook / package bindings

| Imported by new design                                                                                                                                                                                                                                                                           | Bind to in `____bit`                                 | Action                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------ |
| `./lane-diff-types` (`ChangeType`, `LaneComponentDiff`)                                                                                                                                                                                                                                          | `@teambit/lanes.entities.lane-diff`                  | Drop new file; rewrite imports |
| `@teambit/lanes.ui.compare.lane-compare-hooks.use-lane-diff-status`                                                                                                                                                                                                                              | same                                                 | unchanged                      |
| `@teambit/dot-lanes.hooks.use-lane-components`                                                                                                                                                                                                                                                   | `@teambit/lanes.hooks.use-lane-components`           | rewrite path                   |
| `@teambit/lanes.hooks.use-lanes`, `@teambit/lanes.ui.inputs.lane-selector`, `@teambit/lanes.ui.models.lanes-model`                                                                                                                                                                               | same                                                 | unchanged                      |
| `@teambit/component.modules.component-url`                                                                                                                                                                                                                                                       | same (exists under `scopes/component/component-url`) | unchanged                      |
| `@teambit/component.ui.component-compare.context`, `.hooks.use-component-compare`, `.hooks.use-component-compare-url`, `.utils.*`, `.models.*`, `.version-picker`                                                                                                                                | same (exist in `____bit`)                            | unchanged                      |
| `@teambit/components.hooks.use-list-components` (`useGetComponents`), `@teambit/components.legacy.create-component-model` (`createComponentModel`, `getCompositions`), `@teambit/code.ui.queries.get-component-code` (`useCode`), `@teambit/code.ui.queries.get-file-content` (`useFileContent`) | verify presence at implementation time               | flagged risk; fallback below   |

**Fallback for the flagged row:** if `@teambit/components.*` packages aren't present in `____bit`, rewire `InlineContextProvider`, `EagerFileRegistrar`, and the inline-\* tabs to use existing patterns in `____bit`'s current `ComponentCompare` (which builds an equivalent model via `useComponent` + `useComponentCompareQuery`). This means the implementation may need a thin adapter layer; the spec accepts this rather than dictating it.

## 5. Acceptance Criteria

These four gates define "done":

1. **No drawer.** Each of these returns zero matches:
   ```
   grep -ri "Drawer\|drawer" components/ui/compare/lane-compare/
   grep -ri "lane-compare-drawer" components/ components/ui/component-compare/ scopes/lanes/lanes/
   ```
2. **No monaco in lane-compare chain.** Each of these returns zero matches:
   ```
   grep -ri "monaco" \
     components/ui/compare/lane-compare/ \
     components/ui/component-compare/component-compare/{compare-toolbar,compare-sidebar,file-registry,diff-mode-context}.tsx \
     components/ui/code/inline-diff-viewer/ \
     components/ui/code/inline-code-compare/ \
     components/ui/preview/inline-preview-compare/ \
     components/ui/review/inline-{deps,tests,config}-compare/ \
     components/ui/dependencies/deps-diff-table/
   grep -ri "code-editor\|code-compare-view\|code-compare-editor" components/ui/compare/lane-compare/
   ```
   None of the above files import `monaco-editor`, `@monaco-editor/react`, `@teambit/code.code-editor`, `@teambit/code.ui.code-compare-view`, or `@teambit/code.ui.code-compare-editor`.
3. **Tab wiring.** `scopes/lanes/lanes/lanes.ui.runtime.tsx#getLaneCompare` constructs the `tabs` array from the six new `Inline*Compare` components and does not reference `componentCompareUI.tabs` for the lane-compare path.
4. **Manual smoke.** Opening the lane-compare page renders the new toolbar + sidebar + diff layout. Code view renders diffs via `inline-diff-viewer`. DOM inspection shows no Monaco editor element; network panel shows no `monaco-editor` chunks loaded by the lane-compare route. URL params `view`, `groupBy`, `diffMode`, `componentId`, `file` round-trip on reload.

Additionally:

- `npm run lint` passes cleanly for the touched files.
- `bit compile` succeeds for all new/modified components.

## 6. Behavior preserved from `ws/new-changes`

- URL sync (`view`, `groupBy`, `diffMode`, `componentId`, `file`); default values omitted from the URL.
- Auto-switch view-mode if current mode has zero matches.
- Sidebar items show env icon, name, status badge, lazy-expandable file tree with file count.
- `InlineComponentCompare`: IntersectionObserver-based lazy hydration with 400px `rootMargin`; preserved across view-mode switches via `data-view-mode` + `DeferredTab` mutation observer.
- Full-pane API view stays mounted (display: none) when in other modes to preserve Apollo cache.
- Loading skeletons in toolbar, sidebar, diff pane.
- Page-level: hides the surrounding split-pane's first pane (`[class*="collapser"]`) on mount, restores on unmount.

## 7. Risks

1. **Missing package: `@teambit/components.hooks.use-list-components` / `.legacy.create-component-model`.** Fallback: thin adapter using existing `useComponent` + existing `ComponentCompare`'s model-building path. Handle at implementation time.
2. **Split-pane class-name coupling.** The page-level effect targets `[class*="collapser"]` and `[class*="splitPane"]`. If `____bit`'s surrounding layout uses different class names this side-effect silently no-ops. Not fatal; verify during smoke.
3. **SCSS class collisions.** `InlineComponentCompare`, `ComponentCompareHeader`, and existing `ComponentCompare` share `component-compare.module.scss`. Append new classes; rename any collision with an `inline-` prefix.
4. **Inline-\* component depth.** Each inline-\* component may pull its own transitive deps (preview iframe, deps tables) we haven't audited. Vet during implementation and either reuse `____bit` equivalents or port verbatim.

## 8. Testing

- Manual smoke per §5.4.
- `npm run lint` and `bit compile` per §5.
- No new unit/e2e tests in this port. The lane-compare component prop surface is preserved (with drawer props removed), so existing e2e on the lane-compare route should continue to pass.

## 9. Open Questions

None blocking. Risks above are tracked as implementation-time decisions, not design-time.
