## Why

Component loading is Bit's hottest and most fragile code path, yet it is nearly opaque: load errors are swallowed in at least 9 places (e.g. `loadCompsAsAspects`, `requireAspects`), cache hits are silent, nested aspect/component loads produce interleaved logs that can't be correlated, and there is no way to ask "why does this component have this env / these extensions?". This is Phase 1 of the component-loading redesign (see `scopes/workspace/workspace/component-loading-redesign.md`): build observability and an error-surfacing safety net **before** any structural refactoring, so later phases (lazy loading, cache consolidation) can be developed and verified safely.

## What Changes

- Add a **load trace context**: every top-level component/aspect load gets a request id propagated through nested loads (extension merging, aspect loading, scope loads), so `BIT_LOG=*` output reads as a tree instead of interleaved noise. Generalizes the existing ad-hoc `callId` in `workspace-aspects-loader.ts`.
- Add **stage-level timing instrumentation** to the load path (consumer-component FS load, extension merge, env calc, dependency resolution, each `onComponentLoad` handler), recorded on the trace context. Groundwork for the Phase 2 benchmark table.
- Add a new **`bit debug-load <id>` command** that loads a component with tracing enabled and prints: stages executed, cache hit/miss per cache, the extension-merge source table (surfacing the existing `beforeMerge` trace from `aspects-merger.ts`), the resolved env id and which source determined it, and per-stage/per-handler timings.
- Convert **silently-swallowed load errors into component issues** surfaced by `bit status`: aspect/env load failures currently logged-and-ignored (e.g. `workspace-component-loader.ts` `loadCompsAsAspects`, `scope-aspects-loader.ts` `requireAspects`) attach a load issue to the affected component instead of disappearing.
- No behavioral changes to loading itself: components that loaded before still load; errors that were ignored are still non-fatal — they just become visible.

## Capabilities

### New Capabilities

- `component-load-tracing`: per-request trace context with hierarchical logging and stage-level timing for component/aspect loads.
- `debug-load-command`: `bit debug-load <id>` CLI command printing a human-readable load trace (stages, caches, extension-merge table, env resolution, timings).
- `component-load-issues`: surfacing of swallowed component/aspect load errors as component issues visible in `bit status`.

### Modified Capabilities

<!-- none — no existing specs in openspec/specs/ -->

## Impact

- `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts` — trace propagation, timing, issue attachment
- `scopes/workspace/workspace/workspace-aspects-loader.ts` — replace ad-hoc `callId` with trace context, issue attachment
- `scopes/scope/scope/scope-aspects-loader.ts`, `scope-component-loader.ts` — trace propagation, issue attachment
- `scopes/workspace/workspace/aspects-merger.ts` — expose `beforeMerge` trace data
- `scopes/envs/envs/` — expose env-resolution reasoning for the debug output
- New command registration (likely in the workspace aspect, alongside other debug commands) for `bit debug-load`
- `@teambit/component-issues` — new issue type(s) for load failures; `bit status` picks them up via the existing issues mechanism
- Logging only; no change to load semantics, caching behavior, or component output
