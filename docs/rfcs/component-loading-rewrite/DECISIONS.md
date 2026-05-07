# Decision Log

Decisions feeding the component-loading rewrite. Each entry: what was decided,
why, and what evidence shaped it. New decisions go at the top.

---

## D-001: The env↔component recursion is a topological-ordering problem, not a cycle

**Date:** 2026-05-07
**Status:** Accepted

### Context

PR #10086's V2 loader stubbed out the Enrichment phase (returning empty
`envsData` and `depResolverData`) and bypassed the dependency resolver because
calling them inline triggered recursive `workspace.get()` calls. We need to
understand the actual cycle before designing the new pipeline — otherwise any
rewrite ends up with the same workaround.

### Investigation: what the cycle actually is

There are three distinct call paths that look like recursion. Only one is a
real DAG-ordering problem; the other two are gated explicitly in V1.

**Path 1 — Env loading (the real one).** When the dep resolver computes a
component's env policy, it needs the env _Component object_ to read its
manifest:

```
WorkspaceComponentLoader.loadOne                         (loader.ts:790)
  → DependencyResolverMain.getEnvPolicyFromFile          (dep-resolver.ts:1221)
    → EnvsMain.getEnvComponentByEnvId                    (environments.ts:490)
      → host.get(envId)                                  (environments.ts:493)
        → WorkspaceComponentLoader.get                   (loader.ts:704)
          → loadOne                                      → cycle
```

This is a **DAG**, not a true cycle, _unless_ env A depends on env A (which is
disallowed). Component → env → env-of-env → core-env terminates at the core
envs. The "infinite loop" symptom appears only when the loader doesn't
guarantee envs are loaded before their dependents.

**Path 2 — `componentExtensions` with `loadExtensions: true`.** Calling
`Workspace.componentExtensions` (`workspace.ts:1647`) with `loadExtensions:
true` invokes `loadComponentsExtensions` → `loadAspects` →
`importAndGetAspects` → `workspace.importAndGetMany` → `workspace.get`. This
is a real cycle that V1 tames by:

- Always passing `loadExtensions: false` from the bulk loader
  (`loader.ts:127`, `:517`, `:576`, `:805`).
- Setting `idsToNotLoadAsAspects` in `importAndGetAspects` so the loader
  short-circuits when asked to load the seeders as aspects
  (`workspace-aspects-loader.ts:771-776`, with explicit comment: _"once you
  try to load the seeder it will try to load the workspace component that
  will arrive here again and again"_).
- Memoizing `componentLoadedSelfAsAspects` so each component is "self-loaded
  as an aspect" at most once (`loader.ts:457-480`).

**Path 3 — `warnAboutMisconfiguredEnv`.** Calls `this.get(parsedEnvId)` from
inside `componentExtensions` (`workspace.ts:1677`). Gated behind
`loadExtensions: true` and only fires post-load.

### Investigation: how V1 actually terminates Path 1

V1 uses **topological pre-ordering** in `buildLoadGroups` (`loader.ts:218-341`):

1. Core envs first (`teambit.harmony` envs that don't need loading).
2. Workspace-component envs, layered:
   `regroupEnvsIdsFromTheList` (`loader.ts:358-378`) splits the env list into
   "envs that are envs of other envs in this list" and "everything else", and
   loads the first group before the second.
3. Extensions, also layered.
4. Regular components last.

The trick is that by the time a regular component needs its env, the env is
already in `componentsCache` and `getEnvComponentByEnvId` returns from cache —
no recursion.

V1's blind spot is documented in code: `regroupEnvsIdsFromTheList` only
handles **one level** of env-of-env (the comment at `loader.ts:353` says _"At
the moment this function is not recursive, in the future we might want to
make it recursive"_). For deeper chains (env-of-env-of-env), V1 falls back on
hardcoded special cases for the bit core repo (`loader.ts:311-323`).

### Decision

Treat env loading as a topological-ordering problem, not as something to
"break" with a cycle detector or a stub. Specifically:

1. **Keep V1's two-pass shape.** Bulk-load components with
   `loadExtensions: false, executeLoadSlot: false`, then run
   `loadComponentsExtensions` and slot execution in a second pass. This is
   what makes the cycle in Path 2 well-behaved; the V2 attempt collapsed
   these into one "Enrichment phase" and lost the ordering guarantee.

2. **Make env-DAG resolution properly recursive.** Replace
   `regroupEnvsIdsFromTheList`'s one-level grouping with a real topological
   sort over the env-of-env DAG. The hardcoded `core-aspect-env` workaround
   at `loader.ts:311-323` should fall out of this — if the sort is correct,
   no special-case is needed.

3. **Avoid `getEnvComponentByEnvId` during the inline enrichment of regular
   components.** What enrichment actually needs from the env is the env's
   _descriptor_ (`envId`, `type`, `services`), not the full Component. In V1
   this is already partially split: `EnvsMain.calculateEnv`
   (`environments.ts:657`) is **synchronous** and reads only the component's
   own aspect data. Use that for the descriptor, and only fall back to
   `getEnvComponentByEnvId` for operations that genuinely need the env's
   files (env manifest, env policy from file).

4. **Don't introduce a "lazy env binding" thunk on Component.** It would
   change the public API in ways that ripple across consumers expecting
   `envs.getEnv(component)` to work synchronously after load. The recursion
   isn't bad enough to justify it.

### What this rules out

- **A single-pass pipeline with inline enrichment** (the V2 attempt's
  approach). Cannot work without re-creating V1's mitigations, at which
  point the "single pass" claim is false.

- **A cycle-detection fallback.** The recursion is a DAG; a cycle detector
  would either be triggered by the legitimate DAG depth (and falsely report
  cycles) or be implemented as cache-with-in-flight-tracking, which is just
  topological ordering done badly.

- **Lazy env binding.** Out of scope. May revisit if a specific consumer
  forces it.

### What this implies for Step 3 (incremental seams)

- The first seam to extract is `LoadPlan` construction — specifically a
  proper topological sort over the env DAG. Land it as a pure function used
  by V1's `buildLoadGroups`. Verify with the diff harness that the sort is
  equivalent to V1's current grouping (plus the `core-aspect-env` special
  case becoming unnecessary). Only then move on.

- The Enrichment phase is the last thing to extract, not the first. It's
  the phase most entangled with the env recursion, and the easiest to get
  wrong. Build everything else first.

- The "two-pass" shape (load without extensions, then load extensions) is
  not a bug to fix. It's the load order that makes the rest tractable. If
  the rewrite collapses the two passes, it'll re-create PR #10086's
  problems.

### Evidence index

| Claim                                       | File:Line                                          |
| ------------------------------------------- | -------------------------------------------------- |
| Bulk load passes `loadExtensions: false`    | `workspace-component-loader.ts:127, 517, 576, 805` |
| `getEnvComponentByEnvId` calls `host.get`   | `environments.main.runtime.ts:490-498`             |
| Dep resolver calls `getEnvComponentByEnvId` | `dependency-resolver.main.runtime.ts:1221`         |
| Env load order grouping (one level)         | `workspace-component-loader.ts:358-378`            |
| Hardcoded `core-aspect-env` ordering        | `workspace-component-loader.ts:311-323`            |
| `idsToNotLoadAsAspects` recursion break     | `workspace-aspects-loader.ts:771-787`              |
| `calculateEnv` is synchronous, no recursion | `environments.main.runtime.ts:657-716`             |
| `componentLoadedSelfAsAspects` memoization  | `workspace-component-loader.ts:457-480`            |
