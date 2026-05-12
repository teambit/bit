# Spike — Consolidated host: can we delete `WorkspaceComponentLoader`?

**Status:** read-only research. No code shipped. Goal: decide whether the orchestration complexity in `workspace-component-loader.ts` (1029 LoC) is _essential_ (lives there for a real reason) or _accidental_ (lives there because of historical layering). If accidental, what does the consolidated replacement look like, and how big is it?

**Companion:** `02-loader-host-sketch.ts.txt` — a code sketch (NOT for compilation) showing the proposed shape of `WorkspaceLoaderHost` after absorbing the essential logic. Strawman, not final.

## Method

1. Read every block of `workspace-component-loader.ts`. Classify each as:
   - **Essential** — solves a real problem; must move somewhere
   - **Accidental** — bookkeeping that exists because of layering; deletable
   - **Noise** — debug helpers and types that can move to side files
2. Estimate the line count of the consolidated replacement.
3. Identify the hardest part of the consolidation; describe it.
4. Verdict: feasible or not.

## Line-by-line classification

| Block                                                            | Lines    | Class        | Disposition                                                                                               |
| ---------------------------------------------------------------- | -------- | ------------ | --------------------------------------------------------------------------------------------------------- |
| Type definitions (LoadGroup, etc.)                               | 29–87    | Noise → trim | Slim to ~20 lines (LoadGroup metadata vanishes with groups)                                               |
| 4 in-memory caches + their init                                  | 90–117   | Accidental   | **Delete.** Stage-1 `ComponentCache` is the replacement.                                                  |
| `getMany` public                                                 | 119–174  | Essential    | Shrinks to ~30 lines once cache-management moves to unified loader                                        |
| `getAndLoadSlotOrdered`                                          | 176–216  | Accidental   | **Delete.** Replaced by two-pass design (see below).                                                      |
| `buildLoadGroups`                                                | 218–341  | Accidental   | **Delete.** Topo-sort moves to a narrower helper for envs only.                                           |
| `regroupEnvsIdsFromTheList`                                      | 358–378  | Essential    | Becomes part of the env topo-sort (~15 lines).                                                            |
| `regroupExtIdsFromTheList`                                       | 380–388  | Noise        | Already a TODO stub. Delete or fold into env topo-sort.                                                   |
| `getAndLoadSlot`                                                 | 390–448  | Accidental   | **Delete.** Logic redistributes across 2-pass shape.                                                      |
| `loadCompsAsAspects`                                             | 451–490  | Essential    | Keep nearly as-is. ~40 lines.                                                                             |
| `populateScopeAndExtensionsCache`                                | 492–523  | Accidental   | **Delete.** Only exists to feed `buildLoadGroups`.                                                        |
| `warnAboutMisconfiguredEnvs`                                     | 525–528  | Essential    | Keep. 4 lines.                                                                                            |
| `groupAndUpdateIds`                                              | 530–553  | Essential    | Keep. Splits workspace/scope IDs. ~25 lines.                                                              |
| `isInWsIncludeDeleted`                                           | 555–561  | Essential    | Keep. 7 lines.                                                                                            |
| `getComponentsWithoutLoadExtensions`                             | 563–680  | Mixed        | Core call to `consumer.loadComponents` survives; ~70 lines of error-handling shrink to ~30.               |
| `getInvalid`                                                     | 682–701  | Essential    | Keep. 20 lines.                                                                                           |
| `get` (public)                                                   | 704–735  | Essential    | Shrinks to ~15 lines (cache logic moves out).                                                             |
| `getIfExist`                                                     | 737–746  | Essential    | Keep. 10 lines.                                                                                           |
| `resolveVersion`                                                 | 748–755  | Essential    | Keep. 8 lines.                                                                                            |
| `addMultipleEnvsIssueIfNeeded`                                   | 757–764  | Essential    | Keep. 8 lines.                                                                                            |
| `clearCache` / `clearComponentCache`                             | 766–788  | Accidental   | **Delete.** Unified `ComponentCache.invalidate` replaces.                                                 |
| `loadOne`                                                        | 790–844  | Essential    | The core "build a harmony Component from disk" — keep, ~50 lines after simplification.                    |
| `saveInCache` / `getFromCache`                                   | 846–872  | Accidental   | **Delete.** Unified cache.                                                                                |
| `getConsumerComponent`                                           | 874–898  | Essential    | Keep. 15 lines.                                                                                           |
| `isComponentNotExistsError`                                      | 900–902  | Essential    | Keep. 3 lines.                                                                                            |
| `executeLoadSlot`                                                | 904–967  | Essential    | Keep nearly as-is. The deps-policy merge + env calc + slot fire is the only place this exists. ~65 lines. |
| `newComponentFromState` / `upsertExtensionData` / `getDataEntry` | 969–987  | Essential    | Keep. ~15 lines combined.                                                                                 |
| `createComponentCacheKey` / `sortKeys`                           | 990–997  | Accidental   | **Delete.** Phase-based keying.                                                                           |
| `printGroupsToHandle` / `loadGroupToStr`                         | 999–1029 | Noise        | Move to a debug.ts side-file or delete (`BIT_LOG=*` already covers).                                      |

## Size estimate for the consolidated replacement

```
Essential code preserved:
  - groupAndUpdateIds + helpers ........ 35 lines
  - getConsumerComponent + wrapper ..... 15 lines
  - loadOne (simplified) ............... 50 lines
  - executeLoadSlot .................... 65 lines
  - loadCompsAsAspects ................. 40 lines
  - public get/getMany/getInvalid ...... 60 lines  (post-shrink)
  - addMultipleEnvsIssueIfNeeded ........ 8 lines
  - newComponentFromState + helpers .... 15 lines
  - warnAboutMisconfiguredEnvs .......... 4 lines
  - error helpers, types ............... 30 lines
  - the new two-pass orchestration ..... 60 lines  (replaces buildLoadGroups+groupOrdered+slotPerGroup)
  - env-only topo sort .................. 25 lines  (replaces regroupEnvsIdsFromTheList)
                                        ─────────
                                        ~407 lines

Today's WorkspaceComponentLoader:        1029 lines

Net reduction:                           ~600 lines deleted (-58%)
Plus 4 in-memory caches' setup/teardown removed entirely
Plus ~150 lines of WorkspaceLoaderHost stays at ~150 (mostly the hash + adapter glue)
```

**Result: the host adapter at ~400 lines (vs. 1029) is achievable.** Not by being clever — by removing the "build groups, run groups in order, with caches between groups" structure and replacing it with a two-pass shape that doesn't need groups.

## The hard part: the two-pass design

The reason today's code is structured around `buildLoadGroups` is real:

- Component A's `executeLoadSlot` reads A's env via `envs.calcDescriptor`
- That env reading requires the env to be loaded as an aspect (registered in the env-aspect runtime)
- The env is itself a workspace component
- So the env must complete its own `executeLoadSlot` + `loadCompsAsAspects` _before_ A's `executeLoadSlot` can run

Today's solution: build groups in topological order (envs first, components last), run them sequentially.

Proposed two-pass design eliminates groups:

```
Pass 1 — Build all Components with extensions resolved, no slots fired
   ├─ consumer.loadComponents(allWorkspaceIds, loadOpts={loadExtensions:false, executeLoadSlot:false})
   ├─ scope.getMany(allScopeIds)                ─┐ run in parallel — no aspect runtime needed
   └─ for each: workspace.componentExtensions  ─┘ to merge extensions

   Output: Component[] with state.aspects populated from config, but state.aspects[*].data may be empty
           (no onLoad has fired yet to populate that data)

Pass 2 — Identify env/aspect subset, load them as aspects in topo order
   ├─ aspectIds = components.filter(c => isEnv(c) || isApp(c) || isAspect(c))
   ├─ topoOrder = sortByAspectDependency(aspectIds)   ← only ~10-20 components for bit6
   └─ for env in topoOrder (sequential):
        ├─ executeLoadSlot(env)              ← fires its onLoad
        └─ loadCompsAsAspects([env])         ← registers env as aspect

   Output: env-aspect runtime now has every env registered

Pass 3 — Fire slots on remaining (non-env-aspect) components in parallel
   ├─ remaining = components.filter(c => !aspectIds.includes(c.id))
   └─ pMapPool(remaining, executeLoadSlot)   ← parallel; envs are registered

   Output: every Component has onLoad fired with the full env-aspect runtime available
```

**Key insight:** the topological constraint _only applies to the env/aspect subset_. The 290 non-aspect components don't depend on each other for aspect-loading purposes — they only depend on their env being registered. So topo-sort the 20 envs; parallel-process the 290 consumers.

This is structurally simpler than today's "build groups across all 311, run each group sequentially." Today's code is solving a strictly harder problem than it needs to.

## What about the edge cases?

The audit above is optimistic. Let me name the edge cases that the current group machinery handles and the two-pass design must also handle:

1. **Env of env of env** — bit6's own `aspect-env` is the env of `node-env` which is the env of regular components. Pass 2's topo-sort must recurse. The current `regroupEnvsIdsFromTheList` notes this is non-recursive today and "in the future we might want to make it recursive." If it's not recursive today and works, it's because env-of-env-of-env chains in practice are 1 level deep. Two-pass design just needs the proper topo-sort, ~15 lines instead of `regroupEnvsIdsFromTheList`'s 20.

2. **Apps and "regular" aspects (non-envs) that other workspace components depend on** — same shape as envs. Pass 2's subset is "anything that other components consume as an aspect." The detection logic from `loadCompsAsAspects` (lines 456–481) ports directly.

3. **Components that don't exist in the workspace (scope-only)** — Pass 1 already loads them via `scope.getMany`. Pass 2 skips them (scope components don't get onLoad-fired by the workspace — that's `executeLoadSlot`'s comment about "we don't want to load aspects of scope components"). No change needed.

4. **The `componentLoadedSelfAsAspects` dedup map** — Pass 2 sorts the subset and processes each once. The map becomes unnecessary because we explicitly enumerate the set we're loading. Net: 1 cache field deleted, simpler invariant.

5. **`loadOpts.loadExtensions: false` / `executeLoadSlot: false`** — today's flags exist because callers can ask for partial loads. Stage-1 design retracted that (every Component handed to user code is at `aspects` phase). So these flags vanish, simplifying the body of `getAndLoadSlot` by ~50 lines.

6. **Error handling for invalid components** — today's `getComponentsWithoutLoadExtensions` has ~70 lines of try/catch for various error types. About half is error-typing, half is bookkeeping. After the two-pass shape, errors collect into a single `invalidComponents` array in each pass and merge at the end. ~30 lines.

The only edge case that could blow up the spike is the **recursive env-of-env**. If bit-the-tool encounters genuinely-deep env chains (3+ levels) in real workspaces, the topo-sort must be recursive. That's still ~25 lines of clear code (build a directed graph of envIds → envId, topo-sort it), not a structural problem.

## What this spike does NOT prove

- **Performance.** Two-pass design _should_ be faster (no group-by-group serial waiting), but until measured, this is hypothesis. The benchmarks would happen after a prototype.
- **All e2e tests pass.** The big unknown. Specific subtle behavior in `executeLoadSlot` (the deps-policy merge, env extension merging, multiple-env detection) might depend on ordering that we don't see.
- **Aspect loading is monotonic.** `aspectLoader.loadAspects` is treated as if "once loaded, always available." Verify this — if there are reload paths that bust the registry mid-batch, Pass 2's order matters more than the sketch admits.
- **`executeLoadSlot` is reentrancy-safe.** If onLoad slot subscribers themselves call back into `workspace.get` (which is the source of finding 2's OOM), Pass 3's parallelism could re-trigger. Mitigation: Pass 3 parallel pool must have bounded concurrency (already does via `concurrentComponentsLimit()`).

These are not blockers; they're verification work for the implementation phase.

## Verdict

**Feasible.** The complexity in `workspace-component-loader.ts` is largely accidental: it's a per-group state machine where the groups exist to navigate the env→aspect topology in a particular order. Replacing the state machine with a two-pass design that topo-sorts only the env/aspect subset removes ~600 lines without losing any essential behavior.

The consolidated host lands at roughly **400 lines** in `workspace-loader-host.ts`, replacing **1029 lines** in `workspace-component-loader.ts` plus the 150-line existing host. The unified loader (already ~300 lines from stage 1) becomes the _only_ entry point for `Workspace.get` / `Workspace.getMany` / `Workspace.list`.

The cost is the verification phase: every e2e scenario that exercises env-of-env, multiple-env-per-component, or component-load-during-aspect-load must pass under the new shape. Stage-1's `BIT_LOADER=new` infrastructure already runs all e2e under the new path, so the verification is observable in CI.

The single biggest concrete risk is the recursive env-of-env case (edge case #1), which today is handled non-recursively because in practice it doesn't recurse. If a user workspace has env-of-env-of-env that worked before because of a serendipitous group ordering, the two-pass design's explicit topo-sort might surface a bug the current code accidentally avoided.

## Recommendation

Proceed with the consolidation as **stage 2 work** (inverting the original stage 2 / stage 3 ordering). Concretely:

1. **Write the two-pass orchestration** inside a new method on `WorkspaceLoaderHost`, alongside today's `loadAtPhase` / `loadManyAtPhase`. Don't delete anything yet.
2. **Gate by an env flag** (e.g. `BIT_LOADER_HOST=v2`) so we can A/B compare with the current host implementation.
3. **Run e2e under both flags** in CI. Fix divergences.
4. **Promote v2 to default** once green. Delete `WorkspaceComponentLoader`.

This is structurally identical to the stage-1 dual-mode strategy, just one level down. Same risk profile, same rollback story.

After the consolidation: the perf-bearing work from `design-stage2-perf.md` (cache short-circuit in `unified.getMany`, Lever 1) lands trivially on top because there's only one path to optimize.

## Counterfactual: what if the spike is wrong?

If, during prototyping, the two-pass design reveals that the env-aspect topology has hidden bidirectional dependencies (e.g. an env's onLoad reads data that some other component's onLoad has computed), then the two-pass shape isn't sufficient. We'd fall back to:

- **Plan B:** keep groups but simplify within each group. ~600 lines, not 400.
- **Plan C:** keep the current structure but absorb the cache layer into the unified loader. ~800 lines. Improvement is marginal; we accept the current shape.

The spike's confidence in 400 lines rests on env-aspect dependencies being one-directional (envs are providers, consumers don't write back to envs). The current code's group structure suggests this holds, but the prototype must verify.

## Concrete next step if approved

Convert this spike into a fresh task block in `tasks.md`:

```
## 8.x — Stage 2 consolidation (replaces 8.11-8.15 and most of 8.x)

- [ ] Prototype `WorkspaceLoaderHostV2` with the two-pass design.
      Live alongside the existing host; gate via BIT_LOADER_HOST=v2.
- [ ] Run e2e suite under BIT_LOADER_HOST=v2. Fix divergences.
- [ ] Promote v2 to default. Delete WorkspaceComponentLoader.
- [ ] Delete the 4 in-memory caches it owned.
- [ ] Land Lever 1 (cache short-circuit in unified.getMany) — trivial now.
- [ ] Re-benchmark; target sub-second warm `bit status`.
```

The original 8.11–8.15 (cache-invalidation narrowing) become irrelevant under the new plan — the user noted that the full-clear sites are probably correct, and the consolidation makes invalidation simpler anyway (one cache, one invalidate API).
