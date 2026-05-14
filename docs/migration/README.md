# ESM + Lazy-Aspects Migration — Work Chunks

Plan documents for executing the architecture described in
[`../rfc-esm-lazy-aspects.md`](../rfc-esm-lazy-aspects.md).

Each chunk is sized to fit a single PR (1–5 days of focused work). Pick one and
read just its file; you do not need to read the whole RFC to start.

## Chunks

| # | Chunk | Depends on | Risk | Effort |
| --- | --- | --- | --- | --- |
| [01](./01-bench-harness.md) | Startup benchmark harness | — | Low | 2 days |
| [02](./02-aspect-create-api.md) | `Aspect.create` API extension (manifest contract) | — | Low | 1 day |
| [03](./03-lazy-harmony-resolve.md) | Lazy `Harmony.resolve` (new API alongside `get`) | 02 | Medium | 3–5 days |
| [04](./04-single-aspect-pilot.md) | Single-aspect end-to-end pilot (`status`) | 02, 03 | Medium | 2–3 days |
| [05](./05-command-index-codegen.md) | Command index codegen + validation | 04 | Low | 2 days |
| [06](./06-slot-producer-index.md) | Slot-producer index for cross-aspect contributions | 05 | Medium | 2–3 days |
| [07](./07-bulk-migration.md) | Bulk descriptor + thunk migration (all aspects) | 04, 05 | Medium | 5+ days |
| [08](./08-user-extension-lazy.md) | User/workspace extensions use `harmony.resolve` | 03 | Medium | 2 days |
| [09](./09-esm-source-migration.md) | CJS→ESM source migration (phased) | — (parallel-safe) | High | 10+ days |
| [10](./10-publish-bundling.md) | Rollup publish bundle for `@teambit/bit` | 07, 09 | Medium | 3–4 days |
| [11](./11-cleanup.md) | Remove eager fallback, finalize | 10 | Low | 1–2 days |

## Dependency graph

```
01 ──────────────────────────────────────────────► (gates all later perf claims)
02 ─► 03 ─► 04 ─► 05 ─┬─► 06
                      └─► 07 ─► 10 ─► 11
              03 ─────────► 08
09 (independent track, can run in parallel from day 1)
```

## How to use this

1. **Pick a chunk** that's not blocked.
2. **Read the file** for that chunk — it's self-contained.
3. **Open an issue / PR** that references the chunk number in the title.
4. **Update this README's status column** when the chunk lands.

## Status legend

- _Not started_ — default.
- _In progress_ — owner listed; check the chunk file for a link to the PR.
- _Landed_ — merged; the chunk file's "Acceptance criteria" all check.

## Reading order if you have one hour

1. RFC §1, §2, §5 (the architecture).
2. [`04-single-aspect-pilot.md`](./04-single-aspect-pilot.md) (proves it works end-to-end).
3. [`07-bulk-migration.md`](./07-bulk-migration.md) (where the bulk of mechanical work is).
