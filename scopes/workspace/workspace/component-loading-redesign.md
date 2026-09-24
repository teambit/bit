# Component Loading Redesign

**Status:** Phase 1 shipped; Phase 2 re-scoped; Phase 3's premise disproved; object-cache fix shipped (see [Status](#status))
**Last updated:** 2026-09-24 (code references are against `master` @ `59855b104`, §4.5 @ `9307c9c6a`; line numbers will drift)

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
  with different options is cached under separate keys. _(Measured 2026-09-22: the keys point to
  the same object, so this costs no memory — the real issue is that a key describes the request,
  not what was loaded. See §4.3 item 2.)_
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
- [x] ~~Forward `loadOpts` in the batch `executeLoadSlot` path~~ — **implemented, measured, rejected.**
      Halved `on-load` aggregate self-time with **no wall change** and **+67MB RSS** (§4.3). Not merged.
- [ ] ~~Default `loadDocs: false, loadCompositions: false` for non-UI flows~~ — **blocked**: `status`
      already sets them; they can't take effect until the cache stops keying on them (Phase 3)
- [ ] Lazy file contents in `ModelComponent.toConsumerComponent` (targets `graph`, and the RSS trend)
- [ ] `bit deps usage`: ids + stored deps instead of full load
- [ ] IDE metadata endpoint (`api-for-ide.ts`): S0-S2-level data only
- [ ] `bit remove` / forking: drop full-component loads where only ids/paths are used

**Explicitly dropped from this phase:** narrowing the deps-cache freshness fs scan (PR #10445,
closed 2026-09-22). It cut warm `status` fs syscalls 37% (74.3k → 46.4k) but moved wall ~0.3s —
the syscalls are `stat`/`lstat`/`readdir`, which overlap with CPU on a warm SSD — in exchange for
narrowing the invalidation signal of the highest-blast-radius cache in the loader. Bad trade. The
useful output of that work is the §4.1/§4.2 profiling and the node_modules invalidation constraints
recorded in the deps-cache notes.

### Phase 3 — Cache consolidation

> **Reassessed 2026-09-22 — not a perf lever.** Its promotion (§4.3) rested on the component cache
> holding duplicate copies; measured, it holds exactly one object per id (§4.3 item 2, §4.5). What
> remains is simplification and a correctness hazard (keys describe the request, not the content),
> worth doing only alongside partial-loading work that needs it. The 500-component cap on these
> caches is the one open perf question here (§4.5).

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

| Milestone                | `bit status` | `bit list` | `bit show <comp>` | `bit graph --json` | Peak RSS |
| ------------------------ | ------------ | ---------- | ----------------- | ------------------ | -------- |
| Baseline (pre-Phase 2)   | 11.24s       | 1.59s      | 1.73s             | 20.49s             | 2013MB   |
| Re-baseline (2026-09-22) | 9.43s        | 1.72s      | 1.23s             | 18.59s             | 2352MB   |
| After Phase 2            | —            | —          | —                 | —                  | —        |
| After Phase 3            | —            | —          | —                 | —                  | —        |
| After Phase 4            | —            | —          | —                 | —                  | —        |
| After Phase 5            | —            | —          | —                 | —                  | —        |

Baseline measured 2026-06-15 on darwin (Apple silicon), `bit` @ 1.13.222, node v22.20.0,
`bit show teambit.workspace/workspace`. The two clear hotspots are `bit status` (11s) and
`bit graph` (20s, 2GB).

**Re-baseline 2026-09-22** — same machine/method, `bit` @ 2.2.57, node v22.20.0. Note the workspace
grew from ~313 to **331 components** (+5.8%), so per-component deltas are better than the raw wall
numbers suggest. Per-command peak RSS: status 1239MB, list 549MB, show 260MB, graph 2352MB.

| metric            | baseline | re-baseline | raw Δ  | per-component Δ |
| ----------------- | -------- | ----------- | ------ | --------------- |
| `bit status` wall | 11.24s   | 9.43s       | −16.1% | −20.6%          |
| `bit graph` wall  | 20.49s   | 18.59s      | −9.3%  | −14.2%          |
| `bit show` wall   | 1.73s    | 1.23s       | −28.9% | n/a (1 comp)    |
| `bit list` wall   | 1.59s    | 1.72s       | +8.2%  | +2.3% (flat)    |
| `bit graph` RSS   | 2013MB   | 2352MB      | +16.8% | +10.4%          |
| `bit list` RSS    | 425MB    | 549MB       | +29.2% | +22.2%          |

Two things to read from this:

- **The wall-time gains came from outside this effort.** No Phase-2 item shipped, yet `status` and
  `graph` improved materially — from targeted fixes landed independently (batching/deduping
  dependency imports when building graphs from fs, dropping a per-invocation hard-link-directory
  load, unifying component load paths). The redesign plan is not what moved these numbers.
- **Memory is trending the wrong way.** `graph` peak RSS is up 339MB and `list` up 124MB, beyond
  what the +5.8% component growth explains. No phase currently targets memory; §2.1 lazy file
  contents is the closest lever.

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

### 4.2 Re-profile 2026-09-22 (`bit status`, 331 components, 9.43s wall)

`BIT_LOAD_PROFILE=1 bit status`, aggregate self-time 68.1s (wall was 9.43s — the sum exceeds wall
because concurrently-interleaved spans each count their own `await` time).

> **Do not read these as wall-time budgets.** §4.3 shows, by direct experiment, that cutting a row
> here in half changed wall by nothing. Use this table to find _where to look_, never to size a win.

| stage                                        | self-time | calls | share of self-time |
| -------------------------------------------- | --------- | ----- | ------------------ |
| `legacy-load-deps`                           | 34.3s     | 331   | 50%                |
| `on-load` (docs, compositions, schema, pkg…) | 13.7s     | 2317  | 20%                |
| `dependency-resolution`                      | 6.7s      | 331   | 10%                |
| `workspace.get`                              | 5.5s      | 3349  | 8%                 |
| `execute-load-slot` (own)                    | 4.5s      | 331   | 7%                 |
| `consumer-fs-load`                           | ~0s self  | 7     | —                  |

Observations:

- `legacy-load-deps` is **50% of all load self-time** — still dependency-object materialization on
  cache _hit_, not resolution. Per-component it improved (137ms → 104ms, −24%) but it did not change
  shape. Same picture as June, three months apart.
- `on-load` is **20%** across **2317 calls** (331 components × ~7 handlers). `bit status` passes
  `loadDocs:false`/`loadCompositions:false`, but they are **ineffective on the batch path**:
  `workspace-component-loader.ts:479-480` calls `executeLoadSlot(component)` without forwarding
  `loadOpts` (the single-component path at :1083/:1092 does forward them).
- `workspace.get` shows **3349 calls for 331 components (~10×)** — explained and tested in §4.4.

### 4.3 ⚠️ Aggregate self-time does not predict wall-time — validate before building

The `on-load` row above was tested directly, and the result invalidates the metric this section is
built on. Forwarding `loadOpts` on the batch path (the "one-line fix") was implemented and measured:

| metric                         | without fix | with fix    | result                 |
| ------------------------------ | ----------- | ----------- | ---------------------- |
| `on-load` aggregate self-time  | 13.7s       | 6.6s        | **−52%**               |
| total load self-time           | 68.1s       | 53.5s       | **−21%**               |
| **`bit status` wall (median)** | **9.05s**   | **8.98s**   | **−0.07s — noise**     |
| **peak RSS**                   | **~1228MB** | **~1295MB** | **+67MB — consistent** |

Wall is the median of 9 runs per variant, **interleaved** (A/B/A/B/A/B, recompiling between) to
cancel drift. Drift matters: the same unchanged code measured 9.43s and 8.99s twenty minutes apart,
a larger gap than the effect being tested. RSS is 4 runs per variant with zero overlap between the
two sets.

So halving the aggregate self-time of a stage worth "~1.9s of wall" by the divide-by-concurrency
estimate produced **no measurable wall change**, and cost memory. Two lessons:

1. **Aggregate self-time is a hypothesis generator, not a size estimate.** Spans are summed across
   concurrently-interleaved async work on one JS thread, so most of what is counted is `await` time
   overlapping other work, not critical-path CPU. Dividing by observed concurrency does **not**
   recover wall-time. This is the third time the metric has misled this effort (the earlier "39s"
   correction, the deps-cache fs-scan of #10445, and now this). **Do not size or prioritize work
   from §4.1/§4.2 numbers — A/B the wall-clock first.**
2. ~~Forwarding `loadOpts` costs memory because the cache key embeds it.~~ **Retracted (§4.5).**
   Instrumenting the cache showed every id does get two keys, but **both point to the same object**
   (with or without the fix) — the partial-key entry is later mutated in place into the full
   component. So there is no second copy; the +67MB has some other cause and is unexplained. What
   _is_ true is subtler: the key records what the caller _asked for_, not what was loaded — `getMany`
   stores every result under the full key (:203) regardless of its options and ignores
   `storeInCache`. With the forwarding fix, docs-less components would have been served to later
   full `get`s. That's a correctness hazard for partial loading, not a memory one.

**Method for the rest of this effort:** every perf claim lands with an interleaved wall-clock A/B on
`scripts/bench-component-loading.js` and a peak-RSS comparison. No merges justified by profiler
self-time alone.

### 4.4 The `workspace.get` 10× call count: explained, tested, and not worth a cache

Attributing every `workspace.get` call by caller (temporary stack-tally instrumentation, since
removed) on a warm `bit status`:

| caller                                         | calls | note                            |
| ---------------------------------------------- | ----- | ------------------------------- |
| `envs` → `getEnvComponentByEnvId` (`opts={}`)  | 2520  | resolving the **env** component |
| the batch load path (one per component)        | 331   | expected                        |
| `component-dependency-factory`                 | 329   | ~one per component              |
| `envs` (with `loadExtensions/executeLoadSlot`) | 162   | a second envs path              |
| misc                                           | 7     |                                 |

**80% of all `workspace.get` calls are the envs aspect re-resolving the env component** — and this
workspace has **4 distinct envs**. `getEnvComponentByEnvId`
(`scopes/envs/envs/environments.main.runtime.ts`) does `host.get(envId)` on every call, and its
callers (dependency-resolver, dev-files, preview, and the env-descriptor path) each run per
component.

Memoizing it by `envId` was implemented and measured:

| metric                        | without memo | with memo | result                     |
| ----------------------------- | ------------ | --------- | -------------------------- |
| `workspace.get` calls         | 3349         | 835       | **−75%**                   |
| `workspace.get` self-time     | 5.48s        | 5.09s     | −0.39s — **nearly free**   |
| `bit status` wall (median, 9) | 9.59s        | 9.45s     | −0.14s (−1.5%), consistent |
| peak RSS                      | ~1234MB      | ~1246MB   | +12MB, within noise        |

**Conclusion: real but small, and the wrong fix.** Removing 75% of the calls moved
`workspace.get` self-time by only 0.39s, which proves those 2514 calls were already cheap cache
hits — the alarming 10× count was a **third red herring**, consistent with §4.3. The 1.5% wall gain
is genuine but would be bought by adding a 12th ad-hoc cache, with its own invalidation surface, to
a system whose stated core problem (§1.2) is _~11 uncoordinated caches_. That is the anti-pattern
this effort exists to remove.

**Where it belongs instead:** this is direct evidence for the standalone **`EnvResolver`** of §2.4 —
env identity is asked for constantly and should be resolvable from S0-S2 data with one owner and one
cache, rather than by loading a full env Component through the general loader 2682 times. Fold it
into Phase 5, and do not bolt on a point-memo before then.

### 4.5 A real CPU profile: a third of `status` is the object layer, and it was thrashing

The span profiler (§4.1-4.4) misled three times, so `bit status` was profiled with V8 instead
(`node --cpu-prof`). V8 samples measure on-thread time, which _does_ sum to wall-time (9.17s
sampled: 7.7s JS/native, 0.83s GC, 0.46s idle). **Use this, not `BIT_LOAD_PROFILE`, to decide
where to work.**

The dominant cost is not in the component loader at all: **`@teambit/objects` is 1.7s self / 3.1s
inclusive** — about a third of wall. Mostly `parseObject` (1.1s, Version/ModelComponent/Source
JSON parsing). Counting parses per hash showed **half of them were repeats**: status touches ~4,700
distinct objects, and the `Repository` LRU was capped at **3,000 objects**, so it evicted and
re-parsed ~4,000. Caching everything costs ~124MB inflated (22MB on disk).

The count cap had been lowered twice for OOM reasons (10K → 5K → 3K), and objects range from bytes
to ~1.7MB, so raising the count would repeat a known mistake. Fixed instead by **bounding the cache
by approximate inflated bytes** (256MB default) — [#10723](https://github.com/teambit/bit/pull/10723) (merged):

| interleaved A/B                   | old (3,000 objects) | byte budget | result                |
| --------------------------------- | ------------------- | ----------- | --------------------- |
| `bit status` wall (median, 8)     | 8.64s               | 7.37s       | **−1.27s (−15%)**     |
| `bit status` wall range           | 8.50-8.91s          | 7.36-7.48s  | no overlap, 8/8 pairs |
| `bit status` peak RSS             | ~1305MB             | ~1130MB     | **~−170MB**           |
| `bit graph --json` wall (3 pairs) | 20.91s              | 19.94s      | −0.97s (−5%)          |
| `bit list` / `bit show`           | —                   | —           | neutral               |

It wins on memory too, but not because the old cache retained duplicates: only ~78 duplicate copies
(2.6MB) were live at the end of the old run. The win is **churn**: each of the ~4,000 re-parses
inflated and parsed a fresh copy that became garbage, so the old policy did 8,702 parses vs 4,715.
Peak `arrayBuffers` fell ~214→~103MB, peak `heapUsed` ~840→~768MB, and GC time ~820→~635ms. This is
the first change in this effort that moved wall-time by more than noise — and none of the phases
pointed at it.

**The cache is essential, but a byte budget alone has a cliff.** With the cache disabled (`max 1`),
`status` takes 22.4s with 31,213 parses. A workspace whose working set exceeds the budget falls back
to master's thrashing, and was slightly _worse_ than master at 3×. So #10723 also added a **weak layer** (`LiveObjects`, `objects/live-objects.ts`): a
hash → `WeakRef` map with a `FinalizationRegistry`. On an LRU miss, it returns the object if
something else (e.g. a loaded component) still references it; it never keeps anything alive by
itself. Objects too big for the LRU (>100KB compressed) are tracked there too. Alone it's
insufficient (9.5s vs 7.7s: most objects are unreferenced between uses); on top of the LRU it's a no-op while
the budget fits and removes the cliff when it doesn't. Simulated larger workspaces (both limits
shrunk by the same factor, `status`, median of 2, builds alternated):

| simulated size | master         | byte budget    | byte budget + weak |
| -------------- | -------------- | -------------- | ------------------ |
| this repo      | 8.9s / 1317MB  | 7.7s / 1140MB  | 7.8s / 1110MB      |
| 3×             | 10.5s / 1629MB | 11.2s / 1683MB | **8.7s / 1200MB**  |
| 5×             | 12.1s / 1934MB | 12.1s / 1874MB | **9.2s / 1303MB**  |

Correctness notes for anyone touching it: a `ModelComponent`'s hash is name-based, so one hash maps
to different content over time — every path that writes, removes, or clears the LRU must update the
weak map too (`_writeOne` only after the write succeeds; `removeFromCache`; `clearObjectsFromCache`).

Other hotspots from the same profile, not yet acted on (each needs its own A/B):

- `ModelComponent.versionsIncludeOrphaned` — a getter that spreads `{...versions,
...orphanedVersions}` on **every access** (~375ms). Components in this repo have thousands of
  tags; `sources.get` calls it to read a single key.
- `getTagOfRefIfExists` — linear scan over all tags (~150ms self).
- `Version.calculateHash` from `isComponentModified` (~285ms).
- `status` parses ~3,300 `Source` objects (file contents from the model): the "lazy file contents"
  item of Phase 2 would remove these parses entirely, not just the repeats.
- The **component** caches are capped at **500**. This workspace has 339, so it never thrashes —
  but a >500-component workspace would re-load whole components, a far steeper cliff than this one.
  Worth measuring on a large workspace before anything else in Phase 3.

---

## Status

| Phase                   | State                                           | OpenSpec change                | PRs                                                                                                                           |
| ----------------------- | ----------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 1 — Observability       | done                                            | `component-load-observability` | [#10418](https://github.com/teambit/bit/pull/10418)                                                                           |
| 2 — Quick perf wins     | re-scoped, 1/7 done; object-cache fix merged    | —                              | [#10445](https://github.com/teambit/bit/pull/10445) (closed, not merged), [#10723](https://github.com/teambit/bit/pull/10723) |
| 3 — Cache consolidation | not started — premise disproved, demoted (§4.5) | —                              | —                                                                                                                             |
| 4 — Staged pipeline     | not started                                     | —                              | —                                                                                                                             |
| 5 — Env planner         | not started                                     | —                              | —                                                                                                                             |
| 6 — Legacy inversion    | not started                                     | —                              | —                                                                                                                             |

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
- 2026-09-22 — **Phase 2 reassessed after a 3-month gap.** Re-baselined (§4) and re-profiled (§4.2).
  Findings:
  1. `status` −16% / `graph` −9% / `show` −29% since June, **with no Phase-2 item shipped** — the
     gains came from targeted fixes landed outside this effort. Peak RSS regressed (`graph` +339MB,
     `list` +124MB); nothing currently targets memory.
  2. The structural conclusion is confirmed a second time: `legacy-load-deps` is now **50% of all
     load self-time**, still materialization-on-cache-hit. Phase 4 is the lever; Phase 2 was never
     going to move it. Phase 4 promoted to the next high-value target.
  3. Found the concrete cheap win: `bit status` already sets `loadDocs:false`/`loadCompositions:false`
     but the batch path drops them (`workspace-component-loader.ts:479-480` doesn't forward
     `loadOpts`), leaving ~1.9s of `on-load` work on the table across 2317 handler calls.
  4. New unexplained signal: `workspace.get` is called **3349× for 331 components (~10×)**.
  5. **The cheap win was implemented and rejected on measurement** (§4.3). Forwarding `loadOpts`
     halved `on-load` self-time but moved wall by −0.07s (noise) and cost +67MB RSS, because the
     component cache keys on `loadDocs`/`loadCompositions` and so stores a second copy. This
     invalidated the prioritization metric: **aggregate self-time does not predict wall-time**, for
     the third time in this effort. Phase 4 is therefore _not_ promoted on the strength of the
     `legacy-load-deps` 50% figure; **Phase 3 (cache consolidation) is promoted instead**, since the
     loadOpts-in-cache-key problem blocks every partial-loading idea in Phases 2 and 4. All further
     perf claims require an interleaved wall-clock A/B plus peak-RSS comparison.
  6. **The `workspace.get` 10× count was chased down and also rejected** (§4.4). 80% of the 3349
     calls are the envs aspect re-resolving one of only 4 distinct envs. Memoizing removes 75% of
     the calls for −0.14s (−1.5%) wall — real, but it buys that by adding a 12th ad-hoc cache to the
     ~11 the effort exists to consolidate. Recorded as evidence for the §2.4 `EnvResolver` (Phase 5)
     instead. Net result of this session: three candidate quick wins investigated, **all three
     rejected on measurement**, and the prioritization metric itself invalidated.
     PR #10445 closed unmerged (see §3 for the rationale). The abandoned May branch
     `refactor/component-loading-v2-take-3` (`UnifiedComponentLoader` behind `BIT_LOADER=new`) predates
     this document and is superseded by the phase plan — not to be resumed.
- 2026-09-22 — **Phase 3 started, and its premise disproved in the first hour.** Instrumenting the
  component cache found one object per id (two keys, same object), so consolidating it saves no
  memory; §4.3's explanation of the +67MB was wrong and is retracted. Switched tools: a V8 CPU
  profile (`node --cpu-prof`) — unlike span self-time, it sums to wall — showed a third of warm
  `status` in `@teambit/objects`, half of whose parses were repeats caused by the 3,000-object LRU
  cap. Bounding that cache by bytes instead ([#10723](https://github.com/teambit/bit/pull/10723)):
  `status` **−15% wall, ~−170MB RSS**, `graph` −5%, others neutral (§4.5). First change in this
  effort to move wall-time beyond noise. Phase 3 demoted; next candidates are the remaining §4.5
  hotspots, each gated on its own A/B.
- 2026-09-24 — **#10723 merged** (`9307c9c6a`). Beyond the byte budget, it added a weak layer over the
  objects LRU after simulation showed the budget alone regresses to master (slightly worse at 3×)
  once a workspace outgrows it; with the weak layer, 3×/5× stay 17-24% faster and 26-33% leaner
  than master (§4.5). Also recorded why RSS dropped: fewer throwaway copies from re-parsing
  (8,702 → 4,715 parses), not retained duplicates.
