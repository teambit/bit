## ADDED Requirements

### Requirement: Trace context per top-level load

Every top-level component or aspect load (entry via `WorkspaceComponentLoader.get/getMany`, `WorkspaceAspectsLoader.loadAspects`, `ScopeComponentLoader.get/getMany`) SHALL run within a load-trace context carrying a unique request id. Nested loads triggered during that load (extension merging, aspect loading, scope loads, recursion into other components) SHALL join the existing context as child spans rather than starting a new one.

#### Scenario: Nested aspect load inherits the trace

- **WHEN** `workspace.getMany` is called and loading a component triggers `workspace.loadAspects` for its env
- **THEN** log lines emitted by the aspects loader carry the same trace id as the originating `getMany` call

#### Scenario: Independent loads get distinct trace ids

- **WHEN** two separate top-level commands each trigger a component load
- **THEN** their log lines carry two different trace ids

### Requirement: Hierarchical log correlation

Log messages emitted within an active trace SHALL be prefixed with the trace id and the span path, so that running with `BIT_LOG=*` (or reading debug.log) allows reconstructing the load as a tree.

#### Scenario: Debug log readable as a tree

- **WHEN** a component with a non-core env is loaded with `BIT_LOG=*`
- **THEN** the output shows the env's aspect-load log lines nested under (prefixed by) the component's load trace, replacing the previous ad-hoc `[<callId>] loadAspects` prefix

### Requirement: Stage-level timing spans

The loader SHALL record a timing span (name, start, duration, attributes) for each load stage — id resolution, filesystem load, scope/model load, extension merge, env calculation, dependency resolution, per-aspect aspect loading, and each `onComponentLoad` handler per aspect — with span collection always on and span retention limited to the lifetime of the trace.

#### Scenario: Slot handler timing recorded

- **WHEN** a component is loaded and the docs aspect's `onComponentLoad` handler runs
- **THEN** the trace contains a span identifying the docs aspect with its duration

#### Scenario: Cache hit recorded on span

- **WHEN** a component load hits the workspace components cache
- **THEN** the corresponding span's attributes record which cache was hit, and no stage spans for the skipped work are created

### Requirement: No behavioral impact

Tracing SHALL NOT alter load results, caching behavior, error handling, or which operations succeed; disabling or losing the trace context (e.g. across process boundaries) SHALL only degrade log prefixing, never fail a load.

#### Scenario: Load result identical with tracing active

- **WHEN** the same component is loaded with and without an active trace context
- **THEN** the resulting component state is identical
