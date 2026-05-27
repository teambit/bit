# RFC: Component Loading Mechanism Rewrite

## Status: Planning

## Problem Statement

The current component loading mechanism (`WorkspaceComponentLoader`) is:

1. **Hard to understand** - 1,029 lines with deeply nested logic, especially `buildLoadGroups()`
2. **Hard to modify** - Changes risk regressions despite extensive e2e test coverage
3. **Performance bottleneck** - Complex load ordering and multiple cache layers add overhead
4. **Blocking new features** - Architecture makes certain improvements difficult

### Complexity Hotspots

| File                            | Lines | Issue                                                                    |
| ------------------------------- | ----- | ------------------------------------------------------------------------ |
| `workspace-component-loader.ts` | 1,029 | Main complexity - `buildLoadGroups()` alone is 120+ lines of dense logic |
| `workspace.ts`                  | 2,554 | Too many responsibilities                                                |
| `scope.main.runtime.ts`         | 1,481 | Similar issues on scope side                                             |

### Root Causes of Complexity

1. **Multi-source loading** - Components come from workspace filesystem AND scope storage
2. **Circular bootstrap** - Need envs to load components, but envs ARE components
3. **Legacy interop** - Dual representation (ConsumerComponent + Component)
4. **Inline computation** - Load order computed inline, not inspectable
5. **Mixed concerns** - Discovery, resolution, hydration, execution all interleaved

### The Caching Nightmare

The current caching strategy is particularly problematic:

**ComponentLoadOptions has 12 boolean flags** that affect how a component loads, but:

- Cache key only uses 4 of them: `loadExtensions`, `executeLoadSlot`, `loadDocs`, `loadCompositions`
- The other 8 flags are **ignored** when computing cache keys
- Sometimes cache key uses the given loadOptions, sometimes it's hardcoded to `{ loadExtensions: true, executeLoadSlot: true }`
- Cache lookup tries given loadOptions first, then falls back to the hardcoded options

This leads to **unpredictable cache behavior** - it takes significant time just to figure out why unexpected data comes from the cache.

**Multiple overlapping caches exist:**

| Cache                   | Location                 | Purpose                   |
| ----------------------- | ------------------------ | ------------------------- |
| Components cache        | WorkspaceComponentLoader | Loaded Component objects  |
| Scope components cache  | WorkspaceComponentLoader | Components from scope     |
| Extensions cache        | WorkspaceComponentLoader | Component extensions      |
| ConsumerComponent cache | Legacy consumer          | Legacy component objects  |
| Dependency cache        | Filesystem               | Resolved dependencies     |
| Tree cache              | (previously Madge)       | Dependency tree structure |

These caches have **no unified invalidation strategy** and can get out of sync.

### Recursive Loading & Hidden Control Flow

**Components loading components loading components...**

When loading a component, it often needs data from other components (e.g., its env). Those components
may themselves need other components. This creates recursive loading that's very hard to track:

```
Load component A
  → Needs env B
    → Load env B
      → Needs env-of-env C
        → Load C
          → Has extensions D, E
            → Load D, E...
```

There's no visibility into this chain. When something goes wrong, it's unclear which load triggered what.

**Legacy hooks obscure control flow**

The legacy `ConsumerComponent` load calls hooks that jump into Harmony:

- `onConfigLoad` - fires during config parsing
- `loadDependencies` - fires to resolve dependencies
- Other lifecycle hooks

These hooks mean the call stack jumps between legacy code and Harmony aspects unpredictably.
Even with a debugger, it's hard to follow what's happening.

**Goal for V2:** Even though we keep ConsumerComponent, we can make its creation more linear
and predictable. The recursive loading should be explicit in the LoadPlan, not discovered at runtime.

## Goals

- [ ] Make loading logic understandable in a 5-minute walkthrough
- [ ] Enable safe modifications without fear of regressions
- [ ] Improve loading performance (measurable benchmark)
- [ ] Maintain full backward compatibility
- [ ] Keep legacy ConsumerComponent interop (not in scope to remove)

## Non-Goals

- Removing ConsumerComponent bridge (deferred)
- Changing the Component public API
- Modifying how aspects/extensions work fundamentally

---

## New Architecture

### Core Principle: Explicit Pipeline with Inspectable Plan

Instead of computing load order inline, we create an explicit `LoadPlan` that can be:

- Inspected for debugging
- Tested independently
- Optimized without changing the pipeline

### Pipeline Phases

```
┌─────────────────┐
│   Discovery     │  Find all ComponentIDs to load
│   (Input: IDs)  │  Output: Set<ComponentID>
└────────┬────────┘
         ▼
┌─────────────────┐
│   Resolution    │  Resolve dependencies, determine load order
│                 │  Output: LoadPlan (topologically sorted)
└────────┬────────┘
         ▼
┌─────────────────┐
│   Hydration     │  Load raw data from sources (workspace/scope)
│                 │  Output: Map<ComponentID, RawComponentData>
└────────┬────────┘
         ▼
┌─────────────────┐
│   Enrichment    │  Add aspects, extensions, env descriptors
│                 │  Output: Map<ComponentID, EnrichedData>
└────────┬────────┘
         ▼
┌─────────────────┐
│   Assembly      │  Build Component objects
│                 │  Output: Map<ComponentID, Component>
└────────┬────────┘
         ▼
┌─────────────────┐
│   Execution     │  Run onComponentLoad slots
│                 │  Output: Map<ComponentID, Component> (final)
└─────────────────┘
```

### Key Data Structures

#### LoadPlan

```typescript
interface LoadPlan {
  // Phases in execution order
  phases: LoadPhase[];

  // Dependency graph for debugging/visualization
  dependencies: Map<ComponentID, ComponentID[]>;

  // Flat list in topological order
  loadOrder: ComponentID[];

  // Metadata
  stats: {
    totalComponents: number;
    workspaceComponents: number;
    scopeComponents: number;
    envCount: number;
  };
}

interface LoadPhase {
  name: string;
  type: 'core-envs' | 'env-of-envs' | 'extensions' | 'components';
  ids: ComponentID[];
  source: 'workspace' | 'scope' | 'both';

  // For debugging
  reason: string; // Why this phase exists
}
```

#### ComponentSource

Unified interface for loading from different sources:

```typescript
interface ComponentSource {
  name: string;
  priority: number;

  // Check if this source can provide the component
  canLoad(id: ComponentID): Promise<boolean>;

  // Load raw component data (before enrichment)
  loadRaw(id: ComponentID): Promise<RawComponentData>;

  // Batch loading for performance
  loadRawMany(ids: ComponentID[]): Promise<Map<ComponentID, RawComponentData>>;
}

class WorkspaceSource implements ComponentSource {
  name = 'workspace';
  priority = 1; // Higher priority than scope
  // ... implementation
}

class ScopeSource implements ComponentSource {
  name = 'scope';
  priority = 2;
  // ... implementation
}
```

### Caching Strategy

Single coherent cache with clear keys:

```typescript
interface LoaderCache {
  // Primary cache - fully loaded components
  components: Map<string, Component>;

  // Raw data cache - before enrichment (can be shared)
  rawData: Map<string, RawComponentData>;

  // Plan cache - avoid recomputing load plans
  plans: Map<string, LoadPlan>;

  // Methods
  invalidate(id: ComponentID): void;
  invalidateAll(): void;
  getStats(): CacheStats;
}
```

---

## Lessons from the First Attempt (PR #10086, abandoned)

A first cut at this rewrite was made on `refactor/component-loading-v2` (Nov 2025 – Jan 2026) and abandoned. The takeaways shape this plan:

1. **Recursion was the real problem and was never solved.** Env loading triggers component loading, which triggers env loading. The first attempt worked around this by stubbing out the Enrichment phase (returning `{ envsData: {}, depResolverData: {} }`) and bypassing the dep resolver in the workspace source. The "rewrite" therefore did less work than V1 — that's why tests failed.
2. **No safety net before code.** The plan called for a parallel V1-vs-V2 comparison mode; it was never built. V2 was flipped to the default with no objective evidence it produced equivalent output.
3. **All six phases at once is too much surface.** The new pipeline replaced V1's complexity with a different shape of complexity (a 544-line orchestrator looping over phases that each loop over components), and reproduced V1's hidden caches under new names (`scopeComponentsCache` outside the "unified" `LoaderCache`).

## Migration Strategy: Diff-Harness First, Incremental Seams

### Step 1 — Diff harness (this PR)

Before any V2 code:

1. Build `serializeComponentForDiff(component): NormalizedSnapshot` — a deterministic, sorted serialization of the fields we care about (see [SNAPSHOT-CONTRACT.md](./SNAPSHOT-CONTRACT.md)).
2. Build a wrapper `LoaderDiffHarness` that delegates to a primary loader and a partner loader, snapshots both results, diffs them, and writes diffs to a JSONL file. Returns the primary's result so commands keep working.
3. Wire it into `Workspace` behind `BIT_LOADER_DIFF=1`.
4. Validate it runs **V1-vs-V1 with zero diffs** on a corpus of representative workspaces. (Two `WorkspaceComponentLoader` instances on the same workspace, each with its own cache.) If V1-vs-V1 produces diffs, either the snapshot is non-deterministic or V1 has cold/hot-cache divergence we need to find before V2 starts.

The harness is opt-in and side-effect-tolerant: enabling it doubles slot fires, so it's a development tool, not a production feature flag.

### Step 2 — Recursion root-cause spike (separate PR)

Investigate and document the env↔component recursion in `DECISIONS.md`. Before designing the new pipeline, decide:

- Pre-pass: extract a synchronous "extension descriptor" pass that doesn't go through `workspace.get`, and fix V1 to use it.
- Lazy env binding: components carry an env reference, which resolves on first use, not load.
- Detected-cycle fallback: accept recursion, detect cycles explicitly, return a stub on cycle.

A real answer here is a precondition for any structural rewrite. The first attempt designed a pipeline that couldn't accommodate the recursion and ended up bypassing the work that needed to happen.

### Step 3 — Incremental seams

One seam per PR, each green on the diff harness before merging:

- Extract `LoadPlan` construction as a pure function over bitmap + scope state. V1 still does the loading. The plan becomes inspectable and testable.
- Extract Hydration as a separate concern, V1 still drives ordering.
- Etc.

No big-bang switchover. No `BIT_FEATURES=component-loader-v2` "this is the default now" flag. Each seam is a small refactor that leaves the loader working at every commit.

### Step 4 — Cleanup

Once enough seams are extracted that the original loader has shrunk to an orchestrator, decide whether the residual orchestrator is small/clear enough to keep, or whether to replace it. By that point the answer will be obvious; today it isn't.

---

## File Structure (this PR)

```
scopes/workspace/workspace/workspace-component/
├── workspace-component-loader.ts        # Unchanged
└── loader-diff/
    ├── index.ts                         # Public API + env-flag detection
    ├── snapshot.ts                      # serializeComponentForDiff()
    ├── diff.ts                          # diffSnapshots()
    └── harness.ts                       # LoaderDiffHarness wrapper

docs/rfcs/component-loading-rewrite/
├── README.md                            # This file
├── TASKS.md                             # Task tracking
├── SNAPSHOT-CONTRACT.md                 # Fields the snapshot covers
└── DECISIONS.md                         # Decision log (created in Step 2)
```

---

## Success Criteria

### For this PR (Step 1)

1. `BIT_LOADER_DIFF=1 bit status` runs to completion on a representative workspace.
2. The JSONL diff log is empty (V1-vs-V1 produces zero diffs).
3. The harness is off by default. Turning it off has zero behavioral impact.

### For the rewrite overall

1. All existing e2e tests pass with the rewritten loader.
2. The diff harness produces zero diffs on the replay corpus.
3. The loader's complexity is reduced **measurably** — fewer hidden caches, no recursive loading, an inspectable load plan. Avoid line-count targets; they encourage optimizing the wrong metric.

---

## References

- Current loader: `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts`
- Component factory: `scopes/component/component/component-factory.ts`
- Scope loader: `scopes/scope/scope/scope-component-loader.ts`
- Task tracking: [TASKS.md](./TASKS.md)
- Decision log: [DECISIONS.md](./DECISIONS.md)
