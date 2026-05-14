# Chunk 07 — Bulk Descriptor + Thunk Migration

| Field | Value |
| --- | --- |
| Depends on | 04 (pattern proven), 05 (codegen ready) |
| Blocks | 10 (publish bundle), 11 (cleanup) |
| Risk | Medium |
| Effort | 5+ days; can be split into sub-PRs by cohort |

## Goal

Apply the pilot pattern from chunk 04 to **every aspect** in the codebase:
add the `runtimes` thunk to each `.aspect.ts`, extract descriptors into
`*.commands.ts`, and switch `cli.register(...)` calls to the descriptor +
handler shape.

Mechanical work, but wide. Best done via a codemod with manual review per
cohort.

## Why now

After chunks 02–06, the architecture is in place and proven on one aspect.
This is the scaling step.

## Scope

### Migration targets

Per the analysis at the start of this effort: ~120 core aspects in
`scopes/harmony/bit/manifests.ts`, plus a handful in `components/`. Of these:

- **~80 own commands** → need `*.commands.ts` + class refactor.
- **~120 have a `.main.runtime.ts`** → need `runtimes` thunk in `.aspect.ts`.
- **~30 have a `.ui.runtime.ts` too** → need a second thunk for `ui`.

### Codemod

`scripts/codemod/migrate-aspect.mjs`:

For each aspect directory:

1. **Add `runtimes` to `.aspect.ts`** if not present:
   ```ts
   runtimes: {
     main: () => import('./<aspect-name>.main.runtime.js'),
   },
   ```
   (Plus `ui: () => import('./<aspect-name>.ui.runtime.js')` if applicable.)

2. **Extract command descriptors** by static analysis of the aspect's
   `.main.runtime.ts`:
   - Find every `cli.register(new XCmd(...))` call.
   - Locate the `XCmd` class declaration.
   - Read its static fields (`name`, `alias`, `description`, `options`, `group`,
     `loader`, `loadAspects`, `private`, `helpUrl`, etc.).
   - Emit `*.commands.ts` with one descriptor per command.

3. **Rewrite the command class** to read static fields from the descriptor:
   ```ts
   import descriptors from './x.commands';
   const d = descriptors[0];

   export class XCmd implements Command {
     name = d.name;
     description = d.description;
     // ...
   }
   ```

4. **Rewrite `cli.register` calls** in the provider to use the new shape (when
   the new shape lands in chunk 04). For now, the class instance still has all
   the fields, so this step is no-op in chunk 07.

### Rollout in cohorts

Don't migrate all 120 aspects in one PR. Group by domain:

| Cohort | Aspects (approx) | Why grouped |
| --- | --- | --- |
| Cohort A — leaves | logger, config, harmony-core | No or few aspect deps |
| Cohort B — workspace core | workspace, scope, component | Foundational |
| Cohort C — dependencies | dependency-resolver, install, isolator, pkg | Tight cluster |
| Cohort D — compilation | compiler, builder, generator | Tight cluster |
| Cohort E — testing | tester, mocha, jest | Tight cluster |
| Cohort F — UI / IDE | ui, vite, react, vue, angular, ng-react | Heavy, UI-runtime aware |
| Cohort G — long-tail | everything else | Remaining ~30 |

One PR per cohort. Each PR can land independently because the new shape is
backward compatible (the `runtimes` thunk is unused unless `BIT_LAZY_RESOLVE=1`
is set).

### Validation per cohort

- All aspects in the cohort must round-trip via `bit compile`.
- Their commands' e2e tests must pass.
- The bench harness (chunk 01) is run with `BIT_LAZY_RESOLVE=1`; no regression
  vs the previous cohort's baseline.
- The descriptor↔class assertion (chunk 04) runs in CI for every migrated
  aspect.

## Acceptance criteria

- [ ] Every aspect in `manifests.ts` has a `runtimes` thunk.
- [ ] Every aspect that registers commands has a `*.commands.ts` file.
- [ ] Every command class reads static fields from its descriptor (no
      duplication).
- [ ] Codegen (chunk 05) regenerates `command-index.generated.ts` cleanly with
      no manual edits.
- [ ] Under `BIT_LAZY_RESOLVE=1`, all benchmark scenarios show improvement
      vs the chunk 01 baseline.
- [ ] All e2e tests pass in both eager and lazy modes.

## Risks

- **Aspect-specific quirks** the codemod doesn't handle (dynamic command
  registration, conditional registration, subcommand chains). Mitigation:
  codemod emits a `MIGRATION_NOTES.md` per aspect listing what it skipped;
  manual follow-up.
- **Sheer volume of PR review.** Mitigation: one cohort per PR; ~10–20 aspects
  each; reviewers focus on the codemod output diff being mechanical.
- **Implicit slot contributions** discovered during migration. Mitigation:
  chunk 06's producer index. If unblocking issues found, add manual
  `contributesTo` annotations.

## Files touched

- `scripts/codemod/migrate-aspect.mjs` (new)
- ~120 `.aspect.ts` files (one-line addition each)
- ~80 `*.commands.ts` files (new)
- ~80 command class files (descriptor binding)
- Possibly aspect `index.ts` files (re-export `*.commands.ts`)

## Out of scope

- Slot contribution audit beyond what chunk 06 already covers.
- Removing the eager-mode fallback (chunk 11).
- The actual flip to lazy-as-default (also chunk 11).
