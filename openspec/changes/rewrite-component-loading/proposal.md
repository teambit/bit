## Why

The current component loading mechanism has accumulated significant complexity that makes it slow, hard to understand, and difficult to debug. Loading paths jump between legacy `ConsumerComponent` code (under `components/legacy/consumer-component/`) and the harmony `WorkspaceComponent` wrapper (under `scopes/workspace/workspace/`), passing through **at least 11 distinct in-memory and filesystem caches** with different keys, lifetimes, and invalidation rules. Commands such as `bit status` and `bit install` eagerly load all workspace components even when only a subset is needed, and consumers (CLI, UI) get **no per-component progress signal** because each layer hides its own phases — a single `setStatusLine("loading N components")` is the only feedback during work that can take many seconds.

## What Changes

- **BREAKING** Introduce a single unified `ComponentLoader` service that replaces today's split between `WorkspaceComponentLoader` (`scopes/workspace/workspace/workspace-component/workspace-component-loader.ts`), legacy `ComponentLoader` (`components/legacy/consumer-component/component-loader.ts`), and `ScopeComponentLoader` (`scopes/scope/scope/scope-component-loader.ts`). The new loader exposes a small, explicit API: `get`, `getMany`, `list`, `listIds`, `invalidate`.
- Replace eager full-component loading with **staged, lazy hydration**. A component is loaded in well-defined phases (`identity` → `files` → `dependencies` → `extensions` → `aspects`), and callers declare the phase they need. Most commands need only `identity` or `dependencies`, not `aspects`.
- **BREAKING** Consolidate the 11+ caches behind a single `ComponentCache` abstraction with one keying scheme (`ComponentID + phase + content-hash`) and explicit invalidation contract. Remove duplicate caches: `componentLoadedSelfAsAspects` (duplicated on `Workspace` and `WorkspaceComponentLoader`), separate `componentsCache`/`scopeComponentsCache`, the per-options key permutations.
- Eliminate the legacy/harmony round-trip. Instead of loading `ConsumerComponent` then converting to `WorkspaceComponent`, build the harmony `Component` directly from on-disk artifacts; legacy `ConsumerComponent` is produced as a derived view only when a legacy consumer requests it.
- Add a **progress observability contract**: the loader emits typed phase events (`load:start`, `load:phase`, `load:component`, `load:end`) with component ID and timing. CLI and UI subscribe to render progress; `BIT_LOG=load` profiles individual phases.
- Remove implicit auto-import side effects from the load path. Importing missing components becomes an explicit caller responsibility (commands that need it call `scope.import` first).
- Pre-fetch dependency resolution data only when the `dependencies` phase is requested; status/listing commands stop paying that cost.

## Capabilities

### New Capabilities

- `component-loading`: Unified, phased component loading API, cache contract, legacy-to-harmony unification, and progress event stream.

### Modified Capabilities

<!-- None — no existing specs in openspec/specs/ -->

## Impact

- **Code (highest churn)**:
  - `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts` — replaced
  - `components/legacy/consumer-component/component-loader.ts` — demoted to a thin "legacy view" adapter
  - `scopes/scope/scope/scope-component-loader.ts` — folded into unified loader
  - `scopes/workspace/workspace/workspace.ts` — `get`/`getMany`/`list` methods rewired
  - `scopes/component/status/status.main.runtime.ts` — switch to phased load (no full hydration)
  - `scopes/workspace/workspace/workspace-aspects-loader.ts` — re-routed through unified loader
  - All ~40 CLI commands that call `workspace.get/getMany/list` continue to work but the default load phase changes (commands that need full hydration must opt in).
- **Public API**:
  - `Workspace.get(id, legacyComponent?, useCache?, storeInCache?, loadOpts?)` — `loadOpts` reshaped into a `phase` enum + `consistency` option. Old positional args removed.
  - New `Workspace.loadEvents` event emitter on the workspace.
- **Performance** — target: `bit status` on a 500-component workspace drops from current full-load cost (multi-second) to sub-second by skipping the `extensions`/`aspects` phases. `bit list` becomes ID-only.
- **Caches** — on-disk cache layout under `.bit/cache/` changes; a one-time migration discards old entries on first run after upgrade.
- **Aspects/extensions** — third-party aspects calling `workspace.get(id)` keep working but receive a component at the default phase; aspects depending on extensions data must request the `extensions` phase explicitly.
- **Tests** — e2e suites covering status, install, compile, tag, snap, export must be re-run; unit tests for the three deleted loaders are removed and replaced with unit tests for the unified loader.
