# Chunk 02 — `Aspect.create` API Extension

| Field | Value |
| --- | --- |
| Depends on | — |
| Blocks | 03, 04, 07 |
| Risk | Low |
| Effort | ~1 day |

## Goal

Extend the `Aspect.create` API in `@teambit/harmony` to accept two new fields:
`runtimes` (lazy import thunks) and an optional `defaultConfig`. **Existing call
sites do not change** — both fields are optional, fully backward compatible.

## Why now

This is the API contract every subsequent chunk depends on. Land it standalone
so chunks 03, 04, 07 can rely on the types existing.

## Scope

### Type changes

In `scopes/harmony/harmony/aspect/aspect.ts` (the Harmony source):

```ts
export interface AspectOptions {
  id: string;
  dependencies?: Aspect[];
  declareRuntime?: RuntimeDefinition;
  defaultConfig?: Record<string, unknown>;

  // NEW: per-runtime lazy loader.
  // Bundler recognizes the thunk pattern and emits a code-split chunk.
  runtimes?: Record<string, () => Promise<Record<string, unknown>>>;
}
```

### Class changes

`Aspect` instance stores `runtimes` if provided. No behavior change yet —
just data carried.

### Backward compatibility

- All existing `Aspect.create({ id, dependencies, declareRuntime })` calls
  continue to type-check.
- Aspects with `runtimes` keep working in eager mode (the loader uses the
  static `manifests` map as today).

## Implementation steps

1. Update `AspectOptions` interface and `Aspect` constructor.
2. Add JSDoc to `runtimes` explaining the thunk semantics.
3. Add a unit test asserting an aspect with `runtimes` round-trips correctly.
4. **Do not** change any `.aspect.ts` files yet — that's chunk 04 and 07.

## Acceptance criteria

- [ ] `scopes/harmony/harmony/aspect/aspect.ts` compiles with new fields.
- [ ] Unit test in `aspect.spec.ts` covers `runtimes` field.
- [ ] `bit compile` succeeds across the workspace; no existing call site needs
      changes.
- [ ] No measurable startup-time delta vs baseline (chunk 01).
- [ ] No new dependencies added to `@teambit/harmony`.

## Risks

- **Types may leak through public exports.** Mitigation: keep `runtimes` as an
  optional shallow object; consumers don't need to know about it unless they
  use it.

## Files touched

- `scopes/harmony/harmony/aspect/aspect.ts`
- `scopes/harmony/harmony/aspect/aspect.spec.ts` (new test cases)

## Out of scope

- Actually using `runtimes` to load anything — that's chunk 03.
- Adding thunks to real aspects — that's chunk 04 / 07.
- The companion `commands` thunk — that lives on a separate mechanism (chunk 05),
  not on `Aspect.create`.
