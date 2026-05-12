## Context

Component loading today flows through three loader classes (`WorkspaceComponentLoader`, legacy `ComponentLoader`, `ScopeComponentLoader`) that call into each other recursively, with **at least 11 distinct caches** spread across these classes plus `Workspace`, `ScopeComponentLoader`, `ComponentStatusLoader`, `DependencyResolver`, and `AspectLoader`. The hot path for `Workspace.get(id)`:

```
Workspace.get
 → WorkspaceComponentLoader.get
   → consumer.loadComponentFromFileSystem (legacy)
     → legacy ComponentLoader.loadOne
       → dependency resolution from legacy AST
   → buildState (legacy → harmony conversion)
   → loadExtensions
   → executeLoadSlot (mutates legacy ConsumerComponent with harmony extensions)
   → loadCompsAsAspects (may recurse back into Workspace.get)
```

Even simple commands like `bit list` and `bit status` traverse this entire stack for every component. There is no way for a command to say "I just need IDs and modification status" — every load runs through full extension and aspect resolution.

The legacy ↔ harmony conversion mutates the legacy `ConsumerComponent` instance in place (`workspace-component-loader.ts:813`: `consumerComponent.extensions = extensions`), making cache safety fragile. Cache keys must encode `loadOpts` because the same ID with different opts produces different objects.

Progress observability is limited to a single `setStatusLine("loading N components")` call before the work begins. Internal phases use `profileTrace`, but there are no public events for the CLI or UI to render per-component progress. `mapSeries` (not `pMap`) processes load groups serially, hiding parallel work.

Stakeholders: every CLI command (`bit status`, `bit install`, `bit compile`, `bit tag`, `bit export`, `bit start`, etc.), every aspect that calls `workspace.get/getMany`, the UI's component grid, e2e tests, and end users for whom load latency dominates command duration.

## Goals / Non-Goals

**Goals:**

- A single, unified `ComponentLoader` service that owns workspace + scope component loading and replaces the three current loaders.
- **Phased lazy hydration**: callers declare the level of detail they need; the loader does only that work. Phases: `identity` < `files` < `dependencies` < `extensions` < `aspects`.
- **One cache layer** (`ComponentCache`) with one keying scheme and one invalidation contract. All ad-hoc maps (`componentsCache`, `scopeComponentsCache`, `componentsExtensionsCache`, `componentLoadedSelfAsAspects`, `_componentsStatusCache`, etc.) collapse into it.
- **Direct-to-harmony loading**: build a harmony `Component` directly from disk artifacts. The legacy `ConsumerComponent` becomes a _derived view_ (`component.asLegacy()`) generated on demand for legacy callers — never the source of truth.
- **Progress event stream**: typed events (`load:start`, `load:phase:start`, `load:phase:end`, `load:component`, `load:end`) emitted on a `Workspace.loadEvents` emitter. CLI/UI subscribe; absence of subscribers costs ~zero.
- **Performance target**: `bit status` on a 500-component workspace drops from current full-load cost to sub-second by skipping `extensions`/`aspects` phases.

**Non-Goals:**

- Changing the on-disk representation of components (`.bitmap`, scope objects, model files).
- Replacing the pnpm/yarn integration or `cacheRootDirectory` package manager cache.
- Rewriting the aspect runtime or aspect dependency resolution algorithm.
- Changing the import/export wire protocol.
- Building a new UI for the load progress (we only emit events; rendering remains the CLI/UI's job).
- Removing the `ConsumerComponent` type entirely (kept as a derived view for legacy callers; full removal is a separate, future change).

## Decisions

### Decision 1: Five explicit load phases, monotonic and additive

Phases form a strict order: `identity` → `files` → `dependencies` → `extensions` → `aspects`. Loading phase N implies all phases < N have been computed and memoized. A `Component` carries a `loadedPhase` field; calling a method that requires a higher phase upgrades the component in place under the loader's control.

| Phase          | Contains                                                             | Used by                               |
| -------------- | -------------------------------------------------------------------- | ------------------------------------- |
| `identity`     | `ComponentID`, current version, on-disk presence flag                | `bit list`, `bit list --ids-only`     |
| `files`        | source files, package.json, config from `.bitmap` and component.json | `bit show`, simple inspection         |
| `dependencies` | resolved dependencies (runtime/dev/peer), modification status        | `bit status` (default), `bit graph`   |
| `extensions`   | merged extensions/variants, env binding                              | aspect-aware commands (`bit envs`)    |
| `aspects`      | components loaded as aspects, full slot execution                    | `bit compile`, `bit tag`, `bit start` |

**Alternatives considered**: continuous "load options" booleans (today's model — produces cache key explosion); two-tier "shallow vs. deep" (too coarse — `bit status` doesn't need extensions). Five phases match the natural data dependencies and let each command request the minimum it needs.

### Decision 2: Single `ComponentCache` keyed by `(ComponentID, phase)` with content-hash validation

One cache replaces the 11+ caches enumerated in the proposal. Key: serialized `ComponentID` plus phase. Each cache entry stores a content hash (composed of file mtimes, `.bitmap` hash, `workspace.jsonc` hash for the relevant scope). On lookup, the loader validates the hash before returning. Invalidation is push-based on `.bitmap`/`workspace.jsonc` change events (already wired) plus pull-based hash check.

Cache lifetime is per-process (in-memory). The on-disk dependency cache (`.bit/cache/`) is preserved as a phase-specific artifact for the `dependencies` phase only — that's the expensive computation worth persisting.

**Alternatives considered**: keep separate caches for separate phases (today's de-facto model — synchronization bugs); LRU with no validation (correctness regression on file changes); content-hash everywhere with no phase keying (forces same-key entries with different shapes — defeats the purpose).

### Decision 3: Build harmony `Component` directly; derive `ConsumerComponent` only on demand

Today's flow loads a legacy `ConsumerComponent` first, then _converts_ it. The new flow inverts this: read `.bitmap`, files, and config; instantiate `Component` and `State` directly; expose `component.asLegacy(): ConsumerComponent` for the small set of legacy callers (e.g., `bit-objects` writers, legacy hooks).

This eliminates the in-place mutation pattern (`consumerComponent.extensions = extensions`) and breaks the bidirectional dependency between legacy and harmony loaders. The legacy `ComponentLoader` class is reduced to: (a) a thin `legacy-view` adapter that materializes a `ConsumerComponent` from a harmony `Component`, and (b) the dependency-extraction routines (AST walking, dep resolution) which remain genuinely useful and have no harmony equivalent yet.

**Alternatives considered**: keep loading legacy first (status quo — fragile mutation); rewrite dep extraction in harmony layer (out of scope — would balloon this change). The chosen split keeps the genuinely-needed legacy code (dep extraction) while removing the conversion roundtrip.

### Decision 4: Progress observability via typed `EventEmitter` on `Workspace`

`Workspace.loadEvents` is a typed emitter with these events:

```ts
type LoadEvent =
  | { kind: 'load:start'; callId: string; ids: ComponentID[]; phase: Phase }
  | { kind: 'load:phase:start'; callId: string; phase: Phase; ids: ComponentID[] }
  | { kind: 'load:component'; callId: string; id: ComponentID; phase: Phase; durationMs: number; cached: boolean }
  | { kind: 'load:phase:end'; callId: string; phase: Phase; durationMs: number }
  | { kind: 'load:end'; callId: string; durationMs: number; failures: ComponentID[] };
```

The CLI status-line renderer subscribes and prints `loading 12/500 (extensions)`. With no subscribers, emit cost is the price of an array push and is negligible vs. load itself. `BIT_LOG=load` enables a debug subscriber that writes per-component timings to `debug.log`.

**Alternatives considered**: callbacks passed into each load call (clutters every call site); no observability change (status quo — user pain point); OpenTelemetry tracing (heavyweight; can be layered on top of these events later).

### Decision 5: Auto-import becomes explicit, not a load side effect

`ScopeComponentLoader.get` today auto-imports missing components (with a 30-minute "already attempted" cache). This couples loading to network IO and makes load latency unpredictable. The unified loader **never** triggers a network fetch; if a component is not in the local scope, `loader.get` returns `{ status: 'not-found' }` (or throws, depending on call site).

Commands that need network resolution (`bit import`, `bit checkout`, fetch flows) call `scope.import(ids)` explicitly first, then load. This makes the boundary between "local" and "remote" obvious.

**Alternatives considered**: keep implicit auto-import behind a flag (still couples and surprises callers); auto-import only when explicitly opted in (similar end state — explicit is better than flag-controlled).

### Decision 6: Two-stage migration; old loaders deleted in a follow-up

Stage 1 — build the new `ComponentLoader` alongside the old. Wire `Workspace.get/getMany/list` to delegate to the new loader behind a feature flag (`BIT_LOADER=new`). Run e2e suite on both modes in CI for one release.

Stage 2 — flip the default flag, fix fallout, then delete `WorkspaceComponentLoader`, the in-memory caches on `Workspace`, the auto-import path in `ScopeComponentLoader`, and the cache fields on legacy `ComponentLoader`. The legacy class shrinks to its dep-extraction core.

**Alternatives considered**: big-bang rewrite (too risky for the surface area — every command depends on this); strangler fig over many releases (drags out the dual-mode complexity). Two-stage with a single release of dual-mode is the smallest safe path.

## Risks / Trade-offs

- **Risk: aspect calls a component method that needs a higher phase than was loaded** → Mitigation: methods that depend on a phase declare it (e.g. via decorator or explicit guard); the `Component` instance auto-upgrades on access. This adds latency to the first such call but preserves correctness. We log when this happens so we can tune default phases per command.

- **Risk: content-hash invalidation misses a file the loader didn't track** → Mitigation: the hash composition is derived from a single `getHashInputs(phase)` function; tests assert that every input field that affects load output appears in the hash. Add a CI guard that diffs cache hash inputs against a golden file.

- **Risk: removing implicit auto-import breaks third-party aspects that relied on it** → Mitigation: emit a deprecation warning during stage 1 whenever the loader returns `not-found` for an ID that the old path would have auto-imported. Document the migration in the changelog. Provide `workspace.getOrImport(id)` as an explicit replacement for callers that genuinely need it.

- **Risk: per-component event emission becomes a bottleneck for large workspaces** → Mitigation: events are batched per phase (one `phase:end` per phase, one `component` per component) and the emitter is a synchronous `EventEmitter` (no async overhead). Benchmark on a 5000-component workspace before stage 2.

- **Risk: legacy callers that mutated `ConsumerComponent.extensions` after load** → Mitigation: grep the codebase for `.extensions = ` mutations on `ConsumerComponent`; convert each to operate on the harmony `Component`. The `asLegacy()` view is read-only — mutating it throws.

- **Risk: dual-mode CI doubles e2e runtime** → Mitigation: run new-loader CI only on PRs that touch loader code or on a nightly cron; default PRs use the old loader until stage 2.

- **Trade-off: phase upgrades are stateful** → A `Component` instance can be at different phases at different times. Aspects that hold component references across calls may see them upgraded. Acceptable: phases are monotonic and additive, so existing data never changes — only more data appears.

- **Trade-off: explicit `scope.import` is one more line in some commands** → Worth it for predictability. The set of commands that need network is small and well-known.

## Migration Plan

1. **Pre-work** — Land an audit task: enumerate every call to `consumerComponent.extensions = X`, `workspace.get` with each combination of `loadOpts`, every place the legacy loader is invoked. This becomes the migration checklist (likely 80–120 sites).

2. **Stage 1: dual-mode** —

   - Add `ComponentLoader` (new) under `scopes/component/component-loader/` (the package already exists; extend it).
   - Add `Workspace.loadEvents` and the typed event payloads.
   - Add `BIT_LOADER` env flag selecting old vs. new path.
   - Migrate `bit list` and `bit status` to call the new loader at phases `identity` and `dependencies` respectively.
   - Run full e2e suite under both modes; fix divergences.
   - Ship as opt-in for one release (`BIT_LOADER=new`).

3. **Stage 2: flip default** —

   - Change default to new loader.
   - Migrate remaining commands one at a time, choosing the lowest sufficient phase.
   - Replace implicit auto-import with explicit `scope.import` at the ~6 sites that rely on it.
   - Convert `ConsumerComponent.extensions = X` mutations to operate on harmony `Component`.

4. **Stage 3: cleanup** —
   - Delete `WorkspaceComponentLoader`.
   - Delete duplicate caches on `Workspace` (`componentLoadedSelfAsAspects`).
   - Reduce legacy `ComponentLoader` to dep-extraction only.
   - Drop `BIT_LOADER` flag.
   - One-time on-disk cache migration: discard `.bit/cache/` entries with old format on first run.

**Rollback**: stage 1 is opt-in, so rollback is `unset BIT_LOADER`. After stage 2, rollback requires reverting the default flip — trivially a one-line change before stage 3 deletes the old code.

## Open Questions

- Should phase upgrades be synchronous (auto-upgrade on access) or require an explicit `loader.upgrade(component, phase)` call? Auto-upgrade is more ergonomic; explicit is more predictable and easier to instrument. Lean: auto-upgrade with a debug log so we can find unexpected upgrades.
- Should `ComponentCache` evict entries under memory pressure (LRU), or assume per-process lifetimes are bounded? Current caches use `createInMemoryCache` with size limits — replicate that contract for safety.
- Where should `Workspace.loadEvents` live for the UI app (which runs in a different process)? Likely: serialize to the existing UI websocket; design defers to the UI integration task.
- Do we need a separate `ScopeLoader` for scope-only contexts (no workspace)? Probably yes, sharing the cache and event emitter — but design defers to spec/tasks.
