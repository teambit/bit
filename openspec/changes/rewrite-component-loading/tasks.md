## 1. Pre-work and audit

- [x] 1.1 Enumerate every call site of `workspace.get`, `workspace.getMany`, `workspace.list`, `workspace.listWithInvalid`, `workspace.listInvalid` across `scopes/`, `components/`, and `e2e/`. Record file:line and the load shape each caller actually needs (identity / files / dependencies / extensions / aspects). → `audit/01-call-sites.md`
- [x] 1.2 Enumerate every site that mutates `consumerComponent.extensions = X` or otherwise mutates a `ConsumerComponent` after load. Document each in a migration checklist. → `audit/02-consumer-component-mutations.md`
- [x] 1.3 Enumerate every cache touched today (the 11+ listed in `design.md` Context). For each, confirm: where reads happen, where writes happen, what triggers invalidation. Output as a table. → `audit/03-caches.md`
- [x] 1.4 Identify the ~6 sites that rely on the implicit `ScopeComponentLoader.get` auto-import. List them in the migration checklist with the explicit replacement they should call. → `audit/04-auto-import-sites.md` (found 12 sites, not 6)
- [x] 1.5 Capture baseline performance numbers: time `bit status`, `bit list`, `bit show <id>`, `bit compile <id>` on a 500-component sample workspace. Record in a benchmark file under `openspec/changes/rewrite-component-loading/`. → `audit/05-benchmarks-baseline.md` (used bit6 self-workspace at 311 components; `bit compile` deferred due to outdated remote objects)

## 2. Define the public types and event surface

- [x] 2.1 In `scopes/component/component-loader/`, add `phase.ts` exporting the `Phase` type (`'identity' | 'files' | 'dependencies' | 'extensions' | 'aspects'`) and a `phaseRank(phase): number` helper.
- [x] 2.2 In the same package, add `load-events.ts` defining the `LoadEvent` discriminated union (`load:start`, `load:phase:start`, `load:component`, `load:phase:end`, `load:end`) and a typed `LoadEventEmitter` class wrapping Node's `EventEmitter`.
- [x] 2.3 Add a `ComponentNotFound` error class with `missingIds: ComponentID[]` to the same package. Export from the package index.
- [x] 2.4 Add `Component.loadedPhase: Phase` field (and getter) to `scopes/component/component/component.ts`. Default value `'identity'` for newly constructed instances. (Type aliased locally as `LoadedPhase` to avoid `@teambit/component` ↔ `@teambit/component-loader` circular dependency; canonical `Phase` declaration remains in `@teambit/component-loader/phase.ts`.)

## 3. Build the unified `ComponentCache`

- [x] 3.1 In `scopes/component/component-loader/`, create `component-cache.ts` with a `ComponentCache` class. Internal storage: `Map<string, CacheEntry>` keyed by `${componentId}::${phase}`. (Wraps existing `LRUCacheAdapter` from `@teambit/harmony.modules.in-memory-cache` to reuse battle-tested LRU; key shape preserved.)
- [x] 3.2 Implement `getHashInputs(phase, ctx): string` that composes the hash inputs documented in design Decision 2 (file mtimes, `.bitmap` hash, `workspace.jsonc` hash where applicable). Make the input set per-phase explicit and unit-tested. → `hash-inputs.ts` (`v1` version prefix lets us bust all hashes if the format changes; throws if the loader supplies an incomplete context for the requested phase).
- [x] 3.3 Implement `cache.get(id, phase)`: validate stored hash against current inputs; return entry on match, undefined on stale. (Caller supplies `currentHash`; cache compares for equality only.)
- [x] 3.4 Implement `cache.set(id, phase, component)`: compute hash and store. (Hash is computed by the caller via `getHashInputs` and passed in — keeps the cache pure storage.)
- [x] 3.5 Implement `cache.invalidate(target)`: handle `ComponentID`, `ComponentID[]`, `'all'`, `{ phase }`. (Returns count of entries deleted.)
- [x] 3.6 Wire LRU eviction at the same size limit used by today's `createInMemoryCache(maxSize: getMaxSizeForComponents())`. (Default `maxSize` from same config key, `CFG_CACHE_MAX_ITEMS_COMPONENTS`, fallback 500.)
- [x] 3.7 Unit tests: hit, stale-on-file-change, stale-on-bitmap-change, invalidate-one, invalidate-all, invalidate-phase, eviction. → `component-cache.spec.ts` (16 tests) + `hash-inputs.spec.ts` (10 tests). All 26 pass via `bit6 test`.

## 4. Build the unified `ComponentLoader` service

- [x] 4.1 In `scopes/component/component-loader/`, create `unified-component-loader.ts` exporting `UnifiedComponentLoader`. Constructor takes the workspace, scope, dependency-resolver, aspect-loader, and the `ComponentCache` and `LoadEventEmitter`. **Architectural call:** to avoid `@teambit/component-loader` ↔ `@teambit/workspace` circular package dependency, the loader takes a `LoaderHost` interface (in `loader-host.ts`) that the workspace adapts itself to, instead of taking the `Workspace` class directly. The host abstraction also enables stages 1–3 to progressively move logic out of `WorkspaceComponentLoader` without rewriting it all at once.
- [~] 4.2 Implement private `loadIdentity(id)` — **delegated to host** (`LoaderHost.loadAtPhase(id, 'identity')`) during stage 1; the host wraps existing bitmap reading. Internalizing this into the loader is stage 2/3 work.
- [~] 4.3 Implement private `loadFiles(component)` — **delegated to host** (`loadAtPhase(id, 'files')`). Direct-to-harmony construction (no `ConsumerComponent` round-trip) is the host implementation's responsibility; tracked separately.
- [~] 4.4 Implement private `loadDependencies(component)` — **delegated to host** (`loadAtPhase(id, 'dependencies')`). Re-using the legacy dep-extraction routines remains the plan; happens inside the host.
- [~] 4.5 Implement private `loadExtensions(component)` — **delegated to host** (`loadAtPhase(id, 'extensions')`). Port of `executeLoadSlot` becomes the host's stage-2 responsibility.
- [~] 4.6 Implement private `loadAspects(component)` — **delegated to host** (`loadAtPhase(id, 'aspects')`). Component-as-aspect logic stays in the host until stage 3.
- [x] 4.7 Implement public `get(id, opts)`. Delegates to `getMany([id], opts, { throwOnMissing: true })`; returns the single component or throws `ComponentNotFound`.
- [x] 4.8 Implement public `getMany(ids, opts)`: two-pass — pass 1 cache lookups (cached entries emit `load:component cached=true` immediately), pass 2 parallel host loads bracketed by a single `load:phase:start`/`load:phase:end`. Custom `runWithConcurrency` worker pool (default 16). All events share a `callId`.
- [x] 4.9 Implement public `listIds(filter?)`: `host.listBitmapIds()` — no `Component` construction. `filter?` parameter deferred (no callers use it today; revisit in stage 2 migration).
- [x] 4.10 Implement public `list(filter?, opts)`: `getMany(this.listIds(), opts, { throwOnMissing: false })`. Missing IDs returned in `result.missing` rather than throwing.
- [x] 4.11 Implement public `invalidate(target)`: forwards to `ComponentCache.invalidate`, emits a debug log with the count of entries removed.
- [x] 4.12 Implement phase-upgrade-on-access via `loader.ensurePhase(component, phase)`. Idempotent when already at or above; debug-logs every upgrade so we can track callers that picked too-low defaults. Per `design.md` open question: chose explicit `ensurePhase` over hidden auto-upgrade-on-property-access — predictable, instrumentable, no proxy/getter magic on `Component`.

## 5. Wire the loader into the workspace

- [x] 5.1 In `scopes/workspace/workspace/workspace.ts`, instantiate `UnifiedComponentLoader` in the workspace constructor. Wire the `LoadEventEmitter` to a public `Workspace.loadEvents` field. Also added `WorkspaceLoaderHost` adapter under `scopes/workspace/workspace/workspace-component/workspace-loader-host.ts` that implements the `LoaderHost` interface against the existing workspace machinery.
- [x] 5.2 Add a `BIT_LOADER` env-flag check (`Workspace.useNewLoader()`). When `BIT_LOADER=new`, `Workspace.get` / `getMany` / `listWithInvalid` route through `unifiedLoader`. `Workspace.list` is unchanged (it already calls `getMany`, so it follows the routing automatically). `clearCache` and `clearComponentCache` invalidate the unified cache alongside the legacy ones so both modes stay in sync.
- [x] 5.3 In dual-mode: `Workspace.get(id, legacyComponent?, useCache, storeInCache, loadOpts?)` translates the old positional args + `loadOpts` to the new `{ phase, consistency }` shape via `Workspace.translateLoadOpts`. Stage-1 mapping is conservative — every translation goes to `phase: 'aspects'` (full hydration) so behaviour is preserved exactly. `useCache=false` honoured by pre-invalidating; `storeInCache=false` honoured by post-invalidating. Per-command sub-aspect phases come in stage 2 (Group 8).
- [x] 5.4 Added `Workspace.getOrImport(id, loadOpts?)`: tries `getIfExist` first; if missing, calls `scope.import([id])` then `get`. Documented in JSDoc as the explicit replacement for `ScopeComponentLoader.get`'s implicit auto-import behaviour.

## 6. Migrate `bit list` and `bit status` (Stage 1 pilot)

- [x] 6.1 In the list command, switch to `componentLoader.listIds()` for the default `--ids-only`-style output and `componentLoader.list({ phase: 'files' })` only when full info is needed. **No code change needed:** investigation shows `bit list` already uses the lean path. `ListerMain.localList` calls `ComponentsList.listAll` which works directly off `bitMap.getAllBitIds()` and `ModelComponent` objects — no `workspace.get/getMany/list` calls. The optimization this task aimed at is already in place; baseline `bit list` warm time is dominated by node startup + CLI parsing, not loading. Confirmed under both `BIT_LOADER` modes.
- [x] 6.2 In `scopes/component/status/status.main.runtime.ts`, switch `workspace.listWithInvalid()` to `componentLoader.list({ phase: 'dependencies' })`. Confirm behaviour parity (modification status, missing dependencies, removed components) under both flags. → Added `Workspace.listWithInvalidAtPhase(phase, loadOpts?)` in workspace.ts; status migrated to call it with `phase: 'dependencies'`. Smoke-tested: `bit status` and `BIT_LOADER=new bit6 status` produce identical user-visible output. Stage-1 host still full-hydrates internally (the perf win materialises in stage 2 when the host gets phase-native paths); the API change is what unblocks that work.
- [x] 6.3 Add a CLI status-line subscriber to `workspace.loadEvents` that renders `loading N/M (phase)`. Wire into the existing `setStatusLine` mechanism in `@teambit/cli`. → `workspace-component/load-progress-renderer.ts` exposes `attachLoadProgressRenderer(events, logger)` which subscribes once at `Workspace` construction. Renders only on batches ≥ 10 components (single-component `get` calls are silent), only one in-flight call at a time (inner gets don't clobber outer batches), and rate-limits intermediate updates to 100ms (the first event renders immediately, the last event always renders, intermediates are throttled). Silent under the legacy loader because no events fire there.

## 7. Run dual-mode CI for stage 1

- [ ] 7.1 Add a CI job that runs the e2e suite with `BIT_LOADER=new`. Allow it to run on PRs that touch loader code, and as a nightly job.
- [ ] 7.2 Run the full e2e suite under `BIT_LOADER=new` locally; capture failures in a tracking issue and address each one. Re-run until green.
- [ ] 7.3 Re-run the baseline benchmarks from 1.5 under `BIT_LOADER=new`. Confirm `bit status` is sub-second on the 500-component sample workspace.
- [ ] 7.4 Ship one release with `BIT_LOADER=new` available as opt-in; collect feedback for at least one release cycle.

## 8. Stage 2 — flip default and migrate remaining commands

- [ ] 8.1 Flip the default of `BIT_LOADER` to `new`. Keep `BIT_LOADER=old` as an emergency rollback for one release.
- [ ] 8.2 Migrate `bit show` to `componentLoader.get(id, { phase: 'files' })` (or `dependencies` if dep info is shown).
- [ ] 8.3 Migrate `bit graph` to `componentLoader.list({ phase: 'dependencies' })`.
- [ ] 8.4 Migrate `bit compile`, `bit build`, `bit test` to `componentLoader.list({ phase: 'aspects' })` (these need full hydration).
- [ ] 8.5 Migrate `bit tag`, `bit snap`, `bit export` to phase `aspects` for the components being tagged; keep phase `dependencies` for change detection.
- [ ] 8.6 Migrate `bit start` (UI dev server) to phase `aspects`.
- [ ] 8.7 Walk every call site from 1.1 and assign each its lowest sufficient phase. Update the call site.
- [ ] 8.8 Convert every `consumerComponent.extensions = X` mutation from 1.2 to operate on the harmony `Component`. Replace the rest with `component.asLegacy()` views.
- [ ] 8.9 Replace each implicit-auto-import site from 1.4 with explicit `scope.import` followed by `loader.get`. Add a deprecation warning for any path still triggering the old behaviour during stage 2.

## 9. Stage 3 — cleanup and deletion

- [ ] 9.1 Delete `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts` and its tests.
- [ ] 9.2 In `scopes/workspace/workspace/workspace.ts`, remove the `componentLoadedSelfAsAspects` map (`workspace.ts:267`) and any other now-unused cache fields.
- [ ] 9.3 In `components/legacy/consumer-component/component-loader.ts`, remove `componentsCache`, `cacheResolvedDependencies`, `componentFsCache` fields and the `loadOne`/`getOne` methods. Reduce the file to dep-extraction utilities used by the unified loader.
- [ ] 9.4 In `scopes/scope/scope/scope-component-loader.ts`, remove `componentsCache` and `importedComponentsCache`. Reduce the file to a thin adapter (or fold entirely into the unified loader).
- [ ] 9.5 In `scopes/workspace/workspace/workspace-component/component-status-loader.ts`, remove `_componentsStatusCache`. Status data now flows through `ComponentCache` at the `dependencies` phase.
- [ ] 9.6 Remove the `BIT_LOADER` env flag and the dual-mode codepath in `Workspace.get/getMany/list`.
- [ ] 9.7 Remove the deprecated implicit auto-import codepath entirely. `loader.get` is the only entry; missing components throw `ComponentNotFound`.
- [ ] 9.8 Add a one-time on-disk cache migration: on first run after upgrade, detect old `.bit/cache/` entries with the legacy format and discard them.

## 10. Verification

- [ ] 10.1 Re-run the baseline benchmarks from 1.5; record final numbers in `openspec/changes/rewrite-component-loading/benchmarks.md` showing before/after for `bit status`, `bit list`, `bit show`, `bit compile`.
- [ ] 10.2 Run `bit test` for all aspects whose code changed (component-loader, workspace, scope, status, dependency-resolver).
- [ ] 10.3 Run `npm run e2e-test` to completion. Address any failures.
- [ ] 10.4 Run `npm run lint` and resolve all warnings/errors introduced by the change.
- [ ] 10.5 Manually exercise `bit status`, `bit install`, `bit compile`, `bit tag`, `bit export`, `bit start`, `bit show`, `bit list`, `bit graph`, `bit envs` on a non-trivial workspace; confirm progress events render and component data is correct.
- [ ] 10.6 Update CLAUDE.md and any developer docs that describe the loading pipeline.
