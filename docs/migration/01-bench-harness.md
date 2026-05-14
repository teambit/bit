# Chunk 01 — Startup Benchmark Harness

| Field | Value |
| --- | --- |
| Depends on | — |
| Blocks | meaningful claims about 03, 04, 05, 07, 10 |
| Risk | Low |
| Effort | ~2 days |

## Goal

Build a reproducible benchmark that measures Bit CLI startup time across a small
set of representative scenarios. **No behavior change.** This chunk lands
before any architectural work so we have ground truth.

## Why first

Every later chunk will claim "X is faster". Without a committed baseline and a
PR-gate harness, those claims are unverifiable and we'll lose ground silently.
The harness is also the artifact that proves §11 of the RFC at production
scale (the prototype proved it on a toy).

## Scope

A new directory `scripts/bench/` containing:

1. `bench-startup.mjs` — measures wall-clock for a fixed set of scenarios.
2. `bench-aspect-load.mjs` — measures per-aspect cost in isolation (one aspect
   imported per fresh Node process).
3. `fixtures/` — pre-built workspaces of various sizes (no-workspace,
   small ~20 components, large ~500 components).
4. `report.mjs` — formats results into a markdown table; writes
   `bench-results/<timestamp>.json` for trend tracking.

## Scenarios measured

| Scenario | Args | Workspace |
| --- | --- | --- |
| version | `--version` | none |
| help | `--help` | none |
| typo | `bogus-command` | none |
| status-empty | `status` | no workspace |
| status-small | `status` | fixtures/small |
| status-large | `status` | fixtures/large |
| install-small | `install --help` | fixtures/small (registers but doesn't run) |
| compile-small | `compile --help` | fixtures/small |

Each scenario runs **10 times** (configurable). Report keeps `min`, `median`, `p95`.

## Per-aspect isolated import

```sh
node scripts/bench/bench-aspect-load.mjs --aspect teambit.component/status
```

Spawns a fresh Node process that does only:
```js
const t0 = performance.now();
await import('@teambit/status');
console.log(performance.now() - t0);
```

Iterates over every core aspect from `scopes/harmony/bit/manifests.ts`. Output:
`aspect-import-times.csv` with columns `aspect_id,min_ms,median_ms,p95_ms`.

This is what the prototype's §11.3 #5 learning required: per-aspect numbers
attributed cleanly, not smeared by parallel-load thread contention.

## Implementation notes

- Use Node's `child_process.spawnSync` for cold runs; do **not** reuse a process.
- Disable the V8 compile cache (`NODE_COMPILE_CACHE=`) for "cold" runs; enable it
  for a separate "warm" column.
- Run with `NODE_OPTIONS=--no-warnings --experimental-vm-modules` if necessary
  to avoid deprecation noise polluting timing.
- Use `performance.now()` inside the subprocess for timing; communicate via
  stdout (JSON line) to the parent.
- Always run on a quiet machine; the harness should print a stderr warning if
  the host load average is high.

## CI integration

A new GitHub Actions workflow `bench.yml`:

- Runs on PRs that touch `scopes/`, `components/`, `package.json`, or this
  harness.
- Compares median against `main` baseline.
- **Fails the PR** if any scenario regresses by >10%.
- Comments the diff table on the PR.

Baseline file lives at `scripts/bench/baseline.json` and is updated on
`main` merges via a separate workflow.

## Acceptance criteria

- [ ] `node scripts/bench/bench-startup.mjs` produces a markdown table.
- [ ] `bench-aspect-load.mjs` produces a CSV with one row per core aspect.
- [ ] `bench-results/<sha>.json` is written and consumable by `report.mjs`.
- [ ] Baseline numbers for current `main` are committed to
      `scripts/bench/baseline.json`.
- [ ] CI workflow `bench.yml` runs on PRs and fails on >10% regression.
- [ ] README in `scripts/bench/` documents how to run, how to interpret, and
      how to update the baseline.

## Risks

- **Noisy CI runners.** Mitigation: median over 10 runs; warn on load avg.
- **Cold-cache differences across CI machines.** Mitigation: compare deltas
  vs same-PR baseline, not absolute numbers.
- **Benchmark gaming.** Future chunks might game scenarios. Mitigation: add new
  scenarios as the architecture evolves; never delete old ones.

## Files touched

- `scripts/bench/` (new directory)
- `.github/workflows/bench.yml` (new)
- Possibly `package.json` (new script `npm run bench`).

## Out of scope

- Memory profiling (a future, separate chunk).
- Microbenchmarks of individual functions.
- Stress tests under load — we want clean wall-clock startup numbers.
