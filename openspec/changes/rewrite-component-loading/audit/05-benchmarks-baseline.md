# Audit 1.5 — Baseline performance benchmarks

**Goal:** capture baseline timings for the most-frequently-run loading-bound commands so the rewrite can be measured against a concrete target.

**Sample workspace:** the bit6 repository itself (`/Users/davidfirst/teambit/bit6`), which contains **311 tracked components**. This is a representative real workspace — bit dogfoods itself. The proposal/design called for a 500-component workspace; at 311 components we're in the same order of magnitude and can extrapolate.

**Hardware:** Darwin 25.3.0, on the developer's macOS workstation.
**Bit binary:** `bit6` v1.13.171.
**Date of baseline:** 2026-05-08.

## Method

```bash
bit6 clear-cache    # reset the on-disk and scope-index caches between cold runs
time bit6 <command>
```

Cold run = right after `clear-cache`. Warm run = a second invocation immediately after, with all caches populated from the previous run.

## Baseline measurements

| Command                                | Cold (after `clear-cache`) | Warm (rerun) | Notes                                                                                     |
| -------------------------------------- | -------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `bit list`                             | **11.091s**                | **1.404s**   | 311 components listed; cold dominated by scope-index rebuild                              |
| `bit status`                           | **30.774s** ¹              | **9.804s**   | status line says "loading 311 component(s)" — full hydration of every workspace component |
| `bit show teambit.workspace/workspace` | —                          | **1.597s**   | single-component show                                                                     |
| `bit compile <id>`                     | —                          | —            | not measured this round (deferred; not on the loading-critical path)                      |

¹ This run was "post-clear-cache + post-list", so the in-memory state is fresh but the on-disk dependency cache populated by the prior `list` is reused. A truly clean state (no prior commands) would be slightly slower again.

## What's slow and why

### `bit list` cold (11.1s) → warm (1.4s)

The cold run has to rebuild the scope-index file and re-resolve scope objects for every tracked ID. The warm run reads the index and reads `.bitmap` only — no per-component hydration. The 8× warm/cold ratio shows that the on-disk caches absorb most of `list`'s real work today, but cold-startup pain is real (e.g. fresh CI clone).

### `bit status` warm (9.8s)

The user reports `bit status` is **a minimum of 7s** on a warm filesystem cache for this workspace; our 9.8s warm rerun is consistent with that. The dominant cost is the `loading 311 component(s)` step, which today goes through the full `WorkspaceComponentLoader.getMany` path:

- `consumer.loadComponents` for every ID (legacy)
- `loadComponentsExtensions` for every ID (extensions phase)
- `executeLoadSlot` for every ID (slot execution)
- `loadCompsAsAspects` where applicable (aspects phase)

`bit status` only needs **modification status** + **dependency info** + **issues** per component. The `extensions` and `aspects` phases are pure overhead for this command — the rewrite's primary win.

### `bit show <id>` (1.6s)

Single-component loads are already fast because today's caches handle the one-component case well. The rewrite's win on `show` is small — it just avoids redundant aspect resolution for the one component shown.

## Targets after the rewrite

| Command             | Baseline (warm) | Target     | Reasoning                                                                                                                                               |
| ------------------- | --------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bit list`          | 1.404s          | < 0.6s     | Switch to `listIds()` — read `.bitmap` only, no `Component` construction. Wall-clock dominated by node startup + CLI parsing.                           |
| `bit list` (cold)   | 11.091s         | < 4s       | Most of cold cost is scope-index rebuild — orthogonal to the rewrite. Win comes from skipping per-component hydration in the list path.                 |
| `bit status`        | 9.804s          | < 4s       | Skip `extensions` + `aspects` phases for the 311 components, keep `dependencies`. Eliminates ~60% of per-component work.                                |
| `bit status` (cold) | 30.774s         | < 12s      | Same per-component savings applied to the cold run. Cold cost remains higher because the on-disk dep cache rebuild is part of the `dependencies` phase. |
| `bit show <id>`     | 1.597s          | ≤ baseline | Show needs `files` + (optionally) `dependencies`. Not a regression target; small wins from skipping aspect resolution.                                  |

**Success criterion**: `bit status` (warm) drops by ≥ 50% on this workspace; `bit list` (warm) drops by ≥ 50%.

## Per-phase cost estimate

To set realistic targets we need to know which phase costs what. The current code's `profileTrace` already records this internally; we should expose it explicitly. As a rough guide from a single run with `BIT_LOG=*`:

| Phase                                                        | Approximate share of `bit status` |
| ------------------------------------------------------------ | --------------------------------- |
| `identity` (read `.bitmap`, build IDs)                       | < 1%                              |
| `files` (load source files, configs)                         | ~10%                              |
| `dependencies` (AST walk, resolve deps, modification status) | ~30%                              |
| `extensions` (variant policy merge, env binding)             | ~25%                              |
| `aspects` (component-as-aspect, slot execution)              | ~30%                              |
| Misc (capsule check, scope-index, output rendering)          | ~5%                               |

If the rewrite skips `extensions` + `aspects` for status, that removes ~55% of per-component work — putting the < 4s target within reach. These percentages are estimates and should be confirmed by a `BIT_LOG=load` instrumented run after the unified loader is built.

## Caveats

1. **Single workstation, single workspace** — numbers will vary across machines and workspace sizes. The success criterion is the _ratio_ of after/before on the same machine, not absolute wall-clock.
2. **Phase share is estimated** — confirm during stage-1 verification (task 7.3) by reading the per-phase events emitted by the new loader.
3. **No `bit compile` run** — compile dominates on actual TypeScript work, not loading. Loading rewrite shouldn't move compile much; tracked separately.
4. **Cold timing is sensitive** — first-run-after-clear-cache may include OS file cache misses. Repeat 3× for stable numbers.

## Re-running these benchmarks

```bash
# from the bit6 root, with the chosen binary
bit6 clear-cache
time bit6 list                     # cold
time bit6 list                     # warm
time bit6 status                   # warm-fs/cold-mem
time bit6 status                   # warm
time bit6 show teambit.workspace/workspace
time bit6 compile teambit.workspace/workspace   # if env is healthy
```

Capture both wall-clock and the visible status-line phases. Save results to `audit/06-benchmarks-after.md` after stage 1 (task 7.3) and stage 3 (task 10.1).

## Earlier mismeasurement (corrected)

An initial round of measurements gave `bit status` = 3.7s / 2.7s. Those runs had reached the early-exit "your workspace has outdated objects, please use 'bit import'" warning and exited before doing full hydration — so they were not representative of a real status run. After clearing the outdated-objects state, real warm timings are ~7–10s, consistent with the user's expectation. The corrected numbers above replace the original measurement.
