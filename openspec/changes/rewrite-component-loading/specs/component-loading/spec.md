## ADDED Requirements

### Requirement: Unified component loader API

The system SHALL provide a single `ComponentLoader` service that is the only public entry point for loading components from a workspace or scope. The loader SHALL expose exactly five public methods: `get`, `getMany`, `list`, `listIds`, and `invalidate`. All other component-loading code paths (`WorkspaceComponentLoader`, legacy `ComponentLoader.loadOne`, `ScopeComponentLoader.get`) SHALL be removed or reduced to private adapters owned by the unified loader.

#### Scenario: Single loader handles workspace component request

- **WHEN** a caller invokes `componentLoader.get(id, { phase: 'dependencies' })` for a component present in the workspace
- **THEN** the loader returns a `Component` whose `loadedPhase` is `dependencies`
- **AND** no other loader class is invoked during the call

#### Scenario: Single loader handles scope-only component request

- **WHEN** a caller invokes `componentLoader.get(id, { phase: 'files' })` for a component present only in the local scope (not the workspace)
- **THEN** the loader returns a `Component` materialised from the scope objects at phase `files`
- **AND** no separate `ScopeComponentLoader` class is consulted

#### Scenario: Listing IDs does not load components

- **WHEN** a caller invokes `componentLoader.listIds()`
- **THEN** the loader returns `ComponentID[]` derived from `.bitmap` only
- **AND** no `Component` instances are constructed
- **AND** no file is read beyond `.bitmap`

### Requirement: Phased lazy hydration

A component load SHALL proceed through five monotonic phases in this order: `identity`, `files`, `dependencies`, `extensions`, `aspects`. Loading a component at phase N SHALL compute exactly the data of phases ≤ N and SHALL NOT compute data of phases > N. Each `Component` instance SHALL carry a `loadedPhase` field indicating its current phase. When a caller invokes a method that requires a higher phase than the component's current phase, the loader SHALL upgrade the component in place to the required phase.

#### Scenario: Default phase for `bit status`

- **WHEN** the status command requests components via the loader
- **THEN** the loader loads each component at phase `dependencies`
- **AND** does not run extensions resolution
- **AND** does not load any component as an aspect

#### Scenario: Phase upgrade on access

- **GIVEN** a `Component` previously loaded at phase `dependencies`
- **WHEN** an aspect accesses the component's extensions data
- **THEN** the loader upgrades the component to phase `extensions` before returning the data
- **AND** the component's `loadedPhase` is set to `extensions` after the call

#### Scenario: Phases are additive — prior data is preserved

- **GIVEN** a component loaded at phase `dependencies`
- **WHEN** the loader upgrades it to phase `extensions`
- **THEN** all data computed at phases `identity`, `files`, and `dependencies` remains identical
- **AND** only the `extensions`-phase fields become populated

#### Scenario: `aspects` phase implies all earlier phases

- **WHEN** a caller requests `componentLoader.get(id, { phase: 'aspects' })`
- **THEN** the returned component has `loadedPhase = 'aspects'`
- **AND** all data from phases `identity`, `files`, `dependencies`, `extensions` is populated

### Requirement: Single component cache with content-hash validation

The loader SHALL maintain exactly one in-memory cache, the `ComponentCache`. Cache entries SHALL be keyed by the tuple `(serialized ComponentID, phase)`. Each entry SHALL store a content hash composed of all inputs that affect the loaded value at that phase (e.g. file mtimes for `files` phase, `.bitmap` hash for all phases, `workspace.jsonc` hash for `extensions` and `aspects` phases). On every cache lookup the loader SHALL validate the stored hash against the current inputs and SHALL discard a stale entry. The duplicate caches `componentsCache`, `scopeComponentsCache`, `componentsExtensionsCache`, `componentLoadedSelfAsAspects` (on both `Workspace` and `WorkspaceComponentLoader`), and `_componentsStatusCache` SHALL be removed.

#### Scenario: Cache hit on identical inputs

- **GIVEN** a component previously loaded at phase `dependencies` and stored in the cache
- **WHEN** the loader is asked for the same component at the same phase
- **AND** none of the inputs that compose the cache entry's hash have changed
- **THEN** the cached component is returned
- **AND** no filesystem read occurs beyond the hash inputs

#### Scenario: Cache miss on file change

- **GIVEN** a component cached at phase `files`
- **WHEN** a source file of that component is modified on disk
- **AND** the loader is asked for the component at phase `files`
- **THEN** the stale cache entry is discarded
- **AND** the component is reloaded from disk

#### Scenario: Cache invalidation on bitmap change

- **GIVEN** any cached entries for any phase
- **WHEN** `.bitmap` is modified
- **THEN** all cache entries whose hash includes the `.bitmap` hash are invalidated on next access

#### Scenario: Different phases share the cache, not the entry

- **GIVEN** a component cached at phase `files`
- **WHEN** the loader is asked for the same component at phase `dependencies`
- **THEN** the loader does not return the `files`-phase entry
- **AND** computes the `dependencies` phase, reusing the `files`-phase data internally
- **AND** stores a new entry keyed by `(id, 'dependencies')`

### Requirement: Direct harmony loading with derived legacy view

The loader SHALL construct a harmony `Component` directly from on-disk artifacts (`.bitmap`, source files, `component.json`, scope objects). The loader SHALL NOT load a legacy `ConsumerComponent` and convert it. The legacy `ConsumerComponent` representation SHALL be available through a `Component.asLegacy()` method that derives a read-only `ConsumerComponent` view on demand. Code that previously mutated `consumerComponent.extensions` in place SHALL be migrated to operate on the harmony `Component`.

#### Scenario: Harmony component built directly

- **WHEN** the loader loads a component at phase `files`
- **THEN** a harmony `Component` is constructed without invoking `consumer.loadComponentFromFileSystem`
- **AND** no `ConsumerComponent` instance is created during the load

#### Scenario: Legacy view derived on demand

- **WHEN** a legacy caller invokes `component.asLegacy()`
- **THEN** a `ConsumerComponent` view is materialised from the harmony component's data
- **AND** the view reflects the current state of the harmony component
- **AND** mutating the view's `extensions` property throws an error

#### Scenario: Dependency extraction reuses legacy code

- **WHEN** the loader computes the `dependencies` phase
- **THEN** it MAY delegate to the existing legacy dependency-extraction routines (AST walking)
- **AND** the result is written directly onto the harmony `Component`
- **AND** no `ConsumerComponent.extensions` mutation occurs

### Requirement: Progress event stream

The `Workspace` SHALL expose a typed event emitter `loadEvents`. The loader SHALL emit the following events for every `get` and `getMany` invocation: `load:start` (once per call), `load:phase:start` (once per phase actually executed), `load:component` (once per component completed at the requested phase, with `cached: boolean` and `durationMs`), `load:phase:end` (once per phase actually executed, with `durationMs`), and `load:end` (once per call, with `durationMs` and `failures`). All events SHALL include a `callId` that ties them together. Subscribers SHALL receive events synchronously. When no subscribers are registered, event emission SHALL impose no measurable overhead beyond an `EventEmitter.emit` no-op call.

#### Scenario: Events emitted in correct order

- **WHEN** a caller invokes `loader.getMany([a, b, c], { phase: 'dependencies' })`
- **THEN** exactly one `load:start` event is emitted with `ids: [a, b, c]` and `phase: 'dependencies'`
- **AND** for each phase actually executed, one `load:phase:start` and one `load:phase:end` event are emitted
- **AND** between them, three `load:component` events are emitted (one per component) at the `dependencies` phase
- **AND** exactly one `load:end` event is emitted last with the same `callId` as `load:start`

#### Scenario: Cached component emits a `cached: true` event

- **GIVEN** component `a` is already in the cache at phase `dependencies`
- **WHEN** the loader is asked for `a` at phase `dependencies`
- **THEN** a `load:component` event is emitted with `cached: true` and a `durationMs` measuring only cache lookup
- **AND** no `load:phase:start` event is emitted for a phase that did not need to run

#### Scenario: CLI status renderer subscribes

- **GIVEN** the CLI has subscribed to `workspace.loadEvents`
- **WHEN** components are being loaded
- **THEN** the CLI receives `load:component` events as each component completes
- **AND** can render a progress indicator like `loading 12/500 (dependencies)`

#### Scenario: No subscribers — no overhead

- **GIVEN** no subscribers are registered on `workspace.loadEvents`
- **WHEN** components are loaded
- **THEN** the loader still emits events, but the per-event cost is bounded by a single `EventEmitter.emit` call returning false

### Requirement: No implicit network fetch in the load path

The loader SHALL NOT trigger a network fetch (component import) as a side effect of `get`, `getMany`, `list`, or `listIds`. When a requested component is not present locally (neither in the workspace nor the local scope), the loader SHALL throw a `ComponentNotFound` error containing the missing IDs. Callers that need to fetch missing components SHALL invoke `scope.import(ids)` explicitly before calling the loader. The current 30-minute "imported components" cache (`importedComponentsCache`) SHALL be removed along with the implicit fetch.

#### Scenario: Missing component throws explicit error

- **GIVEN** component `id-x` is not present in the local workspace or local scope
- **WHEN** a caller invokes `loader.get('id-x')`
- **THEN** the loader throws `ComponentNotFound` with `missingIds: ['id-x']`
- **AND** no network request is made

#### Scenario: Explicit import then load succeeds

- **GIVEN** `id-x` is not present locally but is available on the remote
- **WHEN** the caller invokes `await scope.import(['id-x'])`
- **AND** then invokes `loader.get('id-x')`
- **THEN** the loader returns the component without performing any additional network fetch

#### Scenario: `getOrImport` helper for callers that need the old behaviour

- **WHEN** a caller invokes `workspace.getOrImport(id)`
- **THEN** the helper first calls `scope.import([id])` if missing, then `loader.get(id)`
- **AND** returns the loaded component
- **AND** the loader itself still does not fetch implicitly

### Requirement: Cache invalidation API

The loader SHALL expose `invalidate(target)` where `target` is one of: a `ComponentID` (invalidates all cache entries for that ID across all phases), an array of `ComponentID`s, the literal `'all'` (clears the cache), or `{ phase: Phase }` (invalidates all entries at the given phase). After invalidation, subsequent loads SHALL recompute from disk.

#### Scenario: Invalidate one component

- **GIVEN** components `a` and `b` are cached at phase `dependencies`
- **WHEN** a caller invokes `loader.invalidate(a)`
- **THEN** the next `loader.get(a)` recomputes from disk
- **AND** `loader.get(b)` still returns from cache

#### Scenario: Invalidate all

- **GIVEN** any number of cached components
- **WHEN** a caller invokes `loader.invalidate('all')`
- **THEN** the next load of any component recomputes from disk

#### Scenario: Invalidation is observed by event subscribers

- **WHEN** invalidation occurs and the next load runs
- **THEN** the resulting `load:component` event has `cached: false`
