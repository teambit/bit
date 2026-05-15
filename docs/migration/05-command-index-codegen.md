# Chunk 05 — Command Index Codegen + Validation

| Field | Value |
| --- | --- |
| Depends on | 04 |
| Blocks | 06, 07, 10 |
| Risk | Low |
| Effort | ~2 days |

## Goal

Build a codegen script that produces `command-index.generated.ts`:
a static name → aspectId map plus aggregated descriptor array. Replaces the
manual pilot wiring from chunk 04.

## Why now

Once the pilot (chunk 04) proves the descriptor shape, this is the tooling that
lets us scale to all aspects without hand-wiring each. The slot-producer index
(chunk 06) reuses the same codegen infrastructure.

## Scope

### Script

`scripts/codegen/build-command-index.mjs`:

1. **Find all `*.commands.ts` files** under `scopes/` and `components/`.
2. **Import each** (or parse statically — TS AST via `ts-morph`) and collect
   descriptors.
3. **Validate** every descriptor:
   - Has `name`, `description`, `aspectId`.
   - `aspectId` points to an aspect that exists in
     `scopes/harmony/bit/manifests.ts`.
   - No duplicate `name` or `alias` across aspects.
4. **Emit** `scopes/harmony/bit/command-index.generated.ts`:
   ```ts
   // AUTO-GENERATED — do not edit by hand. Run scripts/codegen/build-command-index.mjs
   import statusDescriptors from '@teambit/status/status.commands';
   import installDescriptors from '@teambit/install/install.commands';
   // ... one import per aspect with descriptors

   export const ALL_DESCRIPTORS: CommandDescriptor[] = [
     ...statusDescriptors,
     ...installDescriptors,
     // ...
   ];

   export const COMMAND_INDEX: Record<string, { aspectId: string }> = {};
   for (const d of ALL_DESCRIPTORS) {
     COMMAND_INDEX[d.name] = { aspectId: d.aspectId };
     if (d.alias) COMMAND_INDEX[d.alias] = { aspectId: d.aspectId };
   }
   ```

### Integration

- Run as part of `bit compile` (post-compile step on the bit package itself).
- Commit the generated file so the source repo is buildable without running
  codegen (faster CI, easier diffs).
- Add a CI check: re-run codegen on PRs; fail if the file differs from what's
  committed.

### Runtime validation

At startup (dev mode only, gated by `BIT_VALIDATE_INDEX=1`):

```ts
function validateIndex() {
  // After eager bootstrap, compare:
  //   ALL_DESCRIPTORS (from index)
  // against
  //   the live commandsSlot.values().flat()
  // Diff → throw with a clear message.
}
```

Catches drift between the generated index and reality during the transition.

## Acceptance criteria

- [ ] `scripts/codegen/build-command-index.mjs` runs in <5s on the workspace.
- [ ] Generated file is committed and includes every command currently
      registered in the workspace.
- [ ] CI check fails if generated file is stale.
- [ ] Startup validation (under `BIT_VALIDATE_INDEX=1`) catches any drift.
- [ ] `bit --help` reads from `ALL_DESCRIPTORS`, not from a live slot.
- [ ] Benchmark `--help` shows reduced startup time (no provider invocations
      needed to enumerate commands).

## Risks

- **Aspects that register commands dynamically** (rare but possible). Codegen
  must detect them and warn. List + manual handling.
- **Stale generated file on incremental builds.** Mitigation: include the
  generation step in `npm run setup` and CI.
- **Cross-package import paths**. The generated file imports from
  `@teambit/status/status.commands`, which means each aspect must export
  `*.commands.ts` from its package entry. Audit `index.ts` files.

## Files touched

- `scripts/codegen/build-command-index.mjs` (new)
- `scopes/harmony/bit/command-index.generated.ts` (new, committed)
- `.github/workflows/codegen-check.yml` (new)
- Possibly each aspect's `index.ts` to re-export `*.commands.ts`.

## Out of scope

- Slot-producer index (chunk 06 — separate codegen with same tooling).
- Bundling the index into the publish artifact (chunk 10).
- Adding descriptors to aspects that don't yet have them (chunk 07).
