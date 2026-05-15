# Chunk 03 — Lazy `Harmony.resolve`

| Field | Value |
| --- | --- |
| Depends on | 02 |
| Blocks | 04, 06, 08 |
| Risk | Medium |
| Effort | 3–5 days |

## Goal

Add `Harmony.resolve(aspectId)` — an async, on-demand aspect loader — alongside
the existing synchronous `Harmony.get(aspectId)`. Extend `Harmony.load` to
accept a `manifestOnly` parameter for cheap manifest registration without
runtime instantiation.

`Harmony.get` keeps its current semantics (throws if not yet resolved). `resolve`
becomes the new way to materialize an aspect when you can't be sure it has
loaded.

## Why now

Every later chunk needs `resolve`. Land it standalone and unused so it can be
audited as a focused change.

## Scope

### New API

`scopes/harmony/harmony/harmony.ts`:

```ts
class Harmony {
  // EXISTING
  static async load(rootAspects: Aspect[], runtimeName: string, config: ConfigMap): Promise<Harmony>;
  get<T>(aspectId: string): T;  // throws if not resolved

  // NEW
  static async load(
    rootAspects: Aspect[],
    runtimeName: string,
    config: ConfigMap,
    manifestOnly?: Aspect[],          // NEW — register but don't resolve
  ): Promise<Harmony>;

  async resolve<T>(aspectId: string): Promise<T>;  // NEW
  registerManifest(aspect: Aspect): void;          // NEW (public version of internal)
}
```

### Behavior contract

- `resolve(id)`:
  - returns the cached instance if already resolved
  - returns the in-flight promise if loading (reentrant-safe)
  - otherwise: look up manifest → call `aspect.runtimes[this.runtimeName]()` →
    `pickRuntimeExport(mod)` → register manifests of runtime-deps lazily →
    `Promise.all` resolve each → invoke `provider()` → cache → return.
- `get(id)`: throws if not resolved. **Unchanged.**
- `load(roots, runtime, config, manifestOnly = [])`: registers all manifests
  (transitively), resolves only `roots`. Manifests in `manifestOnly` are
  registered for later discovery but not resolved.

### `pickRuntimeExport` heuristic

```ts
function pickRuntimeExport(mod: Record<string, unknown>) {
  for (const key of Object.keys(mod)) {
    const v = mod[key];
    if (typeof v === 'function' && typeof (v as any).provider === 'function') return v;
  }
  return null;
}
```

Adopted from the prototype (RFC §11.3 #7). This lets us discover the runtime
class without mandating a specific export name.

## Feature flag

Behind `BIT_LAZY_RESOLVE=1` for the first PR. Default behavior unchanged.

The flag enables `resolve` to be wired into the loader for aspects that have
`runtimes` set. Without the flag, calling `resolve(id)` is functionally
equivalent to `get(id)` after eager load (i.e., it returns the already-resolved
instance).

## Implementation steps

1. Add `Harmony.resolve`, `Harmony.registerManifest`, and the new `load`
   signature.
2. Add `loading` and `instances` maps if not already present (the existing
   code has equivalents; align names).
3. Implement deduplication via `loading` map (concurrent `resolve(x)` returns
   the same promise).
4. Add unit tests:
   - Resolve an aspect with no deps.
   - Resolve an aspect with deps; assert deps loaded first.
   - Concurrent resolve of the same id resolves once.
   - Resolve an aspect that throws in `provider()` propagates the error.
   - `manifestOnly` aspects are registered but not resolved.
5. Add tracing hook (`onAspectLoad(aspectId, ms)`) for the bench harness to
   consume.

## Acceptance criteria

- [ ] All new APIs documented with TSDoc.
- [ ] Unit tests cover the 5 cases above.
- [ ] `bit compile` and existing test suite pass with no behavior change in
      eager mode (default).
- [ ] `BIT_LAZY_RESOLVE=1` mode does not regress any benchmark scenario
      (chunk 01) — should be neutral or faster since unused aspects are skipped.
- [ ] Tracing hook integrates with `BIT_TRACE_ASPECT_LOAD=1` env var.

## Risks

- **Subtle race conditions** in concurrent `resolve` if the `loading` map is
  cleared too eagerly. Mitigation: write the concurrency test first.
- **Throwing providers leave stale entries in `loading`.** Mitigation: clear
  `loading.delete(id)` in the catch path.
- **Slot timing.** Today, a slot consumer assumes all contributors have run.
  Under lazy resolve, contributors may not have loaded yet. **This chunk does
  not fix that** — see chunk 06. Until then, code paths that depend on slot
  completeness must opt out of lazy mode.

## Files touched

- `scopes/harmony/harmony/harmony.ts`
- `scopes/harmony/harmony/harmony.spec.ts`
- `scopes/harmony/harmony/types.ts` (if separate)

## Out of scope

- Wiring it into the CLI dispatcher (chunk 04).
- Slot contribution correctness (chunk 06).
- User extension loading (chunk 08).
