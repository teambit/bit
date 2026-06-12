## Context

Phase 1 of the component-loading redesign (`scopes/workspace/workspace/component-loading-redesign.md`). The load path spans `WorkspaceComponentLoader`, the legacy consumer `ComponentLoader`, `WorkspaceAspectsLoader`, `ScopeComponentLoader`, and `ScopeAspectsLoader`, with mutual recursion between component loading and aspect loading. Today: one ad-hoc `callId` exists in `workspace-aspects-loader.ts:98-103`; `BIT_LOG=*` prints load groups but logs from nested loads interleave; ~9 catch blocks log-and-continue; the aspects-merger computes a `beforeMerge` trace that is never surfaced.

Everything in this phase is observability — no change to load semantics. This constraint is what makes the phase safe to ship quickly and what later phases depend on.

## Goals / Non-Goals

**Goals:**

- Correlate all logs of one top-level load under one request id, including nested aspect/component loads.
- Record per-stage and per-`onComponentLoad`-handler timings, cheap enough to leave always-on.
- `bit debug-load <id>`: a single command that answers "what happened when this component loaded, and why does it have this env/these extensions?"
- Swallowed aspect/env load errors become component issues visible in `bit status`.

**Non-Goals:**

- No changes to caching, load ordering, laziness, or the legacy roundtrip (Phases 2-6).
- No new persistent telemetry/metrics backend — in-memory trace + logger output only.
- Not making previously-ignored errors fatal. Behavior stays best-effort; it just becomes visible.

## Decisions

### D1: Trace propagation via AsyncLocalStorage, not parameter threading

A `LoadTraceContext` module exposes `runWithLoadTrace(meta, fn)` and `currentLoadTrace()`, backed by `AsyncLocalStorage`. Top-level entry points (`WorkspaceComponentLoader.getMany/get`, `WorkspaceAspectsLoader.loadAspects`, `ScopeComponentLoader.get/getMany`) start a trace if none is active, otherwise join the existing one as a child span.

- **Why not thread a `traceId` through signatures?** The load path crosses ~12 entry points and the legacy consumer loader; threading would touch dozens of signatures including legacy code we plan to delete in later phases. AsyncLocalStorage gives inheritance through the async call graph for free, including the aspect↔component recursion.
- **Alternative considered:** extending `loadOpts` — rejected because `loadOpts` is serialized into cache keys (`createComponentCacheKey`) and doesn't flow into the aspects loaders.
- Logger integration: a child-logger / prefix helper so existing `logger.debug` calls inside an active trace get `[trace:<id> <path>]` prefixes without rewriting call sites. The existing `callId` in `workspace-aspects-loader.ts` is replaced by this.

### D2: Spans recorded in memory on the trace object; always-on

`trace.span(name, attrs, fn)` wraps a stage, recording start/end/duration and attributes (component id, cache hit/miss, group type). Cost is two `process.hrtime.bigint()` calls and an object push — safe to leave always-on. Spans are emitted to the logger at `trace` level as they close; the full tree is kept in memory only while the trace is active (i.e. only the `debug-load` command and the timing log line retain it).

Instrumented stages (matching the S0-S4 model in the master doc, so Phase 2 benchmarks map 1:1): bitmap/id resolution, consumer-component FS load, scope/model load, extension merge, env calculation, dependency resolution, aspect loading (per aspect id), each `onComponentLoad` handler (per aspect id).

### D3: `bit debug-load <id>` lives in the workspace aspect

Registered alongside the existing workspace debug-style commands. Flow: resolve id → `workspace.clearComponentCache(id)` (a debug command must not report a cache-hit no-op) → run `workspace.get(id)` inside a fresh trace → render. Renders with the shared output formatter (`scopes/harmony/cli/output-formatter.ts` per the CLI style guide):

1. **Stages table** — span tree with durations, cache hit/miss per cache touched.
2. **Extension sources table** — surfaced from the aspects-merger `beforeMerge` data: one row per (extension, source) showing which of bitmap / config-merge / component.json / variants / model-specific / model-non-specific contributed and what won.
3. **Env resolution** — resolved env id + which merge source determined it.
4. **Issues** — any load issues attached during the run.

`--json` flag emits the raw trace tree for tooling. The aspects-merger change is read-only exposure: persist the already-computed `beforeMerge`/`extensionsMergeTrace` onto the loaded component (or return it via the loader) instead of discarding it.

### D4: Swallowed errors become a new `component-issues` issue type, non-tag-blocking

New issue class (e.g. `LoadFailure`) in `@teambit/component-issues`, carrying `{ failedId, phase, error }` entries. Attached at today's catch-and-continue sites — primarily `loadCompsAsAspects` (`workspace-component-loader.ts:486-489`), `requireAspects` error path (`scope-aspects-loader.ts:337-352`), and `resolveInstalledAspectRecursively` (`workspace-aspects-loader.ts:678-682`) — to the component(s) whose aspect/env failed to load, via the existing `ConsumerComponent.issues` mechanism that `bit status` already renders.

- `isTagBlocker = false` initially: this phase must not change which operations succeed. Promoting it to a blocker (or per-error-class severity) is a candidate for a later phase once we see real-world frequency.
- Install-context suppression (`ignoreAspectLoadingError`, `workspace-aspects-loader.ts:915-922`) stays: mid-install ESM errors are expected noise, not issues.
- Catch blocks keep their current control flow (log + continue); the only addition is issue attachment. Where the component object isn't in hand at the catch site, the trace context carries a per-component issue collector so deep aspect-loader code can report without new parameters.
- **Noise control**: only the failing component itself gets a per-component issue. Components merely _using_ the failed aspect/env are aggregated into a single workspace-level issue (`workspace.getWorkspaceIssues()`, rendered in the "workspace issues" section of `bit status`) with an affected-components count — one broken env used by 100 components must not produce 100 status entries. The env may be configured via the `EnvsAspect` config rather than as a direct extension entry, so the aggregation also matches against the resolved env id, not only the component's extension ids.
- **Non-blocking at the tag/snap gate**: workspace issues normally gate `bit tag`/`bit snap` (`builder.throwForComponentIssues`). Aggregated load failures are tagged as non-blocking (`getWorkspaceIssues({ includeNonBlocking: false })` for the gate) so they stay visible in status without changing which operations succeed — matching `isTagBlocker = false` on the per-component issue.

## Risks / Trade-offs

- [AsyncLocalStorage context loss across unusual async boundaries (e.g. `child_process`, capsule require)] → Acceptable: trace coverage degrades to "no prefix" for those logs, never wrong data. Capsule-side aspect loading gets a span around the boundary recording what was requested.
- [New issues alarm users for errors they previously never saw] → Issue text states the failure is non-fatal and names the failing aspect; `isTagBlocker = false`; release note explains these errors always happened and are now visible.
- [Always-on span overhead on huge workspaces (thousands of components × handlers)] → Spans are flat objects appended to an array, emitted at `trace` log level (off by default). If profiling shows cost, gate retention (not collection) behind `BIT_LOG`.
- [Issue attachment in shared aspect-load paths could attach the same failure to many components] → Dedupe by (componentId, failedId, phase) within a trace.

## Migration Plan

Three independently-revertible PRs, in order: (1) trace context + spans + logger integration, (2) load-failure issues, (3) `bit debug-load` command (depends on 1; benefits from 2). Each is logging/reporting-only; rollback is plain revert. e2e: one test per PR (trace prefix appears in debug log; `bit status` shows load issue for a broken env; `debug-load` renders all four sections).

## Open Questions

- ~~Span retention policy for `getMany` over the whole workspace~~ **Resolved:** keep full retention. Spans are small flat objects (~15 per component); a 1000-component workspace retains a few MB transiently, released when the top-level trace ends. No gating needed.
- Whether `debug-load` should also accept `--all-caches-cold` (clear _all_ caches, not just the target component's) to expose cross-component cache effects.
