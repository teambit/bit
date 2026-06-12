## ADDED Requirements

### Requirement: Swallowed load errors become component issues

When a component's aspect, env, or extension fails to load _terminally_ (the loader continues best-effort and does not recover the aspect later in the same command), the loader SHALL attach a load-failure issue to the failing component itself (when it's a workspace component) carrying the failing id, the load phase, and the error message. Components merely _using_ the failed aspect/env SHALL NOT each carry the issue; they are aggregated into a workspace-level issue (see the aggregation requirement).

Because Bit's load is intentionally multi-pass (an aspect may fail at one stage and load successfully at a later one, e.g. after on-the-fly compilation), failures SHALL only be reported from sites proven terminal-for-the-command — the `require-aspects` path in the aspect loader (reached only after the inline compile-and-reload retry is exhausted, and a failed aspect is never silently re-attempted) and installed-aspect resolution in the workspace aspects loader (a synchronous module-not-found on disk). Best-effort batch catch sites that a later pass can recover from (e.g. `loadCompsAsAspects`) SHALL NOT report, to avoid false positives.

#### Scenario: Env fails to load

- **WHEN** an env aspect that is a workspace component throws during require and the loader continues
- **THEN** the env component carries a load-failure issue naming the failing id and the error, and the load still completes as before

#### Scenario: Control flow unchanged

- **WHEN** an aspect load error that was previously swallowed occurs
- **THEN** the operation succeeds or fails exactly as it did before this change; only the issue attachment is new

### Requirement: Issues visible in bit status

Load-failure issues SHALL surface through the existing component-issues mechanism so `bit status` displays them per component, with text clarifying the failure was non-fatal.

#### Scenario: Status shows the failure

- **WHEN** the user runs `bit status` in a workspace where a component's env failed to load
- **THEN** that component is listed with a load-failure issue naming the env and the error

### Requirement: Non-blocking severity

Load-failure issues SHALL NOT block `bit tag`/`bit snap` (issue type configured as non-tag-blocking).

#### Scenario: Tag proceeds despite load issue

- **WHEN** a component has only a load-failure issue and the user runs `bit tag`
- **THEN** tagging proceeds without requiring `--ignore-issues`

### Requirement: Aggregation of failures affecting many components

A load failure of an aspect/env used by other components SHALL surface as a single workspace-level issue (rendered in the "workspace issues" section of `bit status`) naming the failing id, the error, and the number of affected components — instead of attaching an issue to every consumer.

#### Scenario: Shared env failure across many components

- **WHEN** one env fails to load while loading 50 components that use it
- **THEN** `bit status` shows one workspace-level issue naming the env, the error, and "affects 50 components", and none of the 50 consumers carries a per-component issue for it

### Requirement: Deduplication and install-context suppression

Within one load request, identical failures SHALL be reported once per (failing id, phase); failures matched by the existing install-context ignore rules (e.g. ESM `import.meta` errors during `bit install`) SHALL NOT produce issues.

#### Scenario: Mid-install noise suppressed

- **WHEN** an aspect fails with an `import.meta` error during `bit install`
- **THEN** no load-failure issue is attached
