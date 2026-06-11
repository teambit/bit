## ADDED Requirements

### Requirement: Swallowed load errors become component issues

When a component's aspect, env, or extension fails to load and the loader continues best-effort (today's log-and-continue catch sites, including `loadCompsAsAspects` in the workspace component loader, the `requireAspects` error path in the scope aspects loader, and installed-aspect resolution in the workspace aspects loader), the loader SHALL attach a load-failure issue to the affected component(s) carrying the failing id, the load phase, and the error message.

#### Scenario: Env fails to load

- **WHEN** a component's env aspect throws during require and the loader continues
- **THEN** the component carries a load-failure issue naming the env id and the error, and the load still completes as before

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

### Requirement: Deduplication and install-context suppression

Within one load request, identical failures SHALL be reported once per (component, failing id, phase); failures matched by the existing install-context ignore rules (e.g. ESM `import.meta` errors during `bit install`) SHALL NOT produce issues.

#### Scenario: Shared env failure across many components

- **WHEN** one env fails to load while loading 50 components that use it
- **THEN** each affected component carries at most one issue for that env, and the failure is not duplicated per load attempt

#### Scenario: Mid-install noise suppressed

- **WHEN** an aspect fails with an `import.meta` error during `bit install`
- **THEN** no load-failure issue is attached
