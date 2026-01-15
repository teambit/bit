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

## Migration Strategy: Strangler Fig Pattern

### Why Strangler Fig?

- Zero big-bang risk
- Can ship incrementally
- Easy rollback at any point
- Old and new code coexist

### Implementation

1. **Create `WorkspaceComponentLoaderV2`** alongside existing loader
2. **Feature flag**: `BIT_LOADER_V2=true` environment variable
3. **Parallel execution** during development (run both, compare outputs)
4. **Command-by-command migration**:
   - Phase 1: `bit show` (simplest)
   - Phase 2: `bit status` (more complex)
   - Phase 3: `bit build`, `bit test` (full pipeline)
   - Phase 4: All remaining commands
5. **Remove old loader** only after all e2e tests pass with V2

### Parallel Execution Mode

During development, both loaders run and results are compared:

```typescript
if (process.env.BIT_LOADER_V2_COMPARE) {
  const [v1Result, v2Result] = await Promise.all([loaderV1.getMany(ids), loaderV2.getMany(ids)]);

  const diff = compareResults(v1Result, v2Result);
  if (diff.length > 0) {
    logger.warn('Loader V2 difference detected', { diff });
  }

  return v1Result; // Still use V1 as source of truth
}
```

---

## File Structure

```
scopes/workspace/workspace/workspace-component/
├── workspace-component-loader.ts        # Existing (keep until migration complete)
├── workspace-component-loader-v2.ts     # New loader orchestrator
├── load-plan.ts                         # LoadPlan types and builder
├── component-source.ts                  # ComponentSource interface
├── loader-cache.ts                      # Unified caching
└── phases/
    ├── index.ts
    ├── discovery.phase.ts
    ├── resolution.phase.ts
    ├── hydration.phase.ts
    ├── enrichment.phase.ts
    ├── assembly.phase.ts
    └── execution.phase.ts
```

---

## Success Criteria

1. **All existing e2e tests pass** with V2 loader
2. **Performance improvement** - Measurable via benchmark (target: 10%+ faster)
3. **Code clarity** - Each phase file < 200 lines, loader orchestrator < 300 lines
4. **Debuggability** - Can inspect LoadPlan to understand why components load in specific order
5. **Test coverage** - Each phase has unit tests independent of full pipeline

---

## References

- Current loader: `scopes/workspace/workspace/workspace-component/workspace-component-loader.ts`
- Component factory: `scopes/component/component/component-factory.ts`
- Scope loader: `scopes/scope/scope/scope-component-loader.ts`
- Task tracking: [TASKS.md](./TASKS.md)
- Decision log: [DECISIONS.md](./DECISIONS.md)
