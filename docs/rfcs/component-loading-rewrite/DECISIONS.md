# Component Loading Rewrite - Architecture Decision Log

This document records key architectural decisions made during the rewrite.
Entries are append-only and should not be modified after being added.

---

## ADR-001: Use Strangler Fig Pattern for Migration

**Date:** 2024-01-XX (update with actual date)

**Status:** Accepted

**Context:**
The component loading mechanism is critical infrastructure with extensive e2e test coverage.
A big-bang rewrite carries high risk of regressions that are difficult to debug.

**Decision:**
Use the Strangler Fig pattern - build V2 loader alongside V1, migrate incrementally by command,
remove V1 only after V2 proves itself.

**Consequences:**

- (+) Can ship incrementally with low risk
- (+) Easy rollback at any point
- (+) Can compare V1 vs V2 output during migration
- (-) Temporary code duplication
- (-) Longer total timeline than big-bang (but safer)

---

## ADR-002: Keep Legacy ConsumerComponent Interop

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
The current loader bridges between legacy `ConsumerComponent` and new `Component` types.
Removing this bridge would be a separate large effort.

**Decision:**
Keep the ConsumerComponent bridge in V2 loader. Focus the rewrite on the loading pipeline
architecture, not on eliminating legacy types.

**Consequences:**

- (+) Smaller scope, more achievable
- (+) Maintains compatibility with code that depends on ConsumerComponent
- (-) Some complexity remains due to dual representation
- (-) Future work needed to fully modernize

---

## ADR-003: Explicit LoadPlan Data Structure

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
Current loader computes load order inline in `buildLoadGroups()`. This makes it hard to:

- Debug why components load in a specific order
- Test the ordering logic independently
- Understand the algorithm

**Decision:**
Introduce an explicit `LoadPlan` data structure that represents the complete load strategy
before execution begins. The plan is:

- Inspectable (can be logged, debugged)
- Testable (can verify plan without running full pipeline)
- Serializable (can be cached or compared)

**Consequences:**

- (+) Much easier to debug loading issues
- (+) Can unit test load ordering logic
- (+) Self-documenting - plan explains itself
- (-) Slight overhead of building plan before execution
- (-) Need to keep plan and execution in sync

---

## ADR-004: Pipeline Phase Architecture

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
Current loader mixes concerns: discovery, resolution, hydration, enrichment, and execution
are interleaved in complex ways.

**Decision:**
Separate loading into distinct phases, each with clear input/output contracts:

1. Discovery - find IDs to load
2. Resolution - build LoadPlan with dependency order
3. Hydration - load raw data from sources
4. Enrichment - add aspects, extensions, env descriptors
5. Assembly - build Component objects
6. Execution - run onComponentLoad slots

Each phase is implemented in a separate file and can be tested independently.

**Consequences:**

- (+) Each phase is understandable in isolation
- (+) Can test phases independently
- (+) Can optimize or replace individual phases
- (+) Clear data flow through pipeline
- (-) Need to define interfaces between phases
- (-) Some operations may feel artificially separated

---

## ADR-005: Feature Flag for V2 Activation

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
Need a way to test V2 loader before making it the default.

**Decision:**
Use environment variable `BIT_LOADER_V2=true` to activate V2 loader.
Additionally, `BIT_LOADER_V2_COMPARE=true` runs both loaders and logs differences.

**Consequences:**

- (+) Easy to test V2 in any environment
- (+) Can enable for specific CI jobs
- (+) Users can opt-in early
- (-) Need to remember to remove flags after migration

---

## ADR-006: Unified Caching Strategy

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
The current caching is a major source of bugs and confusion:

1. **Inconsistent cache keys**: `ComponentLoadOptions` has 12 boolean flags, but only 4 are used
   in the cache key (`loadExtensions`, `executeLoadSlot`, `loadDocs`, `loadCompositions`).
   The other 8 flags are ignored, leading to incorrect cache hits.

2. **Inconsistent key computation**: Sometimes the cache key uses the provided loadOptions,
   sometimes it's hardcoded to `{ loadExtensions: true, executeLoadSlot: true }`.

3. **Fallback behavior**: Cache lookup tries the given loadOptions first, then falls back to
   hardcoded options - making it very hard to predict what you'll get.

4. **Multiple overlapping caches**:

   - Components cache (WorkspaceComponentLoader)
   - Scope components cache (WorkspaceComponentLoader)
   - Extensions cache (WorkspaceComponentLoader)
   - ConsumerComponent cache (legacy)
   - Dependency cache (filesystem)
   - Tree cache (previously Madge)

5. **No unified invalidation**: These caches can get out of sync with each other.

**Decision:**
V2 loader will have a single, coherent caching strategy:

1. **All load options affect cache key** - No silent ignoring of options
2. **Explicit cache key function** - One clear function that computes keys
3. **Single component cache** - One cache for loaded components (can be tiered internally)
4. **Clear invalidation API** - `invalidate(id)`, `invalidateAll()`, with defined semantics
5. **Cache statistics** - Built-in stats for debugging (`cache.getStats()`)

The cache will be a separate module (`loader-cache.ts`) with its own unit tests.

**Consequences:**

- (+) Predictable cache behavior
- (+) Easier to debug cache issues
- (+) Single place to look for caching logic
- (+) Can optimize caching strategy independently
- (-) Need to carefully migrate to avoid performance regression
- (-) Legacy caches (ConsumerComponent, dependency) remain outside V2 scope

---

## ADR-007: Upfront Dependency Resolution (No Runtime Recursion)

**Date:** 2024-01-XX

**Status:** Proposed (needs validation - may not be feasible)

**Context:**
Currently, loading a component can trigger loading of other components at runtime:

```
Load component A
  → Discovers it needs env B → triggers load of B
    → B needs env-of-env C → triggers load of C
      → C has extensions D, E → triggers load of D, E...
```

This recursive loading is:

1. **Hard to debug** - no visibility into what triggered what
2. **Hard to predict** - same component may load different things depending on call path
3. **Performance risk** - can cause waterfall of loads instead of batched loads
4. **Breaks mental model** - "load component A" does unpredictable amount of work

**Ideal Solution (if feasible):**
Resolve ALL dependencies upfront during the Resolution phase:

1. **Resolution phase discovers everything** - Before any component is hydrated, we know
   the complete set of components that will be loaded (envs, env-of-envs, extensions, etc.)

2. **LoadPlan contains full dependency graph** - The plan explicitly shows what depends on what

3. **No surprise loads during hydration/execution** - If a component needs another component,
   that component is already in the plan and will be loaded in the correct order

4. **Batched loading** - Since we know everything upfront, we can batch loads efficiently

**Open Questions:**

- Can we actually know all dependencies without partially loading components first?
- Some dependencies may only be discoverable after loading (e.g., dynamic env selection)
- The current recursive approach may exist for good reasons we don't fully understand yet

**Alternative (if full upfront resolution isn't possible):**
At minimum, make the recursive loading **visible and traceable**:

- Add a "load trace" that shows the chain of what triggered what
- Log when recursive loads happen
- Make it possible to debug without stepping through complex call stacks

**Consequences (if implemented):**

- (+) Predictable behavior - "load component A" does exactly what the plan says
- (+) Debuggable - can inspect the LoadPlan to see all dependencies
- (+) Better performance - can batch all loads
- (+) Clearer mental model - Resolution = figure out what, Execution = do it
- (-) Resolution phase may be slower (needs to discover everything upfront)
- (-) May need to handle cycles carefully during resolution
- (-) **May not be possible** - need to validate during Phase 2 implementation

---

## ADR-008: Simplify Legacy ConsumerComponent Creation

**Date:** 2024-01-XX

**Status:** Accepted

**Context:**
Even though we're keeping `ConsumerComponent` (ADR-002), its current creation process is hard to follow:

1. **Hooks jump into Harmony** - `onConfigLoad`, `loadDependencies`, etc. cause control flow
   to jump between legacy code and Harmony aspects unpredictably

2. **Debugger is useless** - The call stack bounces around so much that stepping through
   doesn't help understand what's happening

3. **Implicit side effects** - Hooks can modify state, load other components, etc.

**Decision:**
In V2, ConsumerComponent creation will be more linear:

1. **Gather all data first** - Collect config, files, dependencies before creating ConsumerComponent

2. **Minimize hooks during creation** - Move hook calls to explicit phases where they're expected

3. **Make hook calls visible** - If a hook must be called, it should be clear in the code flow
   (not buried in a utility function)

4. **Consider hook batching** - Instead of calling hooks per-component, batch them where possible

We're NOT removing ConsumerComponent or its hooks, just making the creation flow easier to follow.

**Consequences:**

- (+) Easier to debug legacy component creation
- (+) Can step through code linearly
- (+) Side effects are more visible
- (-) May require refactoring how hooks are called
- (-) Need to ensure behavioral compatibility

---

## Template for New Decisions

```
## ADR-XXX: Title

**Date:** YYYY-MM-DD

**Status:** Proposed | Accepted | Deprecated | Superseded

**Context:**
What is the issue that we're seeing that is motivating this decision?

**Decision:**
What is the change that we're proposing?

**Consequences:**
What becomes easier or more difficult because of this change?
```
