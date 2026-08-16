# check_circular_dependencies CI hang/perf regression

Status: **not yet fixed, but there's a strong, specific lead.** It's a single non-terminating
recursive call chain inside `WorkspaceAspectsLoader.loadAspects` (see §5-6), and a near-identical
bug was already diagnosed and fixed on another unmerged branch — porting that fix is the
recommended next step (§6, "Next steps" below). The `check circular dependencies (repo bit)` step
in the `check_circular_dependencies` CircleCI job is currently **disabled** (commented out in
`.circleci/config.yml`) because it reliably times out. Only the non-blocking `bvm bit` comparison
step still runs. Re-enable the repo-bit step once the regression is fixed.

## Symptom

On the `remove-core-envs-from-manifest` branch, CircleCI's `check_circular_dependencies` job
(`.circleci/config.yml` → `scripts/circular-deps-check/ci-check.sh` →
`scripts/circular-deps-check/monitor-workspace-cycle.js`, which runs `bit insights circular
--json`) hung with **zero output** for the platform's default 10-minute no-output timeout, then
got silently killed by CircleCI with no diagnostic info at all:

```
Running workspace cycle monitoring...
🔍 Monitoring workspace cycle...

Too long with no output (exceeded 10m0s): context deadline exceeded
```

This happened repeatedly (not a one-off flake) across several pushes to this branch.

## Investigation timeline

### 1. Hypotheses ruled out

- **`bit` from bvm vs. from the repo**: not the cause. `check_circular_dependencies` already runs
  the repo's own binary (`bit_global_for_npm` symlinks `/home/circleci/bit/bit/bin/bit.js` onto
  `PATH` as `bit`), confirmed directly from real CircleCI job step output (`link bit to path` /
  `which bit` steps).
- **`hub_domain` pointed at staging (`hub-stg.bit.dev`) instead of production**: real and worth
  fixing on its own (this job was the only bit-executing job left on the `hub-stg` default; every
  other one — `bit_pr`, `bit_merge` — uses production `hub` via `setup_bit_environment`), but
  **not the actual cause**. Confirmed by reproducing the identical hang against production
  `hub.bit.dev` too, once the CI diagnostics below were added.
- **Network/registry stall during a live component import**: initially suspected, because building
  the workspace graph does trigger `scopeComponentsImporter.importMany(...)` for objects not yet
  in the local scope (`scopes/workspace/workspace/build-graph-from-fs.ts`). Ruled out once the
  hang was reproduced **locally, offline from CI, in a fresh clone** — see below.

### 2. CI safety-net added (still in place, useful going forward)

Because the original failure gave zero diagnostic output, three things were added first so any
future recurrence is debuggable instead of a silent kill:

- `monitor-workspace-cycle.js`: `execSync('bit insights circular --json', ...)` now has an
  explicit 5-minute `timeout` (previously none — the sibling script `check-circular-deps.js`
  already had one), with a clear timeout-specific error message. Node's timeout kill surfaces as
  `error.killed` **or** a raw `ETIMEDOUT` from `spawnSync` depending on how it fails — both are
  handled.
- `.circleci/config.yml`: `no_output_timeout: 6m` on the check step (well under the platform's
  10m default) and `store_artifacts: ~/Library/Caches/Bit/logs` to persist `debug.log`. Bit writes
  debug-level logs to `debug.log` by default *regardless of `BIT_LOG`* (`DEFAULT_LEVEL = 'debug'`
  in `components/legacy/logger/logger.ts`), so this needed no extra flag. **Do not set
  `BIT_LOG=*`** for this script — it switches Bit's console logger onto **stdout**
  (`destination: 1` in `components/legacy/logger/pino-logger.ts`), the same stream
  `monitor-workspace-cycle.js` pipes and `JSON.parse()`s; it would corrupt the JSON output.
- `scripts/circular-deps-check/check-circular-deps.js` and `monitor-workspace-cycle.js` now
  support a `BIT_BIN` env var override (mirrors e2e's `--bit_bin`), so a specific binary can be
  pinned/compared instead of relying on whatever `bit` resolves to on `PATH`.
- `.circleci/config.yml`'s `check_circular_dependencies` job now sets up **both** binaries and (while
  the repo-bit step is enabled) runs the check with both: the bvm-linked nightly release
  (`bbit`, via the existing `install_bvm`/`bvm_upgrade` commands and the same `.bvm` cache key
  `setup_harmony` already populates that pipeline run) as a non-blocking comparison, and the repo's
  own binary as the real gate. **Ordering matters here**: CircleCI skips steps after a failed step
  unless *that exact step* is marked `when: always` — it does not propagate through a whole
  reusable command's inner steps. The bvm setup (`install_bvm`, `bvm_upgrade`, etc.) must run
  *before* the repo-bit check step, not after, or it silently never executes when the repo-bit
  step fails (this was caught: first attempt produced a false-"successful" 59ms bvm-bit step whose
  actual output was `bbit: command not found`, swallowed by `|| true`).

### 3. Confirmed: it's a real, deterministic regression in this branch's code

Reproduced identically across **four independent environments** — ruling out CI infra, network, and
staging-vs-prod entirely:

| Environment | repo's own `bit` binary | bvm-linked release `bit` (v2.0.77, *not* this branch's code) |
|---|---|---|
| Local existing dev workspace (`bd2` vs global `bit`) | 5m50s | 1m57s |
| CircleCI, repo-bit alone (before comparison job) | 5m3s (script timeout) | — |
| Fresh clone in `/tmp`, bootstrapped like CI (`bit init && bit install`) | 5m1s (script timeout) | 37s |
| CircleCI, both binaries in the same job | 5m2s (script timeout, failed) | 1m18s (succeeded) |

The fresh-clone repro is the cleanest: identical `.bitmap`, identical `node_modules`/`.pnpm`
store, only the binary differs — **37 seconds vs. 5+ minute timeout** for the exact same command
(`bit insights circular --json`) on the exact same workspace state.

### 4. Root cause, take 1 (superseded below): `workspace.ts`'s self-as-aspect guard

`debug.log`, isolated to just the repo-bit run's PID, shows **83,079 log lines**, of which
**81,078 (98%)** fall into two recursive trace chains:

```
workspace.get > consumer-fs-load > workspace.loadAspects > workspace.get > consumer-fs-load > workspace.loadAspects   (40,820 occurrences)
workspace.get > consumer-fs-load > workspace.loadAspects > workspace.get > extension-merge  > workspace.loadAspects   (40,258 occurrences)
```

First hypothesis was `Workspace.get()`'s "try load self as aspect" branch
(`scopes/workspace/workspace/workspace.ts:820-857`), gated by `!this.aspectLoader.isCoreAspect(...)`
— which now returns `false` for the 7 envs this branch removed from the core manifest
(`aspect, babel, env, mdx, mocha, node, react, readme`; see `b23b27368` and siblings), so this
branch — previously skipped entirely for them — now runs for many more components.

**This was disproven directly**: the block was instrumented at runtime (temporary patch to the
compiled `dist/workspace.js` in the disposable `/tmp` clone, all 4 `.pnpm`-hash-variant copies —
see "Reproducing locally" below for why there are multiple copies) with a counter + distinct-id
tracker. Across the full 5-minute timeout, **it was entered zero times**. So this specific call
site is not the one driving the recursion — it's a real, but different, call site producing the
same `workspace.loadAspects` trace label (the label comes from `loadSpan('workspace.loadAspects',
...)` wrapping the *public* `Workspace.loadAspects` method, which has more than one caller).

### 5. Root cause, take 2 (current best understanding): a single non-terminating recursion, not fan-out

Re-reading the same captured `debug.log` for the actual `INFO`-level `"loadAspects, loading N
aspects"` lines (as opposed to the much higher-volume `DEBUG`-level per-file-write lines, which
inflated the "40,820 occurrences" count above and don't each represent a separate `loadAspects`
call) tells a very different story: there are only **109** such lines in the whole run, and **104
of them share one single trace-root id** (`34l369`). That one root started at `18:07:50` and was
*still recursing* at `18:12:47` — essentially the entire 5-minute window — alternating between
`... > consumer-fs-load > workspace.loadAspects` and `... > extension-merge > workspace.loadAspects`,
each iteration loading only "1 aspects" or "2 aspects" before recursing again:

```
[trace:34l369 ... > consumer-fs-load > workspace.loadAspects] loadAspects, loading 1 aspects.
[trace:34l369 ... > extension-merge  > workspace.loadAspects] loadAspects, loading 1 aspects.
[trace:34l369 ... > consumer-fs-load > workspace.loadAspects] loadAspects, loading 2 aspects.
[trace:34l369 ... > extension-merge  > workspace.loadAspects] loadAspects, loading 2 aspects.
... (repeats for 5 minutes, never terminates)
```

This is **not** large-but-finite fan-out across many components — it's one call chain that never
resolves, ping-ponging between resolving a component's own definition (`consumer-fs-load`) and
merging its extension/env config (`extension-merge`), both of which call `workspace.loadAspects`.
This is exactly the shape of a genuine mutual/re-entrant recursion between two components (or a
small cluster) whose envs depend on each other — i.e. it's hitting the actual circular dependency
this check exists to monitor, and nothing is breaking the cycle.

### 6. Very likely the same bug, already fixed (unmerged) on another branch

Bit's own commit history has three commits about exactly this class of problem
(`git log --oneline --all | grep -i "in-flight\|re-entrant"`):

- `0f796d993 fix(scope): break re-entrant aspect-load cycles with an in-flight guard` — already on
  this branch (ancestor of HEAD).
- `796f76ce4 fix(workspace): key in-flight aspect loads by full id, collapse versions only for
  legacy core envs` — already on this branch (ancestor of HEAD).
- `f9ae003aa perf(workspace-aspects-loader): in-flight dedup for concurrent loadAspects` — **NOT**
  on this branch. Lives on `origin/refactor/component-loading-v2-take-3-stage2` (David First,
  unrelated in-progress refactor branch). Diverged from us a long way back (merge-base
  `e97daafd1`), so a direct cherry-pick is unlikely to apply cleanly, but the *mechanism it
  describes and fixes* is a near-exact match for what we found:

  > pass1's `consumer.loadComponents` ... fires the `onComponentConfigLoading` subscriber for
  > every component in parallel. Each subscriber calls `workspace.componentExtensions` ->
  > `loadComponentsExtensions` -> `loadAspects` for that component's env. Without dedup, N
  > components sharing one env triggered N parallel `isolator.isolateComponents` calls for the
  > same aspect ... `aspectLoader.isAspectLoaded` only flips true after the load completes, so the
  > per-call filter inside `loadAspects` never caught this race.

  That commit's fix (a per-aspect-id `inFlightAspects` map so concurrent callers await the
  existing promise) measured **`bit status` 5:29 → 0:25 (~13x)** on their workspace.

  It was then **superseded** by a follow-up on the same branch:
  `1213c36c6 perf(workspace-aspects-loader): serialize loadAspects instead of per-id dedup`,
  because the per-id dedup missed a further wrinkle that matches our trace shape *even more*
  closely:

  > The per-id in-flight dedup ... only catches concurrent callers asking for the SAME aspect id.
  > It misses the case that's actually hot during pass1's bulk component load: N parallel
  > `loadAspects` calls for DIFFERENT root aspects, each whose internal scope-aspects-loader
  > recursion walks an env/dep graph that shares core envs (e.g. `core-aspect-env`) — each call
  > independently re-isolates the shared env ... Per-id in-flight dedup (tried first) also misses
  > this because the shared env id isn't in the outer caller's `ids` list — it only surfaces deep
  > inside the recursion.
  >
  > Switch to a serialization queue: each `loadAspects` call awaits the previous one's completion
  > before running. By the time call N+1 enters `loadAspectsInner`, call N has already registered
  > its env aspects via `loadExtensionsByManifests`, so call N+1's per-id `isAspectLoaded` filter
  > catches them and skips re-isolation.
  >
  > `bit status` went from 13:54 -> 10s on this 311-component workspace.

  The fix itself (`scopes/workspace/workspace/workspace-aspects-loader.ts`): replace whatever
  concurrency `WorkspaceAspectsLoader.loadAspects` currently has with a single promise-chain queue
  (`private loadAspectsQueue: Promise<unknown> = Promise.resolve()`), where every call awaits the
  tail of the queue (swallowing the previous call's rejection) before running its own
  `loadAspectsInner`, and `opts.forceLoad` bypasses the queue entirely. See `git show 1213c36c6`
  for the full diff.

  Their numbers (311 components, 13:54 → 10s) and ours (324 components, ~5-6min hang/timeout, and
  1m18s-1m57s on a build that presumably doesn't hit this path as hard) are in the same
  ballpark, and the *reasoning* for why per-id dedup alone isn't enough lines up exactly with our
  single-trace-root, alternating `consumer-fs-load`/`extension-merge` observation.

## What's confirmed vs. still open

**Confirmed:**
- The regression is 100% reproducible, in this branch's code specifically, independent of
  environment/network/caching.
- It's a single non-terminating recursive call chain (`workspace.loadAspects` calling itself via
  nested `workspace.get`), not fan-out across many independent components.
- `Workspace.get()`'s self-as-aspect branch (`workspace.ts:820-857`) is **not** the culprit —
  disproven by runtime instrumentation (zero hits during the hang).
- A near-identical, already-diagnosed-and-fixed bug exists in Bit's own history
  (`f9ae003aa` / `1213c36c6` on `origin/refactor/component-loading-v2-take-3-stage2`), with a
  concurrency/serialization fix in `WorkspaceAspectsLoader.loadAspects`.

**Not yet confirmed:**
- That `1213c36c6`'s serialization fix, ported to this branch's current
  `workspace-aspects-loader.ts`, actually resolves *our* hang (not yet attempted — the branches
  have diverged enough that this needs a manual port, not a cherry-pick).
- The exact call sites in *our* recursion (which two components/envs are ping-ponging under trace
  root `34l369`) — not yet identified by component id, only by span shape.

## Next steps for whoever picks this up

1. **Try the fix first** — read `scopes/workspace/workspace/workspace-aspects-loader.ts` on this
   branch, and port `1213c36c6`'s serialization-queue approach onto it (see `git show 1213c36c6`
   for the reference diff on the other branch). This is the highest-confidence lead by far.
2. Verify with the fresh `/tmp` repro (fast to re-create: clone this branch, `bit init && bit
   install`, then `BIT_BIN="node <clone>/bin/bit.js" node
   scripts/circular-deps-check/monitor-workspace-cycle.js --verbose`) that the hang is gone and
   `bit insights circular --json` completes in roughly the same ballpark as the bvm-bit baseline
   (~1-2min).
3. If it doesn't fully resolve it, identify the two (or more) components/envs actually
   ping-ponging under trace root `34l369` — instrument `WorkspaceAspectsLoader.loadAspects`
   (not `Workspace.get`, which was already ruled out) with an id/counter dump, using the same
   patch-the-compiled-dist-file approach described below (or, better, compile from source once and
   reuse across runs rather than patching `dist/` — this session hit a stray crash
   (`_legacy3(...).ComponentsList is not a constructor`) after patching
   `workspace-component-loader.js` mid-investigation, likely unrelated corruption from a prior
   SIGTERM-killed run leaving a file mid-write, not the patch itself, but a clean recompile avoids
   the ambiguity).
4. Verify against all four repro environments in the table above before re-enabling the repo-bit
   CI step.
5. Re-enable the commented-out `check circular dependencies (repo bit)` step in
   `.circleci/config.yml` once fixed, and consider whether the bvm-bit comparison step /
   `BIT_BIN` support / extra diagnostics added along the way should stay (useful precedent for
   future perf regressions in this same check) or be trimmed back out.

## Reproducing locally

```bash
# fresh clone, bootstrapped the same way CI's setup_harmony does it
mkdir -p /tmp/bit-repro && cd /tmp/bit-repro
git clone --branch remove-core-envs-from-manifest --single-branch <this-repo> bit
cd bit
<bvm-or-other-existing-bit-binary> init
<bvm-or-other-existing-bit-binary> install   # ~6-7 minutes, pulls 331 components + deps

# slow path (this branch's own code):
BIT_BIN="node $(pwd)/bin/bit.js" node scripts/circular-deps-check/monitor-workspace-cycle.js --verbose

# fast path (comparison baseline, a released build unaffected by this branch):
BIT_BIN=<path-to-a-bvm-linked-bit> node scripts/circular-deps-check/monitor-workspace-cycle.js --verbose
```

**Note on patching compiled output for instrumentation**: `node_modules/@teambit/<pkg>/dist/*.js`
is not a single file — pnpm installs multiple content-addressed copies of the same package version
under `node_modules/.pnpm/...` when it's resolved against different peer-dependency contexts (e.g.
`@teambit/workspace` built against `react-dom@18.3.1` in one place and `react-dom@19.2.7` in
another - `find node_modules -path "*@teambit/<pkg>/dist/<file>.js"` shows all of them). If
patching compiled JS directly (faster than a full recompile for a quick instrumentation check),
patch *all* copies - Node's module resolution may load any of them depending on which component's
dependency chain triggers the `require` first, and `glob.glob('**/*.js')` in Python silently skips
`.pnpm` (a dot-directory) unless you use `find` instead.
