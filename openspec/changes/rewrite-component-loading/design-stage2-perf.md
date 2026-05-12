# Stage-2 perf strategy (supplements `design.md`)

**Status:** design only — captures decisions made in the 2026-05-12 explore session for task 8.10. Replaces the implicit "skip phases to gain perf" framing in `design.md` with an explicit caching-first plan. No code changes in this doc.

**Audience:** anyone picking up tasks 8.2–8.7 or 9.x. Read `design.md` first for stage-1 context; this doc is the corrected stage-2 view.

## Two clarifications that changed the strategy

During the explore session, two facts surfaced that the original `design.md` did not account for. Both narrow the perf-win design.

### Clarification 1: Aspects must always be loaded for a Component to be complete

`design.md` framed the perf win as "callers ask for a lower phase; loader does less work." That framing assumed sub-aspects phases produce a usable `Component` — i.e. that downstream code can consume a `Component` whose `aspects` phase hasn't run.

**That assumption is wrong.** Registered onLoad slots populate Component state during aspect loading; downstream code reads that state without checking whether the slot fired. A Component returned at a sub-aspects phase is not a partial-but-valid object — it is an incomplete object whose missing fields fail silently when read. The session-learnings "Finding 1" entry from `tasks.md` is the concrete evidence: the 4× cold-status speedup observed by skipping `loadSeedersAsAspects` wasn't free perf, it was missing slot data that broke env-issue detection.

**Implication:** every `Component` handed out by the unified loader to user code must be at the `aspects` phase. Sub-`aspects` phases remain useful as _internal_ build steps (the loader may construct a files-only snapshot to feed dep resolution) but they never escape the loader.

### Clarification 2: "Extensions" and "aspects" are the same thing under two names

The legacy `ConsumerComponent` exposes an `extensions: ExtensionDataList`. The harmony `Component` exposes `state.aspects: AspectList`. These are two views of the same data — the harmony `aspects` is a wrapper around the legacy `extensions` list. `design.md`'s phase table treats them as separate stages (`extensions` → `aspects`), which is a vocabulary artifact, not a real data dependency.

**Implication:** the phase ladder collapses one rung. There is no meaningful boundary between "extensions resolved" and "aspects loaded" — they're the same step expressed in two vocabularies, with the runtime side-effect (aspect onLoad slots fire) attached.

## Retraction: the `design.md` phase model

`design.md` Decision 1 listed five phases:

```
identity → files → dependencies → extensions → aspects
```

with the intent that callers declare their lowest-sufficient phase. Combining clarifications 1 and 2:

- "extensions" and "aspects" collapse into one rung — call it `aspects`.
- Every `Component` returned to user code is at `aspects`, so caller-facing "declare your phase" is not a viable knob.

The corrected phase ladder, with caller-facing intent annotated:

| Phase          | Contents                                                                               | Caller-facing?                                     |
| -------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `identity`     | `ComponentID` only — no `Component` instance built                                     | **Yes.** `loader.listIds()` (already wired)        |
| `files`        | `Component` with files but no slot data                                                | No — internal build step                           |
| `dependencies` | `Component` with files + deps but no slot data                                         | No — internal build step                           |
| `aspects`      | `Component` complete: extensions resolved, slots fired, env/aspect runtime in registry | **Yes.** Default for every Component-returning API |

This is a smaller ladder than `design.md` advertised, and it removes the "pick your phase for a perf win" mental model. `loader.list({ phase })` simplifies to `loader.list()` returning aspects-phase components; the only sub-aspects API is `loader.listIds()`.

**Existing code is not invalidated by this change.** The `Phase` type, `phaseRank`, `LoaderHost.loadAtPhase`, and `Component.loadedPhase` field built in stage 1 are still useful — but their value is in _caching_, not _skipping_, as the next section explains.

## Reframed: phases are cache keys, not skip-layers

Phases stay in the type system because they're still useful — as **cache key suffixes**. The unified `ComponentCache` is keyed by `(ComponentID, phase)`; a cache hit at `aspects` means we have the complete object. Sub-`aspects` cache entries exist as build artifacts: `files`-phase entries memoize the file snapshot so two `aspects`-phase loads with overlapping inputs reuse the file read.

This is the same data structure designed in stage 1, repurposed:

```
Before (intended):     After (corrected):
─────────────────      ──────────────────
phase = how much       phase = which shape of
       work to do             cached data this is

caller asks for        caller always asks for
lowest sufficient      `aspects` (or `listIds`)
phase

perf win = skip        perf win = cache hit at
work for that          `aspects` phase for the
caller                 majority of components
```

## Where the actual perf wins come from

If we can't skip aspect loading, the perf budget moves to four other levers. Listed in order of expected impact for `bit status` on a 311-component workspace:

### Lever 1 — Cache short-circuit at `unified.getMany`

Today's `componentLoader.getMany` walks every requested ID through per-ID bookkeeping (`buildLoadGroups`, `groupAndUpdateIds`, `populateScopeAndExtensionsCache`) even when most IDs are warm-cache hits.

The unified loader's `getMany` should split on cache state up front:

```
unified.getMany(ids):
  hits, misses = partition ids by cache state
  if misses.empty:        return hits           ← no host call at all
  if misses.length == 1:  host.loadAtPhase(misses[0])
  else:                   host.loadManyAtPhase(misses)
  return hits + freshly-loaded
```

For the common scenario (one component edited, 310 cached), this drops the host call from "process 311" to "process 1." Independently of any change in the host itself.

**Expected impact (warm bit status):** large. The per-ID bookkeeping overhead in `getAndLoadSlotOrdered` is the bulk of warm cost; eliminating it for cache hits should approach the proposal's "sub-second" target.

### Lever 2 — Fine-grained cache invalidation

Today many code paths call `Workspace.clearCache()` (whole-cache nuke) where `clearComponentCache(id)` (single-component) would suffice. The session learnings call out one: `bit cc` blows the world. That command is fine — user asked. The internal invalidation paths are the concern.

A stage-2 audit task: walk every call to `Workspace.clearCache`, `componentsCache.deleteAll()`, `componentsExtensionsCache.deleteAll()`, etc., and narrow each to the smallest invalidation that preserves correctness.

**Expected impact (cold bit status after a one-component edit):** large. If editing one file invalidates only the affected component (plus its direct dependents, if dep-graph affects them), cold-after-edit status approaches warm time.

### Lever 3 — Recursive `workspace.get` hits the cache (OOM mitigation)

Stage 1 worked around the cold-cache OOM by routing `Workspace.get/getMany` through legacy unconditionally. Stage 2 needs to route them through the unified loader to gain Lever 1's benefit — and that's only safe if recursive gets (from `loadCompsAsAspects` → `workspace.loadAspects` → `workspace.get`) reliably hit the cache.

Two pieces:

- The outer batched `getMany` populates the cache before recursion begins. Recursive calls find their IDs already cached.
- For the rare recursive miss, the unified loader routes a single-ID call through `host.loadAtPhase` (per-ID path), not `host.loadManyAtPhase` (batch path). The per-ID path doesn't hit the parallel dep-resolution that causes OOM.

The "cold dep resolution must run sequentially" mechanic the user described already exists in the legacy loader as `shouldRunInParallel` (returns false when the FS dep cache is cold). The unified loader inherits this for free as long as it routes batches through the legacy `getMany`, not through its own concurrency pool.

**Expected impact (cold-cache safety):** keeps the OOM fix in place when routing more calls through the unified loader. Not a perf win directly; it unblocks Lever 1's expansion.

### Lever 4 — Eliminate the legacy→harmony double-build (stage 3)

`design.md` Decision 3 already plans this. It belongs in stage 3 once stage 2 routes everything through the unified loader. Listed here so the stage-2 plan doesn't try to do it prematurely.

## Stage-2 plan (5 steps)

```
Step 1 — Cache short-circuit in unified loader (Lever 1)
  Scope:  scopes/component/component-loader/unified-component-loader.ts
  Risk:   low — adds an early-return; no caller behaviour change
  Test:   bench bit status warm. Expect substantial drop.

Step 2 — Route Workspace.get/getMany through unified loader (Lever 3)
  Scope:  scopes/workspace/workspace/workspace.ts
  Pre:    step 1 must be live so recursive gets hit the cache
  Risk:   medium — touches the hot path
  Test:   bench bit status both cold and warm; verify no OOM
          regression on `bit6 cc && bit6 status`

Step 3 — Audit cache-invalidation call sites (Lever 2)
  Scope:  every Workspace.clearCache / clearComponentCache call
  Risk:   low per-site, but breadth matters; mechanical work
  Test:   edit one file → bit status; expect ~1 cache miss

Step 4 — Per-command migrations (tasks 8.2–8.7)
  Mostly collapses to "no change" given clarification 1 above.
  Audit each task; most become "verify the command already uses
  the loader at aspects phase" rather than "migrate to lower phase".
  Keep open as audit checkpoints; expect zero code change for most.

Step 5 — Re-benchmark (task 7.3 / 10.1)
  Scope:  rerun audit/05-benchmarks-baseline.md commands
  Target: bit status warm < 4s (50% target from baseline);
          bit status cold-after-edit close to warm time
```

Steps 1 and 2 are the perf-bearing work. Steps 3–5 are unblockers and verification.

## What does NOT belong in stage 2

- **Direct-to-harmony build / `asLegacy()` view** — stage 3 (design.md Decision 3, task 9.x).
- **Removing `ConsumerComponent` extension mutations (task 8.8)** — stage-2 design-first work tracked separately; intersects with stage-2 perf only at the `Component` API for in-place phase upgrades (see open question 1 below).
- **A new `Phase` knob exposed to callers** — explicitly removed; sub-aspects phases are internal-only.

## Risks / trade-offs

- **Risk: recursive workspace.get under aspect loading still escapes the cache in edge cases.** Mitigation: log every recursive workspace.get under `BIT_LOG=load`; if real misses recur, add a short-lived per-call dedup map keyed by (callId, id).
- **Risk: cache hit returns a Component reference that a caller mutates, polluting future cache hits.** Mitigation: same as today's caches — callers don't mutate returned Components. Audit on a case-by-case basis if violations show up; the `consumerComponent.extensions = X` mutations in task 8.8 are the known offenders.
- **Risk: bench numbers don't actually move because per-component cost is dominated by something we haven't profiled.** Mitigation: instrument step 1 with `BIT_LOG=load` per-component timings; verify the cache short-circuit reduces the loop time as predicted _before_ shipping step 2.
- **Trade-off: the "phases let callers pick their cost" story in `design.md` is partially retracted.** Migration tasks 8.2–8.7 stay open as audit checkpoints rather than perf work; we should expect most to be no-ops.

## Open questions for stage-2 design follow-ups

### 1. Component API for in-place mutation under phase upgrade

User confirmed in explore (2026-05-12 answer to question 5) that mutation is acceptable — "it's what we do anyway currently." That settles the direction: in-place phase upgrade. But this question intersects with task 8.8: if `consumerComponent.extensions = X` mutations are eliminated (the goal of 8.8), some equivalent mutation surface on harmony `Component` will need to exist to support upgrade. **Recommended:** resolve 8.8's API design together with this — one design doc covering both.

### 2. Cache invalidation granularity audit

A `.bitmap` change today bumps a workspace-wide counter that invalidates everything. Editing one component's source file invalidates that component via `clearComponentCache(id)`. The question for Lever 2: which kinds of `.bitmap` change actually require invalidating every component vs. just affected components? Likely answer: most bitmap changes (adding/removing a tracked component, version bumps) only invalidate the directly-changed entries. **Recommended:** the audit in step 3 produces a `cache-invalidation-rules.md` audit doc as a deliverable.

### 3. Cold vs. warm target reconciliation

User confirmed cold matters because cache invalidation happens during dev. Open: how many components does a typical edit invalidate? The answer determines whether step 3's fine-grained invalidation is high-impact or low-impact. **Recommended:** add a benchmark scenario to `audit/05-benchmarks-baseline.md` — "edit one component, bit status." Compare against warm. If the delta is large, step 3 has clear value; if small, step 3 is bookkeeping.

### 4. Should `loader.list({ phase })` API survive?

Stage 1 built `loader.list(filter?, opts)` accepting a `{ phase }` option. Given clarification 1 (caller-facing phases collapse to `listIds` vs `list`), the `phase` option is dead-code-by-design. Options: (a) remove it now, (b) leave as no-op for forward compat, (c) keep it as a debug knob. **Recommended:** (a) — remove before stage 2 ships so the API surface matches the contract. Affects the migration tasks 8.2–8.7 which all reference `{ phase }` options.

### 5. What about `bit show`, `bit graph`, etc.?

Task 8.2 says "migrate `bit show` to `componentLoader.get(id, { phase: 'files' })`." Given clarification 1, `bit show` returns a `Component` to user-facing rendering code that may read aspect-populated fields. So `bit show` runs at `aspects`. Same logic for `bit graph` — graph rendering may read aspect-populated dependency annotations. **Recommended:** restructure 8.2–8.7 from "pick lowest phase" to "verify the command already runs at aspects, and that the unified-loader cache provides the win without phase tuning." Most become single-line audit confirmations.
