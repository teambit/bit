# check_circular_dependencies CI hang/perf regression

Status: **root cause narrowed to a specific function, not yet fixed.** The `check circular
dependencies (repo bit)` step in the `check_circular_dependencies` CircleCI job is currently
**disabled** (commented out in `.circleci/config.yml`) because it reliably times out. Only the
non-blocking `bvm bit` comparison step still runs. Re-enable the repo-bit step once the regression
below is fixed.

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

### 4. Root cause: narrowed to a specific function

`debug.log`, isolated to just the repo-bit run's PID, shows **83,079 log lines**, of which
**81,078 (98%)** fall into two recursive trace chains:

```
workspace.get > consumer-fs-load > workspace.loadAspects > workspace.get > consumer-fs-load > workspace.loadAspects   (40,820 occurrences)
workspace.get > consumer-fs-load > workspace.loadAspects > workspace.get > extension-merge  > workspace.loadAspects   (40,258 occurrences)
```

i.e. `workspace.loadAspects` is recursively re-triggering itself via nested `workspace.get` calls,
at a volume far beyond what a single graph build over 62 cyclically-connected components should
need. By contrast, the bvm-bit run's `insights circular` invocation on the *identical* workspace
produced only 49 log lines total.

Traced to `Workspace.get()` in `scopes/workspace/workspace/workspace.ts:820-857`:

```ts
async get(componentId, legacyComponent, useCache = true, storeInCache = true, loadOpts) {
  const component = await this.componentLoader.get(...);
  const tryLoadAsAspect = this.componentLoadedSelfAsAspects.get(component.id.toString()) === undefined;
  if (
    tryLoadAsAspect &&
    this.envs.isUsingEnvEnv(component) &&
    !this.aspectLoader.isCoreAspect(component.id.toStringWithoutVersion()) &&
    !this.aspectLoader.isAspectLoaded(component.id.toString()) &&
    this.hasId(component.id)
  ) {
    this.componentLoadedSelfAsAspects.set(component.id.toString(), true);
    await this.loadAspects([component.id.toString()], undefined, component.id.toString(), {
      hideMissingModuleError: true,
    });
    ...
  }
  this.componentLoadedSelfAsAspects.set(component.id.toString(), false);
  return component;
}
```

`isCoreAspect(id)` (`scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts:311`) just checks
membership in the core-aspect-id manifest. This branch's entire purpose is removing
`aspect, babel, env, mdx, mocha, node, react, readme` from that manifest (see commit
`b23b27368 feat(envs): remove aspect and env envs from the core manifest` and siblings). So for
every component using one of these now-non-core envs, `isCoreAspect()` flips `true` → `false`,
and this "try load self as aspect" branch — previously skipped entirely for them — now runs.

**Working hypothesis** (not yet fully confirmed): in a workspace with genuine circular
dependencies among ~62 components — exactly what this check exercises — this newly-unlocked path
cascades: loading component A (using a former-core env) triggers `loadAspects(A)`, which needs
component B (a related env/aspect dependency), which also now qualifies for the same branch and
triggers `loadAspects(B)`, and so on through the cycle. The `componentLoadedSelfAsAspects` guard is
keyed by exact `component.id.toString()` (**with version**) and sized at 500 entries (bigger than
the 324-component workspace, so plain LRU eviction was ruled out as the mechanism) — worth
double-checking whether the guard is ever bypassed by ID-string variance (e.g. versionless vs.
versioned references to the same logical env — this branch also has substantial "versionless env
slot matching" work, see `cfea063ae`, `446416efe`, `4caa63f1c` and siblings) rather than the count
of distinct components alone explaining the ~40,000x call volume.

## What's confirmed vs. still open

**Confirmed:**
- The regression is 100% reproducible, in this branch's code specifically, independent of
  environment/network/caching.
- The overwhelming majority of the extra work is inside the `workspace.get > ... >
  workspace.loadAspects` recursion described above.
- `isCoreAspect()` newly returns `false` for the 7 formerly-core envs this branch removed from the
  manifest, which structurally unlocks the "try load self as aspect" branch for many more
  components than before.

**Not yet confirmed:**
- The exact mechanism by which the `componentLoadedSelfAsAspects` guard fails to bound the
  recursion (ID-string variance vs. something else in `loadAspects` itself vs. legitimate-but-huge
  fan-out that simply wasn't there before).
- Whether the fix belongs in `workspace.ts`'s guard, in `loadAspects`/`WorkspaceAspectsLoader`
  itself, or is a legitimate cost of the manifest change that needs a different mitigation
  (e.g. actually caching/memoizing more aggressively, or not attempting self-as-aspect loading for
  every cyclic dependent).

## Next steps for whoever picks this up

1. Add a call counter / distinct-component-id set around the `workspace.get` self-as-aspect block
   to see exactly how many *distinct* IDs (and whether id strings vary for the same logical
   component) are driving the 40,000+ recursive calls, in the fresh `/tmp` repro (fast to
   re-create: clone this branch, `bit init && bit install`, then `BIT_BIN="node
   <clone>/bin/bit.js" node scripts/circular-deps-check/monitor-workspace-cycle.js --verbose`).
2. Once the mechanism is confirmed, design a fix (likely: make the guard robust to id-string
   variance, or bound recursion depth/fan-out explicitly) and verify against all four repro
   environments above before re-enabling the repo-bit CI step.
3. Re-enable the commented-out `check circular dependencies (repo bit)` step in
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
