## ADDED Requirements

### Requirement: debug-load command

The CLI SHALL provide a `bit debug-load <component-id>` command (workspace-only) that clears the target component's caches, loads it inside a fresh trace, and prints a human-readable report of the load. The command SHALL use the shared CLI output formatter for section titles and symbols.

#### Scenario: Basic invocation

- **WHEN** the user runs `bit debug-load ui/button` in a workspace containing that component
- **THEN** the component is loaded fresh (not reported entirely from cache) and a report is printed with sections for stages/timings, extension sources, env resolution, and load issues

#### Scenario: Component not in workspace

- **WHEN** the user runs `bit debug-load` with an id that is not in the workspace
- **THEN** the command fails with a clear error naming the id, without a stack trace

### Requirement: Stages and cache report

The report SHALL show the span tree of the load: each stage and `onComponentLoad` handler with its duration, and for every cache consulted, whether it was a hit or miss.

#### Scenario: Stage timings printed

- **WHEN** `bit debug-load` completes
- **THEN** the output lists at minimum filesystem load, extension merge, env calculation, dependency resolution, and each onLoad handler (by aspect id) with durations

### Requirement: Extension-merge source table

The report SHALL show, for each extension in the component's final extension list, which configuration sources (bitmap, config-merge, component.json, workspace variants, model-specific, model non-specific) contributed it and which source won the merge, surfaced from the aspects-merger's existing pre-merge trace data.

#### Scenario: Variant vs model attribution

- **WHEN** a component gets extension A from workspace variants and extension B from its model
- **THEN** the table attributes A to the variants source and B to the model source

### Requirement: Env resolution explanation

The report SHALL show the component's resolved env id and which merge source determined it.

#### Scenario: Env from variants

- **WHEN** the component's env is set via a workspace variant
- **THEN** the report names the env id and identifies the variants source as the origin

### Requirement: JSON output

The command SHALL support a `--json` flag emitting the raw trace tree, merge-source data, env resolution, and issues as JSON for tooling.

#### Scenario: JSON flag

- **WHEN** the user runs `bit debug-load ui/button --json`
- **THEN** valid JSON containing the trace spans (with durations), extension sources, resolved env, and issues is printed to stdout
