# Component Loading Redesign

**Status:** Phase 1 shipped; Phase 2 in progress
**Last updated:** 2026-06-15 (code references are against `master` @ `59855b104`; line numbers will drift)

This document is the source of truth for a multi-phase effort to simplify Bit's component-loading
mechanism: fewer caches, a staged (lazy) loading pipeline, a single env/aspect load planner, and a
gradual inversion of the legacy `ConsumerComponent` ↔ Harmony `Component` relationship.

Each phase is tracked as an OpenSpec change when it starts. Every PR belonging to this effort must
link here and update the [Status](#status) section.

---

## 1. Problem statement

Component loading is the hottest and most fragile path in Bit. Today it is hard to debug, slow on
large workspaces, and resistant to change — past fixes have introduced regressions, leading to
workarounds rather than root-cause fixes (e.g. `loadSeedersAsAspects: false` in
`scopes/workspace/install/install.main.runtime.ts:1320-1327`, added explicitly to dodge a
regression).

Four root problems, which compound each other:

### 1.1 All-or-nothing loading

`workspace.get()` / `scope.get()` always produce a fully-hydrated component: file contents read and
parsed, dependencies resolved from source, extensions merged from 6-8 sources, env calculated, and
every `onComponentLoad` slot handler executed (docs, compositions, schema, pkg, preview, dev-files,
apps). Most callers need a fraction of that.

Concrete over-loading examples:

- `bit deps usage` loads full components, uses only id + dependency list
  (`scopes/dependencies/dependencies/dependencies.main.runtime.ts:436`).
- The IDE metadata endpoint loads everything to extract id + env + deprecation flag
  (`scopes/harmony/api-server/api-for-ide.ts:246`).
- `scope.get()` eagerly loads **all file contents** from the object store inside
  `ModelComponent.toConsumerComponent()`
  (`scopes/scope/objects/models/model-component.ts:1143-1212`), even when no caller reads them.
- `bit remove` loads full components just to reach `state._consumer` for node_modules cleanup
  (`scopes/component/remove/remove.main.runtime.ts:125`).
- Forking loads the full workspace to pattern-match ids
  (`scopes/component/forking/forking.main.runtime.ts:297`).

Partial-load mechanisms exist but are ad-hoc and underused: `ComponentLoadOptions`
(`loadDocs`/`loadCompositions`/`loadSeedersAsAspects`/`idsToNotLoadAsAspects`),
`workspace.listIds()`, `graph.getGraphIds()`.

### 1.2 ~11 uncoordinated caches

| Cache                                                   | Location                                                                          | Key                   | Stores                                       |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------- | -------------------------------------------- |
| `Repository.cache`                                      | `scopes/scope/objects/objects/repository.ts:42`                                   | object hash           | BitObjects (LRU 3000, skips objects > 100KB) |
| `ScopeComponentLoader.componentsCache`                  | `scopes/scope/scope/scope-component-loader.ts:15`                                 | id                    | Harmony Component (LRU 500)                  |
| `ScopeComponentLoader.importedComponentsCache`          | `scope-component-loader.ts:16`                                                    | id                    | boolean, 30-min TTL                          |
| `WorkspaceComponentLoader.componentsCache`              | `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts:90` | `id + JSON(loadOpts)` | Harmony Component                            |
| `WorkspaceComponentLoader.scopeComponentsCache`         | `workspace-component-loader.ts:94`                                                | id                    | scope Components                             |
| `WorkspaceComponentLoader.componentsExtensionsCache`    | `workspace-component-loader.ts:99`                                                | id                    | merged extensions + envId                    |
| `WorkspaceComponentLoader.componentLoadedSelfAsAspects` | `workspace-component-loader.ts:105`                                               | id                    | boolean recursion guard                      |
| Legacy `ComponentLoader.componentsCache`                | `components/legacy/consumer-component/component-loader.ts:53`                     | id                    | ConsumerComponent                            |
| Legacy `cacheResolvedDependencies` / `componentFsCache` | `component-loader.ts:56-58`                                                       | id                    | resolved deps (memory + FS)                  |
| `SourceRepository.cacheUnBuiltIds`                      | `components/legacy/scope/repositories/sources.ts:67`                              | id                    | ModelComponent, 60s TTL                      |
| `PkgMain.manifestCache`                                 | `scopes/pkg/pkg/pkg.main.runtime.ts`                                              | head hash             | package manifests                            |

Problems:

- The workspace cache key embeds serialized `loadOpts`
  (`createComponentCacheKey`, `workspace-component-loader.ts:990`), so the same component loaded
  with different options is cached as separate opaque blobs.
- Invalidation requires three coordinated calls (`workspace.ts:829-841`:
  `componentLoader.clearCache` + legacy `clearComponentsCache` + `componentStatusLoader.clearCache`).
- Cache hits are silent — a stale cache is indistinguishable from a fresh load in the logs.

### 1.3 The legacy roundtrip is the spine, not a shim

Every load goes: BitObject → `ModelComponent`/`Version` → `ConsumerComponent` (files eagerly
hydrated) → Harmony `State` that wraps the ConsumerComponent as `state._consumer`
(`workspace-component-loader.ts:815-821`, `scopes/scope/scope/scope-component-loader.ts:211-229`).

Worse, `executeLoadSlot` **mutates** `_consumer.extensions` mid-load after env/deps are computed
(`workspace-component-loader.ts:948-951`). The Harmony Component is a façade; the real data lives
in the legacy object, so neither layer can be simplified independently and the load flow has
hidden write-backs.

### 1.4 Aspect loading and component loading are mutually recursive, with implicit guards

Loading a component requires its env → the env is an aspect → an aspect is a component → which has
its own env. The guards are scattered and implicit:

- `idsToNotLoadAsAspects` passed down to prevent re-entry
  (`scopes/workspace/workspace/workspace-aspects-loader.ts:774-792`)
- `componentLoadedSelfAsAspects` cache (`workspace-component-loader.ts:457-480`)
- load-group stratification: core envs → env-of-envs → non-env aspects → seeders
  (`buildLoadGroups`, `workspace-component-loader.ts:185-341`)
- a _second, different_ implementation of the same ordering on the scope side
  (`groupAspectIdsByEnvOfTheList`, `scopes/scope/scope/scope-aspects-loader.ts:59-86`)

And at least 9 places swallow load errors silently — the single biggest reason debugging is
painful. Notable: `loadCompsAsAspects` logs a warning and continues ("we ignore that errors at the
moment", `workspace-component-loader.ts:486-489`); `requireAspects` returns `[]` on failure unless
`throwOnError` (`scope-aspects-loader.ts:337-352`); `ignoreAspectLoadingError` filters ESM errors
during install (`workspace-aspects-loader.ts:915-922`).

---

## 2. Target architecture

### 2.1 Staged loading (the keystone)

Replace the monolithic load with explicit stages. Each stage is separately cacheable and lazily
triggerable:

| Stage             | Data                                                                                | Source                                    | Cost       |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------- | ---------- |
| **S0 Identity**   | ComponentID, head, version list                                                     | `.bitmap` / ModelComponent                | ~free      |
| **S1 Record**     | Version object: file _paths + hashes_, stored deps, stored extensions, build status | object store                              | cheap read |
| **S2 Config/Env** | merged extensions, resolved env id                                                  | aspects-merger over S1 + workspace config | medium     |
| **S3 Files**      | actual file contents (ComponentFS)                                                  | FS (workspace) / object store (scope)     | heavy      |
| **S4 Computed**   | fresh dependency resolution, onLoad slot data (docs, schema, compositions, …)       | needs S2 + S3 + aspect code loaded        | heaviest   |

The `Component` object becomes a **handle created at S0** whose accessors pull stages on demand:
`component.files()` triggers S3, `component.dependencies()` triggers S4-deps, etc. Existing
synchronous accessors keep working via eager hydration in the legacy-compatible path; refactored
callers get laziness for free. This formalizes the ad-hoc flags (`loadDocs`, `loadCompositions`,
`getGraphIds`) into named stages, and makes laziness the default rather than an opt-out workaround.

Two highest-leverage laziness changes:

- **Lazy file contents**: `toConsumerComponent` constructs `SourceFile`s with a deferred content
  loader (path + hash + `load()` against the Repository) instead of `Promise.all`-hydrating every
  file. `ComponentFS` already abstracts access. This alone removes the biggest scope-side cost.
- **Lazy slot execution**: `executeLoadSlot` becomes per-aspect on-demand — docs data computed when
  something asks for docs data — with `getMany` able to prefetch for flows that genuinely need it
  (tag/build).

### 2.2 One cache, keyed by (id, stage), one invalidation event

A single `ComponentCacheManager` with three tiers:

- **L1 objects** — the existing Repository LRU (keep as-is).
- **L2 component stages** — keyed `(componentId, stage)`. Replaces the workspace's four caches, the
  scope loader cache, and the legacy ComponentLoader cache.
- **L3 derived** — per-aspect computed data keyed `(componentId, aspectId)`. Replaces the
  loadOpts-in-the-cache-key hack: partial loads cache the _stages_ they computed instead of a
  distinct full-component blob per options combination.

Invalidation becomes one event: `invalidate(id, reason)` clears S1+ for that id (and S2 of
dependents on config change). Every hit/miss/invalidation logs through one chokepoint.

### 2.3 Invert legacy ownership (incrementally — no big-bang rewrite)

1. **Stop mutating `_consumer` during load.** `executeLoadSlot` writes to Harmony aspect entries
   only; legacy readers of `extensions` go through a merging accessor.
2. The staged pipeline owns the data; `ConsumerComponent` becomes a _view_ materialized on demand
   (`component.toLegacy()`) — the inverse of today.
3. Migrate `_consumer` call sites opportunistically (heavy users: remove, compiler, snapping).
   Each migration shrinks what `toLegacy()` must materialize.

### 2.4 Detangle env resolution from component loading

Computing the **env id** only needs S2 (merged extensions), which only needs S1 + workspace config
— no file reads, no dep resolution, no aspect code execution.

- Extract a standalone **`EnvResolver`**: `resolveEnvId(id) → string`, operating purely on S0-S2
  data, with its own small cache. Replaces `populateScopeAndExtensionsCache` +
  `componentsExtensionsCache`.
- Loading becomes two phases: **plan** (resolve env ids for all requested components, topo-sort the
  env/aspect closure — the `buildLoadGroups` logic, but on cheap S2 data) and **execute** (load
  aspect code for the closure once, then load components in parallel).
- The recursion guard becomes an **explicit visited-set in the planner**, replacing four scattered
  caches/flags. The workspace and scope loaders' duplicated ordering logic unifies into this one
  planner.

### 2.5 Debuggability as a feature

- **`bit debug-load <id>`** — prints the full load trace: stages run, cache hit/miss per stage, the
  extension-merge table showing which of the 6-8 sources contributed each extension and what won
  (the aspects-merger already computes a `beforeMerge` trace — it's just never surfaced), the
  resolved env and why, and timing per stage and per onLoad handler.
- **No silent error swallowing.** The catch-and-continue spots attach a `LoadIssue` to the
  component (the `issues` mechanism already exists), so `bit status` shows "env X failed to load:
  …" instead of mysteriously degraded behavior later.
- **One trace context per load request** — generalize the `callId` pattern
  (`workspace-aspects-loader.ts:98`) so every nested aspect/component load logs under the
  originating request id; `BIT_LOG=*` output reads as a tree instead of interleaved noise.

---

## 3. Phase plan

Each phase = a milestone, shipped as **multiple small PRs**, each independently green and
revertible. Pattern: introduce new mechanism alongside old → migrate → delete old. An OpenSpec
change is created per phase when it starts (not upfront — later phases will be reshaped by what
earlier ones teach us).

### Phase 1 — Observability + safety net _(low risk, do first)_

- [ ] Trace context: one request id per top-level load, propagated through nested aspect/component loads
- [ ] `bit debug-load <id>` command (stages, cache hits, merge table, env resolution, timings)
- [ ] Convert swallowed load errors into component `LoadIssue`s surfaced in `bit status`
- [ ] Stage-level timing instrumentation (groundwork for the benchmark table)

### Phase 2 — Quick perf wins on existing seams

- [x] Benchmark harness committed + baseline recorded (see §4) — **gate for the rest of the phase**
- [ ] Lazy file contents in `ModelComponent.toConsumerComponent`
- [ ] `bit deps usage`: ids + stored deps instead of full load
- [ ] IDE metadata endpoint (`api-for-ide.ts`): S0-S2-level data only
- [ ] `bit remove` / forking: drop full-component loads where only ids/paths are used
- [ ] Default `loadDocs: false, loadCompositions: false` for non-UI flows

### Phase 3 — Cache consolidation

- [ ] Introduce `ComponentCacheManager` (unused, with tests)
- [ ] Migrate the workspace loader's four caches onto it
- [ ] Migrate scope loader + legacy ComponentLoader caches; single `invalidate(id, reason)` event
- [ ] Delete the old clear-cache coordination (`workspace.ts:829-841`)

### Phase 4 — Staged loading pipeline

- [ ] Formalize S0-S4 stage definitions; Component becomes a stage-pulling handle
- [ ] `executeLoadSlot` → on-demand per-aspect computation, with prefetch for tag/build
- [ ] Remove `loadOpts` from cache keys (subsumed by per-stage caching)

### Phase 5 — Env planner + loader unification

- [ ] Standalone `EnvResolver` on S0-S2 data
- [ ] One load planner (plan/execute) replacing `buildLoadGroups` + `groupAspectIdsByEnvOfTheList`
- [ ] Explicit visited-set recursion handling; delete `componentLoadedSelfAsAspects` / `idsToNotLoadAsAspects`

### Phase 6 — Legacy inversion _(ongoing)_

- [ ] Freeze `_consumer` mutation during load
- [ ] Introduce `component.toLegacy()`; pipeline owns the data
- [ ] Migrate `_consumer` call sites (remove, compiler, snapping first)

---

## 4. Benchmarks

Method: `node scripts/bench-component-loading.js --bin=<bit>` runs the four commands below on this
repository's own workspace (large, real — ~313 components), reporting wall-time (median of 3 warm
runs, after a discarded warmup) and peak RSS (via `/usr/bin/time`). Run `bit import` first so the
workspace isn't in a degraded "outdated objects" state. Absolute numbers are **machine-specific** —
compare deltas on the same machine. Update this table at every phase boundary; any phase that
regresses a number must explain why before merging.

The `Peak RSS` column is the worst case across the four commands (`bit graph`). Wall-times are
median seconds. Per-command peak RSS for the baseline: status 1237MB, list 425MB, show 253MB,
graph 2013MB.

| Milestone              | `bit status` | `bit list` | `bit show <comp>` | `bit graph --json` | Peak RSS |
| ---------------------- | ------------ | ---------- | ----------------- | ------------------ | -------- |
| Baseline (pre-Phase 2) | 11.24s       | 1.59s      | 1.73s             | 20.49s             | 2013MB   |
| After Phase 2          | —            | —          | —                 | —                  | —        |
| After Phase 3          | —            | —          | —                 | —                  | —        |
| After Phase 4          | —            | —          | —                 | —                  | —        |
| After Phase 5          | —            | —          | —                 | —                  | —        |

Baseline measured 2026-06-15 on darwin (Apple silicon), `bit` @ 1.13.222, node v22.20.0,
`bit show teambit.workspace/workspace`. The two clear hotspots are `bit status` (11s) and
`bit graph` (20s, 2GB).

### 4.1 Profiling findings (where the warm load time actually goes)

Beyond wall-time, an opt-in aggregate profiler (`BIT_LOAD_PROFILE=1 bit <cmd>`, in
`@teambit/harmony.modules.load-trace`) sums each load stage's self-time across the whole command.
Numbers below are aggregate self-time across ~313 components at ~6× concurrency (so wall ≈ total/6).

**`bit status` (warm, ~13s wall):**

| stage                                                       | aggregate self-time | ~wall | note                                          |
| ----------------------------------------------------------- | ------------------- | ----- | --------------------------------------------- |
| `legacy-load-deps`                                          | 43s                 | ~7s   | dependency-object materialization (see below) |
| `on-load` (slot handlers: docs, compositions, schema, pkg…) | 10s                 | ~1.7s | trimmable for non-UI flows                    |
| `dependency-resolution` (Harmony resolver)                  | 7.7s                | ~1.3s |                                               |
| `execute-load-slot` (own)                                   | 5.8s                | ~1s   |                                               |
| `consumer-fs-load` (file content reads)                     | negligible          | —     | not a `status` cost                           |

**`bit graph --json` (warm, ~20s wall; ~7.5s of it is loading):**

| stage                                   | aggregate self-time | note                           |
| --------------------------------------- | ------------------- | ------------------------------ |
| `consumer-fs-load` (file content reads) | 5.8s                | dominant load cost for graph   |
| `legacy-load-deps`                      | 1.2s                | graph uses a lighter load path |

**Key conclusions (validated, not hypothesized):**

- **The dependency FS cache works.** On a warm `bit status`, dep loading is **635 cache hits, 0
  misses/recomputes**. `legacy-load-deps` is _not_ re-resolving dependencies.
- **`status`'s dominant cost (~7s wall) is dependency-object _materialization on cache hit_** —
  `DependenciesData.deserialize` + reconstructing full `Dependency`/`DependencyList` objects +
  `applyOverrides`, for every component, even though `status` reads little of it. This is the
  "all-or-nothing, always fully materialize" problem of §1.1 — **structural, not a cache bug.**
  Reducing it needs the staged/lazy-loading work (defer dependency-object construction), **not a
  Phase-2 quick fix.** Earlier framing of this as "39s" was aggregate-concurrent self-time, not
  wall; wall is ~13s.
- **`graph`'s dominant load cost is file-content reads (`consumer-fs-load`, 5.8s)** → this is what
  **lazy file contents** (§2.1) targets; validated as a real win for `graph`/scope-side loads, but
  it does **not** help `status` (whose file reads are negligible).
- Implication for Phase-2 ordering: lazy file contents helps `graph`; per-command partial loads help
  `deps usage`/IDE/`remove`/forking; `loadDocs/loadCompositions: false` trims `status`'s slot work
  (~1.7s). The big `status` number is deferred to the staged-loading phase.

---

## Status

| Phase                   | State       | OpenSpec change                | PRs                                                 |
| ----------------------- | ----------- | ------------------------------ | --------------------------------------------------- |
| 1 — Observability       | done        | `component-load-observability` | [#10418](https://github.com/teambit/bit/pull/10418) |
| 2 — Quick perf wins     | in progress | —                              | —                                                   |
| 3 — Cache consolidation | not started | —                              | —                                                   |
| 4 — Staged pipeline     | not started | —                              | —                                                   |
| 5 — Env planner         | not started | —                              | —                                                   |
| 6 — Legacy inversion    | not started | —                              | —                                                   |

**Log:**

- 2026-06-10 — Initial proposal drafted.
- 2026-06-10 — Phase 1 implemented: `@teambit/harmony.modules.load-trace` module (AsyncLocalStorage
  trace context + spans), trace-prefixed logging via the legacy `BitLogger` chokepoint, stage spans
  across workspace/scope/legacy loaders with cache hit/miss attributes, `LoadFailures` component
  issue (non-tag-blocking) attached at the previously-silent catch sites (central:
  `aspectLoader.handleExtensionLoadingError`), and the `bit debug-load <id>` command (stages/cache
  table, extension-merge sources, env origin, issues; `--json` supported). e2e:
  `load-failures-issue.e2e.ts`, `debug-load.e2e.ts`.
  Span-to-stage mapping for Phase 2 benchmarks: S0=`id-resolution`, S1=`scope-load`/
  `state-from-version`, S2=`extension-merge`+`env-calc`, S3=`consumer-fs-load`,
  S4=`dependency-resolution`+`execute-load-slot`/`on-load:*`.
- 2026-06-15 — Phase 2 started. Benchmark harness committed (`scripts/bench-component-loading.js`)
  and baseline recorded in §4 (after `bit import`): `bit status` 11.24s, `bit list` 1.59s,
  `bit show` 1.73s, `bit graph --json` 20.49s; peak RSS 2.0GB on graph.
- 2026-06-16 — Profiling done (see §4.1). Added an opt-in aggregate per-stage profiler
  (`BIT_LOAD_PROFILE=1`) to `@teambit/harmony.modules.load-trace`. Findings: the dependency FS cache
  works (warm `bit status` = 635 dep-cache hits, 0 misses). `status`'s dominant warm cost (~7s wall)
  is dependency-_object materialization_ on cache hit (deserialize + reconstruct), not resolution —
  structural, deferred to staged loading, not a Phase-2 quick win. `graph`'s dominant load cost is
  file-content reads (`consumer-fs-load`, 5.8s) → the target for lazy file contents. (Correction: an
  earlier "39s" figure was aggregate-concurrent self-time, not wall; warm wall is ~13s.) Direction
  for the next Phase-2 PR intentionally left open.
