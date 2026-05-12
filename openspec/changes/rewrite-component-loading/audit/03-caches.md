# Audit 1.3 — Cache inventory

**Goal:** for each cache touched by the loading pipeline, document where reads happen, where writes happen, what triggers invalidation, and how the new `ComponentCache` will absorb (or replace) it.

## In-memory caches

### 1. `WorkspaceComponentLoader.componentsCache` — `InMemoryCache<Component>`

- File: `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:90`
- Init: line 113, `maxSize: getMaxSizeForComponents()`
- **Key shape:** `createComponentCacheKey(id, loadOpts)` — ID + serialized load options. Same ID with different options ⇒ different entries (cache-key explosion).
- **Reads:** line 867 (with two-key fallback for default opts).
- **Writes:** line 848 in the main store path.
- **Invalidations:** `deleteAll` line 767 inside `clearAllComponentsCache`; per-id via `Workspace.clearComponentCache` (line 776 enumerates all four caches together).
- **Replaced by:** unified `ComponentCache` keyed by `(id, phase)`. The loadOpts permutation problem disappears because phase enum has 5 values, not 2^N.

### 2. `WorkspaceComponentLoader.scopeComponentsCache` — `InMemoryCache<Component>`

- Same file, line 94 (init line 114).
- **Purpose:** holds the scope-side view of a component used during workspace load (extension origin tracing).
- **Reads:** line 496 (`!has`), 793 (`get`), 511 (fallback in extensions cache miss).
- **Writes:** line 501.
- **Invalidations:** `deleteAll` at line 768.
- **Replaced by:** the scope-side load is just a phase-`identity`-or-`files` invocation of the unified loader on the scope, sharing the `ComponentCache`.

### 3. `WorkspaceComponentLoader.componentsExtensionsCache` — `InMemoryCache<{ extensions, errors, envId }>`

- Same file, line 99 (init line 115).
- **Reads:** lines 230, 248, 362, 510, 800 — many sites because extension resolution is shared across loaders.
- **Writes:** line 520.
- **Invalidations:** `deleteAll` line 769.
- **Replaced by:** the `extensions` phase entry of the unified `ComponentCache`. The `errors` and `envId` become structured fields on the `extensions`-phase data.

### 4. `WorkspaceComponentLoader.componentLoadedSelfAsAspects` — `InMemoryCache<boolean>`

- Same file, line 105 (init line 116).
- **Purpose:** prevents loading the same component twice as an aspect (avoids re-entrant loop).
- **Reads/Writes:** lines 457, 470, 475, 479.
- **Invalidations:** `deleteAll` line 770.
- **Replaced by:** integrated into the `aspects` phase entry. If `cache.has(id, 'aspects')` then we've loaded it as aspect — no separate boolean map needed.

### 5. `Workspace.componentLoadedSelfAsAspects` — `InMemoryCache<boolean>` **(duplicate of #4)**

- File: `scopes/workspace/workspace/workspace.ts:194` (init line 267).
- **Reads/Writes:** lines 762, 777, 790, 794.
- **Replaced by:** removed entirely (task 9.2). It's a duplicate of #4 with the same purpose.

### 6. Legacy `ComponentLoader.componentsCache` — `InMemoryCache<Component>` (legacy `Component`)

- File: `components/legacy/consumer-component/component-loader.ts:53` (init line 63).
- **Purpose:** caches `ConsumerComponent` instances built from disk.
- **Reads:** line 141.
- **Writes:** line 168.
- **Invalidations:** `deleteAll` line 79; per-id `delete` line 86.
- **Replaced by:** vanishes when the legacy/harmony bridge collapses. The legacy view is derived on demand from a harmony `Component` (no separate cache).

### 7. Legacy `ComponentLoader.cacheResolvedDependencies` — plain `Record<string, any>`

- Same file, lines 43, 56, 61, 80, 240.
- **Purpose:** AST/dep-resolution memoization passed into the dependency resolver.
- **Reads/Writes:** internal to the legacy dep-extraction pipeline.
- **Invalidations:** zeroed at line 80 alongside `componentsCache.deleteAll`.
- **Replaced by:** the dep-extraction routines move under the unified loader's `dependencies` phase; the cache becomes a phase-local memoization owned by that phase computation.

### 8. Legacy `ComponentLoader.componentFsCache` — `FsCache` **(filesystem-backed)**

- Same file, line 58 (init line 62, basePath = `<scope>/.bit/cache/`).
- **Purpose:** persists dependency-resolution data across runs (the only cache that survives process boundaries).
- **Reads:** lines 101, 286.
- **Invalidations:** `deleteAllDependenciesDataCache` (line 113, currently commented out at one site).
- **Replaced by:** retained as-is for the `dependencies` phase. It's the only persistent cache and worth keeping. The new loader treats it as the on-disk artifact of the `dependencies` phase computation.

### 9. `ScopeComponentLoader.componentsCache` — `InMemoryCache<Component>`

- File: `scopes/scope/scope/scope-component-loader.ts:15` (init line 21).
- **Reads:** line 167.
- **Writes:** line 80.
- **Invalidations:** `deleteAll` line 155.
- **Replaced by:** unified `ComponentCache`, scope-side entries.

### 10. `ScopeComponentLoader.importedComponentsCache` — `InMemoryCache<boolean>` **(30-min TTL)**

- Same file, line 16 (init line 22, `maxAge: 1000 * 60 * 30`).
- **Purpose:** marks components for which a network import was already attempted; suppresses re-attempts within 30 minutes.
- **Reads/Writes:** lines 39, 42.
- **Replaced by:** **removed entirely** (proposal: implicit auto-import is eliminated). Callers that need network resolution call `scope.import` explicitly.

### 11. `ComponentStatusLoader._componentsStatusCache` — `Record<string, any>`

- File: `scopes/workspace/workspace/workspace-component/component-status-loader.ts:27`.
- **Reads/Writes:** lines 56, 61, 63.
- **Invalidations:** per-id at line 133, full clear at line 137.
- **Note:** comment at line 57 explicitly warns against the obvious caching pattern because `getStatus` may trigger `linkToNodeModulesByIds` which clears the cache mid-call. This is the kind of fragility the rewrite eliminates.
- **Replaced by:** status data becomes part of the `dependencies`-phase entry in the unified cache. The fragile order-of-operations dependency disappears.

### 12. `WorkspaceAspectsLoader.resolvedInstalledAspects` — `Map<string, string | null>`

- File: `scopes/workspace/workspace/workspace-aspects-loader.ts:51` (init line 68).
- **Reads/Writes:** lines 651, 652, 657, 664, 671, 674.
- **Purpose:** memoizes resolved package paths for installed aspects.
- **Replaced by:** out of scope — this caches _aspect resolution paths_, not components. Not part of the loader rewrite. Document as adjacent and untouched.

### 13. `Consumer.componentsCache` (separate from #6) and `Consumer.cacheResolvedDependencies`

- Both surfaced via the loader; same fields as #6/#7. Already counted.

## Filesystem caches (persist across runs)

### A. `<scope>/.bit/cache/` — dependency data cache

- Owned by `FsCache` from #8. Persists per-component dependency resolution results.
- Keep for the `dependencies` phase.

### B. Package manager caches (`pnpm`/`yarn`)

- Owned by `DependencyResolver`, root configurable via `cacheRootDirectory`.
- Out of scope — the rewrite does not touch package manager integration.

## Invalidation entry points (how caches get cleared today)

| Trigger                             | Effect                                                                                                                                                                                                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bit clear-cache`                   | calls `Workspace.clearCache` → clears all four `WorkspaceComponentLoader` caches (`workspace-component-loader.ts:767–770`), the workspace-side duplicate map, `ScopeComponentLoader.componentsCache`, status loader cache, and disk-cache via `clear-cache.ts`. |
| `Workspace.clearCache(opts)`        | `workspace.ts:808`; iterates `[componentsCache, scopeComponentsCache, componentsExtensionsCache, componentLoadedSelfAsAspects]`.                                                                                                                                |
| `Workspace.clearComponentCache(id)` | per-component variant of the above.                                                                                                                                                                                                                             |
| `Consumer.onCacheClear` push        | `workspace.main.runtime.ts:237` — when the legacy consumer fires `onCacheClear`, the workspace clears too.                                                                                                                                                      |
| `bit install`                       | clears caches at multiple points (lines 461, 462, 488, 750–754, 1450) because installs change resolved deps and aspect paths.                                                                                                                                   |
| `bit watch` (file change)           | `watcher.ts:246, 662` — full or per-component clear.                                                                                                                                                                                                            |
| `BitMap.invalidateCache`            | `workspace.ts:395` — when bitmap changes.                                                                                                                                                                                                                       |

**The fragility:** invalidations cascade across multiple cache surfaces; missing one (or one being cleared mid-operation, see status-loader comment line 57) causes stale-read bugs. The rewrite collapses this to a single `ComponentCache.invalidate()` API.

## Mapping: today → unified ComponentCache

| Today's cache                                           | New home                                                      |
| ------------------------------------------------------- | ------------------------------------------------------------- |
| `componentsCache` (workspace loader, #1)                | `ComponentCache(id, phase)` for `extensions`/`aspects` phases |
| `scopeComponentsCache` (#2)                             | unified cache scope-side entries                              |
| `componentsExtensionsCache` (#3)                        | `extensions` phase entry                                      |
| `componentLoadedSelfAsAspects` × 2 (#4, #5)             | implied by `aspects` phase entry; both maps deleted           |
| Legacy `componentsCache` (#6)                           | gone — derived view from harmony                              |
| Legacy `cacheResolvedDependencies` (#7)                 | phase-local memo inside `dependencies` phase                  |
| `componentFsCache` (#8)                                 | retained, scoped to `dependencies` phase                      |
| `ScopeComponentLoader.componentsCache` (#9)             | unified cache scope-side entries                              |
| `ScopeComponentLoader.importedComponentsCache` (#10)    | **deleted** — no implicit auto-import                         |
| `ComponentStatusLoader._componentsStatusCache` (#11)    | `dependencies` phase data                                     |
| `WorkspaceAspectsLoader.resolvedInstalledAspects` (#12) | unchanged (adjacent concern)                                  |

**Net reduction:** 11 caches → 1 unified cache + 1 retained on-disk artifact + 1 untouched aspect-path map.
