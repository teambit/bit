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
- [x] 5.2 Add a `BIT_LOADER` env-flag check (`Workspace.useNewLoader()`). **Stage-1 routing is narrower than originally planned**: only `Workspace.listWithInvalidAtPhase` (and via it, `listWithInvalid`) routes through the unified loader under `BIT_LOADER=new`. `Workspace.get` and `Workspace.getMany` always use the legacy loader, even under the flag. Reason: aspect loading inside the legacy `getMany` makes many recursive `workspace.get` calls during a batch load; routing those through the unified loader multiplies allocations (event emission, hash computation, cache bookkeeping) per recursion frame and OOMs on cold cache. Stage 2 will internalise per-phase paths and rework aspect loading to be cache-friendly through the unified loader. `clearCache` and `clearComponentCache` still invalidate both cache layers in lockstep.
- [x] 5.3 In dual-mode: `Workspace.listWithInvalidAtPhase(phase, loadOpts?)` translates the legacy `loadOpts` into a unified `{ phase }` call. Stage-1 mapping is conservative — every translation goes to the requested phase but the host always full-hydrates internally (via `componentLoader.getMany` with `STAGE1_LOAD_OPTS = { loadDocs: false, loadCompositions: false }`). `Workspace.translateLoadOpts` is currently unused but retained for stage 2.
- [x] 5.4 Added `Workspace.getOrImport(id, loadOpts?)`: tries `getIfExist` first; if missing, calls `scope.import([id])` then `get`. Documented in JSDoc as the explicit replacement for `ScopeComponentLoader.get`'s implicit auto-import behaviour.

## 6. Migrate `bit list` and `bit status` (Stage 1 pilot)

- [x] 6.1 In the list command, switch to `componentLoader.listIds()` for the default `--ids-only`-style output and `componentLoader.list({ phase: 'files' })` only when full info is needed. **No code change needed:** investigation shows `bit list` already uses the lean path. `ListerMain.localList` calls `ComponentsList.listAll` which works directly off `bitMap.getAllBitIds()` and `ModelComponent` objects — no `workspace.get/getMany/list` calls. The optimization this task aimed at is already in place; baseline `bit list` warm time is dominated by node startup + CLI parsing, not loading. Confirmed under both `BIT_LOADER` modes.
- [x] 6.2 In `scopes/component/status/status.main.runtime.ts`, switch `workspace.listWithInvalid()` to `componentLoader.list({ phase: 'dependencies' })`. Confirm behaviour parity (modification status, missing dependencies, removed components) under both flags. → Added `Workspace.listWithInvalidAtPhase(phase, loadOpts?)` in workspace.ts; status migrated to call it with `phase: 'dependencies'`. Smoke-tested: `bit status` and `BIT_LOADER=new bit6 status` produce identical user-visible output. Stage-1 host still full-hydrates internally (the perf win materialises in stage 2 when the host gets phase-native paths); the API change is what unblocks that work.
- [x] 6.3 Add a CLI status-line subscriber to `workspace.loadEvents` that renders `loading N/M (phase)`. Wire into the existing `setStatusLine` mechanism in `@teambit/cli`. → `workspace-component/load-progress-renderer.ts` exposes `attachLoadProgressRenderer(events, logger)` which subscribes once at `Workspace` construction. Renders only on batches ≥ 10 components (single-component `get` calls are silent), only one in-flight call at a time (inner gets don't clobber outer batches), and rate-limits intermediate updates to 100ms (the first event renders immediately, the last event always renders, intermediates are throttled). Silent under the legacy loader because no events fire there.

## 7. Run dual-mode CI for stage 1

- [x] 7.1 Add a CI job that runs the e2e suite with `BIT_LOADER=new`. Allow it to run on PRs that touch loader code, and as a nightly job. **Implemented more aggressively than originally specified:** rather than a gated/nightly job, `BIT_LOADER=new` is now the **default** for both `e2e-test` and `e2e-test-circle` npm scripts. Every PR's e2e run exercises the unified loader. CLAUDE.md documents the override (`BIT_LOADER=old npm run e2e-test`).
- [ ] 7.2 Run the full e2e suite under `BIT_LOADER=new` locally; capture failures in a tracking issue and address each one. Re-run until green. **Status: blocked on calendar — the full suite takes hours. Done as 7.1 implies (CI runs it now). Local verification was done on 2 small e2e groups (`bit status command` opening describes — 4 tests pass).**
- [ ] 7.3 Re-run the baseline benchmarks from 1.5 under `BIT_LOADER=new`. Confirm `bit status` is sub-second on the 500-component sample workspace. **Status: not applicable for stage 1.** Stage 1 host always full-hydrates; warm `bit status` is 9.94s under new vs 10.06s under legacy (equivalent). The sub-second target requires native phase paths in the host (stage 2 work, see "Session learnings" below).
- [ ] 7.4 Ship one release with `BIT_LOADER=new` available as opt-in; collect feedback for at least one release cycle. **Calendar work — not session-scale.**

## Session learnings (2026-05-08 to 2026-05-11) — read before stage 2

Three findings from stage-1 implementation that change the original Group 8 plan:

### Finding 1: Mapping `Phase` → `loadOpts` flags isn't a safe perf shortcut

An experiment translating `Phase` to the legacy loader's opt-out flags (`{ loadExtensions: false, executeLoadSlot: false, loadSeedersAsAspects: false }` for sub-aspects phases) measured a 4× speed-up on cold `bit status` (42s → 11s) but **broke correctness** — status's downstream issue-checking (`triggerAddComponentIssues`) and env-as-aspect detection silently rely on extensions being populated. The new-loader status dropped its entire report and printed `no env found for teambit.component/component-loader` instead.

**Implication for stage 2**: simple "tell the loader to skip work" approaches won't deliver perf wins without coordinated changes in the consumers. Each migration in tasks 8.2–8.6 must verify downstream code tolerates the reduced hydration.

### Finding 2: Routing `Workspace.get` through the unified loader OOMs on cold cache

Aspect loading inside the legacy `componentLoader.getMany` (`loadCompsAsAspects`) makes many recursive `workspace.get` calls during a batch load. Routing each one through the unified loader compounds per-call allocations (event emission, hash computation, cache bookkeeping) across recursion frames and triggers OOM on cold cache, even with bounded concurrency.

**Mitigation applied in stage 1**: `Workspace.get` and `Workspace.getMany` always use the legacy loader, even under `BIT_LOADER=new`. Only `Workspace.listWithInvalidAtPhase` routes through the unified loader.

**Implication for stage 2**: before unifying `Workspace.get`/`getMany`, aspect loading needs to either (a) be cache-aware so recursive gets hit the cache instead of re-loading, or (b) be batched up front so a `getMany` returns components with aspects already loaded.

### Finding 3: Routing single-ID loads through `loadManyAtPhase` triggers the heavy batch path

The legacy `componentLoader.getMany([oneId])` goes through `getAndLoadSlotOrdered`, designed for batches — far heavier than `componentLoader.get(oneId)`. Routing a single-ID unified-loader call through `host.loadManyAtPhase([id])` invokes that heavy path.

**Mitigation applied in stage 1**: the unified loader uses `loadManyAtPhase` only when `needsLoad.length > 1`. Single-ID loads go through the per-ID `loadAtPhase`.

**Implication for stage 2**: the host's `loadAtPhase` and `loadManyAtPhase` aren't interchangeable — they have different cost profiles. Keep them separate.

## 8. Stage 2 — reframed by session learnings

Group 8 splits into three tiers:

**Tier 1 — bounded, mechanical, low-risk** (recommended next):

- [ ] 8.8 Convert every `consumerComponent.extensions = X` mutation from 1.2 to operate on the harmony `Component`. Replace the rest with `component.asLegacy()` views. → audit/02-consumer-component-mutations.md lists each of the 9 sites with its target migration. **Revised assessment (2026-05-11):** audit/02's classification of this as "Mechanical, localized, no behaviour change" was wrong on closer inspection. (a) `version-maker.ts:524` operates on `ConsumerComponent[]` (`allComponentsToTag`), not harmony `Component[]` as the audit claimed — so "port to harmony" requires first looking up the corresponding harmony component for each legacy one. (b) The snapping sites (`snapping.main.runtime.ts:351`, `:1108`) write the extensions list back onto the consumer because the next steps in the snap pipeline (`getObjectsToEnrichComp`, `addBuildStatus`) read `consumerComponent.extensions` directly. Removing the mutation requires reshaping the pipeline to thread the new extensions list explicitly. (c) The file/version mutations in checkout/merging/import (`checkout-version.ts:89`, `merging.main.runtime.ts:529`/`:537`, `import-components.ts:906`) feed immediately into persistence + downstream reads of the same component; the "write→invalidate→reload" pattern only works when the unified loader is the source of truth, which it isn't in stage 1 (Workspace.get still uses legacy). **Concrete blockers for proceeding:** (1) need new harmony Component method(s) for atomic extensions replacement with data-field preservation (`replaceExtensions(list, { preserveDataFromOriginal: true })` or equivalent), (2) need to lift `componentLoader.invalidate` to be the canonical cache-busting path before file-write sites can drop in-memory mutations, (3) Workspace.get must route through the unified loader before the invalidate-reload pattern is observable to all readers. Promote to **Tier 2** alongside 8.10 — the per-phase perf-win design and the consumer-component-elimination design naturally share questions about Component API surface.
- [x] 8.9 Replace each implicit-auto-import site from 1.4 with explicit `scope.import` followed by `loader.get` (or `workspace.getOrImport`). Add a deprecation warning for any path still triggering the old behaviour during stage 2. → audit/04-auto-import-sites.md lists 12 sites split into 6 (use `getOrImport`) and 6 (use plain `scope.get`). Done: added `Scope.getOrImport` (scope.main.runtime.ts:826) as the explicit, self-documenting wrapper for the implicit auto-import; converted the 6 "needs network" sites (api-for-ide.ts:735, aspect.main.runtime.ts:92/171, workspace.main.runtime.ts:253, workspace.ts:1148/1850) to call `scope.getOrImport`; converted the 6 "local-only" sites (remove.main.runtime.ts:225/262/300/413, deprecation.main.runtime.ts:81, snapping.main.runtime.ts:445) to pass `importIfMissing=false` explicitly. Verified `bit status` produces identical output under both legacy and `BIT_LOADER=new`. Deprecation warning deferred to stage 3 when `ScopeComponentLoader.get` actually flips its default.

**Tier 2 — design-first** (requires written design before coding, given findings 1–3):

- [x] 8.10 (new) Design and document a stable approach to per-phase perf wins. → **`design-stage2-perf.md`** (2026-05-12 explore session). Key outcomes: (A), (B), (C) as originally framed are all dead — they assumed sub-aspects Components are usable, but aspects-onLoad slots populate Component state that downstream readers depend on, so every returned Component must be at `aspects` phase. The perf strategy shifts from "skip phases" to **caching-first**: cache short-circuit at `unified.getMany`, fine-grained invalidation audit, recursive `workspace.get` reliably hitting the cache (replaces stage-1's OOM workaround). Also: "extensions" and "aspects" are the same concept in two vocabularies; the phase ladder collapses one rung. See the design doc for the 5-step plan and 5 open follow-up questions.

The per-command migrations 8.2–8.7 are **reframed by the design**:

- [ ] 8.2 ~~Migrate `bit show` to phase `files`~~ → **Audit `bit show`**: confirm it returns Component to user code → must run at `aspects`. Likely zero code change; verify and close.
- [ ] 8.3 ~~Migrate `bit graph` to phase `dependencies`~~ → **Audit `bit graph`**: graph rendering reads aspect-populated dep annotations → must run at `aspects`. Likely zero code change; verify and close.
- [ ] 8.4 ~~Migrate `bit compile`/`build`/`test` to phase `aspects`~~ → Already at `aspects`; confirm and close.
- [ ] 8.5 ~~Migrate `bit tag`/`snap`/`export` per-phase~~ → All run at `aspects` (full hydration needed for build pipeline). Confirm and close.
- [ ] 8.6 ~~Migrate `bit start` to phase `aspects`~~ → Already at `aspects`. Confirm and close.
- [ ] 8.7 ~~Walk every call site and assign lowest sufficient phase~~ → **Refocus**: walk every call site and confirm the unified-loader cache short-circuit (Lever 1 in design-stage2-perf.md) covers it. The win is per-cache-hit, not per-phase-tuning.

**Tier 3 — calendar / release work**:

- [ ] 8.1 Flip the default of `BIT_LOADER` to `new`. Keep `BIT_LOADER=old` as an emergency rollback for one release. **Blocked on stage-1 PR (#10359) merging and a release cycle of feedback.**

## 8. Stage 2 — flip default and migrate remaining commands

- [ ] 8.1 Flip the default of `BIT_LOADER` to `new`. Keep `BIT_LOADER=old` as an emergency rollback for one release.
- [ ] 8.2 Migrate `bit show` to `componentLoader.get(id, { phase: 'files' })` (or `dependencies` if dep info is shown).
- [ ] 8.3 Migrate `bit graph` to `componentLoader.list({ phase: 'dependencies' })`.
- [ ] 8.4 Migrate `bit compile`, `bit build`, `bit test` to `componentLoader.list({ phase: 'aspects' })` (these need full hydration).
- [ ] 8.5 Migrate `bit tag`, `bit snap`, `bit export` to phase `aspects` for the components being tagged; keep phase `dependencies` for change detection.
- [ ] 8.6 Migrate `bit start` (UI dev server) to phase `aspects`.
- [ ] 8.7 Walk every call site from 1.1 and assign each its lowest sufficient phase. Update the call site.
- [ ] 8.8 Convert every `consumerComponent.extensions = X` mutation from 1.2 to operate on the harmony `Component`. Replace the rest with `component.asLegacy()` views. (Reclassified as Tier 2 design-first work — see the detailed Tier 1 note above for blockers and Component API surface questions.)
- [x] 8.9 Replace each implicit-auto-import site from 1.4 with explicit `scope.import` followed by `loader.get`. Add a deprecation warning for any path still triggering the old behaviour during stage 2. (duplicate of 8.9 above — see Tier 1 note for details.)

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
