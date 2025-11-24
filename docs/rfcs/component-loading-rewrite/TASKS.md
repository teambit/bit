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

- [ ] Identify key loading scenarios from existing e2e tests
- [ ] Create `component-loader.contract.spec.ts` with scenarios:
  - [ ] Load workspace-only component
  - [ ] Load scope-only component
  - [ ] Load component with workspace + scope data (merged)
  - [ ] Load component that's out-of-sync
  - [ ] Load new component (not in scope yet)
  - [ ] Load component with extensions
  - [ ] Load component with env
  - [ ] Load env-of-env scenario
  - [ ] Load multiple components with shared dependencies
  - [ ] Verify caching behavior (same component loaded twice)
- [ ] Ensure contract tests pass with current loader

### Instrumentation

- [ ] Add structured logging to current loader (optional, for debugging)
- [ ] Create load-trace comparison utility

---

## Phase 2: New Architecture

> Build V2 loader alongside existing code

### 2.1 Core Types & Interfaces

- [ ] Create `load-plan.ts` with LoadPlan, LoadPhase types
- [ ] Create `component-source.ts` with ComponentSource interface
- [ ] Create `loader-cache.ts` with unified cache implementation
- [ ] Add unit tests for each new module

### 2.2 Pipeline Phases

- [ ] Create `phases/` directory structure
- [ ] Implement `discovery.phase.ts`
  - [ ] Unit tests
- [ ] Implement `resolution.phase.ts` (build LoadPlan)
  - [ ] Unit tests
- [ ] Implement `hydration.phase.ts` (load raw data)
  - [ ] Unit tests
- [ ] Implement `enrichment.phase.ts` (add aspects, env descriptors)
  - [ ] Unit tests
- [ ] Implement `assembly.phase.ts` (build Component objects)
  - [ ] Unit tests
- [ ] Implement `execution.phase.ts` (run slots)
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
