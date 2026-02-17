# Goals

## Workstream 1: Runtime Optimizations (ACTIVE)

Primary:

- Preserve instant UI boot on merged rspack path
- Ensure offline refresh never blanks the app shell
- Ensure user bar accurately distinguishes:
  - main server offline
  - previews loading/offline
  - online recovery

Secondary:

- Eliminate JS-as-HTML fallback regressions (`Unexpected token '<'`)
- Confirm cross-workspace/branch SW/cache isolation
- Resolve or mitigate `EMFILE` watcher pressure in `--dev`

## Workstream 2: Rspack Migration (COMPLETED AT CORE LEVEL)

Status:

- Migration was merged from `master` into `perf/runtime-optimizations`.

Remaining follow-up scope:

- rspack performance hardening and env-level follow-ups only
- no migration-bootstrap work unless new gaps are found

## Non-goals

- Paper improvements that shift cost to runtime
- Claims without baseline comparison
- Hardcoded dependency/package lists
