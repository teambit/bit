# Cold native ordinary snap

The cold CLI owns ordinary `bit snap [component-pattern]` on main and the current lane. Supported options are `-m`/`--message`, `-u`/`--unmodified`, `--unmerged`, and `--skip-auto-snap`. Selection includes new and modified components, selected/all snapshots, ordinary glob/comma/exclusion patterns, and visible or hidden automatic dependent snapshots. New components precede modified components in canonical allocation order. A selected new component can also appear in automatic-dependent reporting while producing exactly one Version.

The adapter preserves canonical no-message warnings, reports, progress, no-op cache behavior, pending-merge handling, and lane membership. Generated package metadata uses atomic replacement so injected hardlink copies retain canonical behavior.

## Ownership and fallback

The retained protocol has four phases:

1. `commandSnapPrepare` proves workspace, model, lane, configuration, and pending metadata. JavaScript supplies bounded policy, dependency, matcher, and default-callback receipts.
2. `commandSnapPlan` selects components, retains Sources, expands automatic dependents, projects graphs, and preflights publication. Issue callbacks and report validation complete before snapshot IDs are allocated.
3. `commandSnapFinalize` consumes the scalar snapshot/log receipt and stages native Version, Component, Lane, history, bitmap, configuration, and package outputs.
4. `commandSnapApply` rechecks retained proofs and publishes. A successful no-op uses Prepare, Plan, and Apply without allocating snapshot IDs or emitting persistence notifications.

Rust owns Source bodies, model traversal, graph projection, serialization, and publication. JavaScript does not hydrate Version/Source objects for an accepted cold command. Once cache publication or native publication begins, errors propagate; the command does not replay through the canonical path.

Unsupported flags and callbacks remain canonical before publication. This includes builds/forced local builds, editors, custom lifecycle hooks or aspects outside the validated default callback surface, state selectors, and unsupported workspace layouts. Pattern selections that match no eligible modified/new component fall back to the canonical error. External component graphs require retained complete adjacency and proven absent local Models for the supported issue-callback path; modeled external vertices, missing adjacency, and unsupported graph/version relationships decline. External edges remain in cycle detection rather than being discarded. Existing ordinary status eligibility is unchanged.

## Reproducing parity checks

`cold-snap-fixture.cjs` defines 19 public scenarios. The four-mode harness runs JavaScript, native, missing-helper, and crashed-helper paths, producing 76 rows. It compares complete stdout/stderr/exit status and repository/workspace state, including objects, index, bitmap, pending state, Lane/history, cache, packages, and files. Native success requires an accepted Apply, one retained owner, no loaded model classes, and Linux syscall evidence of zero Node Source-body reads. Error and fallback scenarios retain their canonical behavior.

With a prepared physical CLI and explicit helper/addon paths, run the same diagnostic gate as Linux CI:

```bash
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli \
BIT_TEST_OBJECT_IMPORT=/absolute/path/to/bit-object-import \
BIT_TEST_WORKSPACE_ADDON=/absolute/path/to/bit-workspace.node \
node --test scripts/rust-object-import/cold-snap-runtime.test.cjs
```

Linux requires `strace`. This runtime gate intentionally produces diagnostics, not release qualification. Adapter and validator tests run in both source and compiled forms:

```bash
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli \
node --test scripts/rust-object-import/workspace-snap-driver.test.cjs scripts/rust-object-import/cold-snap-validation.test.cjs
BIT_LEGACY_ROOT=/absolute/path/to/physical-cli BIT_TEST_COMMAND_COMPILED=1 \
node --test scripts/rust-object-import/workspace-snap-driver.test.cjs scripts/rust-object-import/cold-snap-validation.test.cjs
```

For release qualification, call `runQualification(cli, helper, { report, nodeBaseline, extraFiles })` from `cold-snap-qualification.cjs` with `BIT_TEST_WORKSPACE_ADDON` set, an immutable marked physical CLI, and a verified packaged helper/addon/adjacent manifest. Use both `javascript` and `native-wrapper` baselines at the chosen file-size profiles. Final proofs cover the full fixed corpus and bind native source, compiled CLI modules, helper, addon, manifest, transitive harness files, and retained result artifacts. Diagnostic subsets cannot qualify measurements.

Performance results are pending final release qualification and measurement.
