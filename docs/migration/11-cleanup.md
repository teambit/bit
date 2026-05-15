# Chunk 11 — Remove Eager Fallback, Finalize

| Field | Value |
| --- | --- |
| Depends on | 10 (and everything before it) |
| Blocks | — |
| Risk | Low |
| Effort | 1–2 days |

## Goal

Flip lazy mode to the **default** and only mode. Remove the eager-mode
fallback, the CJS-only escape hatches, and now-dead code.

## Why last

This is irreversible (within a major version). Land it only after the bench
harness shows lazy mode is solid across at least one full release cycle and
no regressions surface from users.

## Scope

### Remove

- `BIT_EAGER` and `BIT_LAZY_RESOLVE` env vars and all branches.
- `scopes/harmony/bit/hook-require.ts` (CJS hook; obsolete in ESM).
- `aspect-loader.main.runtime.ts`'s synchronous `require()` paths for aspects.
- The `harmony.run(requireAspects)` eager-walk.
- Any `BIT_VALIDATE_INDEX=1` dev assertion (kept only during transition).
- Compatibility shims for CJS user aspects (after a deprecation window —
  see "Deprecation timeline" below).
- The `manifestsMap` walk in `load-bit.ts` that today registers all core
  aspects up front (replaced by the manifest-only registration via BitAspect
  + lazy resolve).

### Update

- `bit --help` rendering uses `ALL_DESCRIPTORS` exclusively.
- The `aspect-loader` package becomes thinner; consider whether it merges into
  Harmony or stays as a separate concern.
- Documentation: update the aspect-authoring guide to reflect:
  - The `runtimes` thunk requirement.
  - `*.commands.ts` for command-owning aspects.
  - The `harmony.resolve` API for inter-aspect dependencies that may not be
    pre-resolved.

### Deprecation timeline

- **At this chunk merge**: `BIT_EAGER` prints a deprecation warning if set;
  treats it as a no-op.
- **Next major version**: `BIT_EAGER` becomes an error (helps catch lingering
  callers).
- **Major+1**: CJS user-aspect shim removed. Users must republish ESM.

### Final verification

Run the full bench harness and confirm all targets from RFC §8 are met:

| Scenario | Target |
| --- | --- |
| `bit --version` | <100ms |
| `bit --help` | <150ms |
| `bit <typo>` | <100ms |
| `bit status` (no workspace) | <300ms |
| `bit status` (small workspace) | <500ms |
| `bit status` (large workspace) | <2s |

If any target is missed, **do not merge this chunk**. Open a perf investigation
chunk first.

### Loaded-aspect assertion

Add a CI check that runs `bit status` on a fixture workspace under
`BIT_TRACE_ASPECT_LOAD=1` and parses the output:

```
assert loaded.size < 25
```

The exact number depends on the fixture; ratchet it down over time. The
assertion is the regression gate against accidental eager-load creep.

## Acceptance criteria

- [ ] All eager-mode code paths removed.
- [ ] CJS-only escape hatches removed.
- [ ] Documentation updated for the new aspect-authoring model.
- [ ] All RFC §8 performance targets met.
- [ ] Loaded-aspect CI assertion is in place and passing.
- [ ] Migration documentation moved to historical archive
      (`docs/migration/archive/`) and replaced by an authoritative
      aspect-authoring guide.
- [ ] CHANGELOG entry for the major version drop describes the new behavior
      and any user-facing breaking changes.

## Risks

- **Hidden eager-mode dependencies in third-party tooling** (CI scripts,
  user automation). Mitigation: deprecation warning for a release cycle
  before hard removal.
- **User aspects still CJS**. Mitigation: deprecation timeline above; provide
  a migration guide for aspect authors.

## Files touched

- `scopes/harmony/bit/load-bit.ts` (significant simplification)
- `scopes/harmony/aspect-loader/aspect-loader.main.runtime.ts` (removal of
  `require()` paths)
- `scopes/harmony/bit/hook-require.ts` (deletion)
- `scopes/harmony/bit/manifests.ts` (becomes manifest-only registry)
- Documentation: `docs/aspect-authoring.md` (new), `docs/migration/archive/`
  (move chunk files here)

## Out of scope

- Major architectural changes beyond what's needed to remove the fallback.
- Aspirational improvements (e.g., switching DI frameworks).
