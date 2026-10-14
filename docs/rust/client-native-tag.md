# Cold native ordinary tag

The ordinary tag adapter targets persisted `bit tag [component-patterns...]` (alias `t`) on main. It supports selected/all new and modified components, unmodified and snapped selection, pending merges, visible automatic dependents, and ordinary glob/comma patterns with optional per-pattern versions. A selected new component can also be automatically tagged: it appears in both report sections but produces one Version, using the selected version rules and automatic log suffix.

Supported options include `-m`/`--message`, `-u`/`--unmodified`, `--unmerged`, `--snapped`, `--skip-auto-tag`, `--patch`, `--minor`, `--major`, `--increment`, `--auto-tag-increment`, `--pre-release`, `--prerelease-id`, `--increment-by`, and `-v`/`--ver`. Canonical option validation and semantic-version normalization are reused. Pattern groups retain input order; glob/comma matches use canonical eligible-candidate order. A group without eligible matches declines before publication so the canonical error is preserved.

## Retained lifecycle

1. `commandTagPrepare` retains workspace, model, configuration, and pending metadata. JavaScript supplies bounded dependency grammar and captures metadata without hydrating Version or Source objects.
2. `commandTagPlan` selects components, expands automatic dependents, computes semantic versions, retains Sources, projects graphs, and preflights publication. The adapter validates issues, progress, and the canonical report before allocating identities.
3. `commandTagFinalize` consumes scalar receipts and stages native repository, bitmap, staged configuration, and package outputs. Semantic tag versions remain distinct from allocated Version object hashes. Scalar order is batch ID, basic log, then each persisted object hash followed by that component's optional squash log. Canonical durable publication and the adapter share the hash helper; disposable comparison Versions use a separate allocation path.
4. `commandTagApply` verifies retained proofs and publishes. A no-op omits Finalize and allocates no object hashes. After cache publication starts, errors propagate without canonical replay.

The report is rendered by the existing `TagCmd` report function using plain metadata and Component IDs. Rust owns Source bodies, model traversal, dependency graph projection, serialization, and publication. Package metadata replacement preserves canonical injected-hardlink behavior.

## Fallback boundaries

Named-lane tagging, builds or forced local builds, editors, soft/persist/publish workflows, state selectors, unsupported layouts, and custom lifecycle callbacks remain canonical before publication. Workspace-level component range configuration is currently guarded; supported stored model prefixes are covered separately. External issue graphs require complete retained adjacency and proof of absent local Models; unsupported modeled external graphs decline rather than silently omit callback edges.

## Parity checks

The current fixed corpus in `cold-tag-fixture.cjs` contains 33 scenarios, producing 132 rows across JavaScript, native, missing-helper, and crashed-helper modes. It covers semantic releases, new/existing overlap, automatic version increments, stored caret/tilde ranges, pattern ordering and errors, pending merge squash, no-ops, and explicit fallback boundaries. Fixtures use public setup commands and compare exact command output and repository/workspace state. Native success requires accepted Apply, one retained owner, no model-class loading, and Linux syscall evidence of zero Node Source-body reads.

With a prepared physical CLI and explicit native artifacts, run the Linux diagnostic gate:

```bash
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli \
BIT_TEST_OBJECT_IMPORT=/absolute/path/to/bit-object-import \
BIT_TEST_WORKSPACE_ADDON=/absolute/path/to/bit-workspace.node \
node --test scripts/rust-object-import/cold-tag-runtime.test.cjs
```

Linux requires `strace`. CI runs adapter and validator tests against both source and compiled modules:

```bash
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli \
node --test scripts/rust-object-import/workspace-tag-driver.test.cjs scripts/rust-object-import/cold-tag-validation.test.cjs
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli BIT_TEST_COMMAND_COMPILED=1 \
node --test scripts/rust-object-import/workspace-tag-driver.test.cjs scripts/rust-object-import/cold-tag-validation.test.cjs
```

Release qualification uses `runQualification(cli, helper, { report, nodeBaseline, extraFiles })` from `cold-tag-qualification.cjs`, with `BIT_TEST_WORKSPACE_ADDON`, an immutable marked physical CLI, and a verified packaged helper/addon/manifest. Both `javascript` and `native-wrapper` baselines are bound to source, effective compiled modules, native artifacts, the transitive harness, and retained result files. Diagnostic subsets do not qualify release measurements.

The expanded corpus and final release performance remain pending validation; the scenario count is the intended fixed coverage, not a claim that all cases have passed.
