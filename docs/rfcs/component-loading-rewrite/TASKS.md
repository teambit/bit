# Component Loading Rewrite - Task Tracking

**Legend:**

- `[ ]` - Not started
- `[~]` - In progress
- `[x]` - Completed
- `[!]` - Blocked

---

## Phase 1: Safety Net

> Establish testing infrastructure before any code changes

### Contract Tests

- [x] Identify key loading scenarios from existing e2e tests
- [x] Create `component-loader-contract.e2e.ts` with scenarios:
  - [x] Load workspace-only component
  - [x] Load scope-only component
  - [x] Load component with workspace + scope data (merged)
  - [x] Load component that's out-of-sync
  - [x] Load new component (not in scope yet)
  - [x] Load component with extensions
  - [x] Load component with env
  - [ ] Load env-of-env scenario (deferred - complex setup)
  - [x] Load multiple components with shared dependencies
  - [x] Verify caching behavior (same component loaded twice)
- [x] Ensure contract tests pass with current loader (21 tests passing)

### Instrumentation

- [ ] Add structured logging to current loader (optional, for debugging)
- [ ] Create load-trace comparison utility

---

## Phase 2: New Architecture

> Build V2 loader alongside existing code

### 2.1 Core Types & Interfaces

- [x] Create `load-plan.ts` with LoadPlan, LoadPhase types
- [x] Create `component-source.ts` with ComponentSource interface
- [x] Create `loader-cache.ts` with unified cache implementation
- [ ] Add unit tests for each new module

### 2.2 Pipeline Phases

- [x] Create `phases/` directory structure
- [x] Implement `discovery.phase.ts`
  - [ ] Unit tests
- [x] Implement `resolution.phase.ts` (build LoadPlan)
  - [ ] Unit tests
- [x] Implement `hydration.phase.ts` (load raw data)
  - [ ] Unit tests
- [x] Implement `enrichment.phase.ts` (add aspects, env descriptors)
  - [ ] Unit tests
- [x] Implement `assembly.phase.ts` (build Component objects)
  - [ ] Unit tests
- [x] Implement `execution.phase.ts` (run slots)
  - [ ] Unit tests

### 2.3 Component Sources

- [ ] Implement `WorkspaceSource`
  - [ ] Unit tests
- [ ] Implement `ScopeSource`
  - [ ] Unit tests

### 2.4 Loader V2 Orchestrator

- [ ] Create `workspace-component-loader-v2.ts`
- [ ] Wire up all phases
- [ ] Add feature flag support (`BIT_LOADER_V2`)
- [ ] Integration tests with mock sources

---

## Phase 3: Migration

> Gradually switch commands to V2 loader

### 3.1 Infrastructure

- [ ] Add parallel execution mode (`BIT_LOADER_V2_COMPARE`)
- [ ] Create result comparison utility
- [ ] Add logging for discrepancies

### 3.2 Command Migration (in order of complexity)

#### `bit show`

- [ ] Enable V2 for `bit show` command
- [ ] Run comparison mode, fix discrepancies
- [ ] Run relevant e2e tests
- [ ] Mark as V2-ready

#### `bit list`

- [ ] Enable V2 for `bit list` command
- [ ] Run comparison mode, fix discrepancies
- [ ] Run relevant e2e tests
- [ ] Mark as V2-ready

#### `bit status`

- [ ] Enable V2 for `bit status` command
- [ ] Run comparison mode, fix discrepancies
- [ ] Run relevant e2e tests
- [ ] Mark as V2-ready

#### `bit build`

- [ ] Enable V2 for `bit build` command
- [ ] Run comparison mode, fix discrepancies
- [ ] Run relevant e2e tests
- [ ] Mark as V2-ready

#### `bit test`

- [ ] Enable V2 for `bit test` command
- [ ] Run comparison mode, fix discrepancies
- [ ] Run relevant e2e tests
- [ ] Mark as V2-ready

#### Remaining Commands

- [ ] Identify all commands using component loader
- [ ] Migrate each remaining command
- [ ] Full e2e test suite pass

---

## Phase 4: Consolidation

> Clean up after successful migration

### Cleanup

- [ ] Remove `workspace-component-loader.ts` (old loader)
- [ ] Remove feature flags
- [ ] Remove parallel execution / comparison code
- [ ] Update documentation

### Validation

- [ ] Full e2e test suite pass
- [ ] Performance benchmark comparison (before/after)
- [ ] Code review of final architecture

---

## Ongoing Notes

_Add notes here as work progresses_

### Blockers

_(none yet)_

### Discoveries

_(add findings during implementation)_
