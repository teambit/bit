# Native lane command ownership

The opt-in `BIT_RUST_CLIENT_VCS=on` entry point offers `lane merge` to the
retained workspace command owner before loading the canonical workspace runtime.
The command parser requires `-x` (skip dependency installation). Unsupported
options or workspace callbacks decline before publication.

## Responsibilities

Rust resolves the current and incoming lanes from the scope index, imports
missing objects, computes merge status, filters the selected components, and
retains current/incoming Source bodies. Pattern matching uses a shared pure
TypeScript helper; its output contains component identities only. Native
selection then applies dependency closure and workspace membership rules.

JavaScript supplies user/time metadata, durable snapshot and lane-history
identities, built-in dependency detector callbacks, issue checks, progress
rendering, and the existing command report formatter. Version and Source bodies
remain with the native owner. Hidden lane components load from the scope and
retain their model metadata instead of entering visible workspace issue checks.

`commandLaneFinalize` stages squash changes and lane history using validated
metadata receipts. Snapshot allocation follows the existing command phases.
Rust publishes the component objects, lane objects, pending merge state, files,
bitmap and recovery backup at their respective lifecycle boundaries. JavaScript
commits validated raw dependency metadata through the canonical cache writer.
This sequence does not provide a transaction spanning all filesystem writes;
failures after publication begins are propagated without replaying the canonical
command.

## Semantics that need separate coverage

`--no-snap` treats a target-ahead component with a common ancestor as a pending
merge: it retains the current bitmap version and records the incoming head in
unmerged state. `--no-auto-snap` allows the ordinary fast-forward transition. Squash
merges preserve the incoming history messages and modification logs. Pattern
selection preserves canonical pool order and handles dependency closure before
workspace filtering. Incoming artifacts and referenced dependency objects have
distinct import phases.

Snapshot inputs follow the post-write workspace. If an incoming deletion conflicts
with a local edit and the writer leaves that file on disk, the snapshot and
dependency scan retain its current contents. This does not add a write or change
the conflict report. Scope-only hidden components use their in-memory result.

Lane `updateDependents` entries are separate from the Version `hidden` field.
An entry absent from the bitmap stays outside visible workspace writes and
package generation. A snapshot of a component present in the bitmap promotes
it to the visible lane bucket and removes its old hidden entry.

The recovery backup retains pre-merge bitmap, workspace configuration, current
lane, and existing staged metadata. Copies preserve source permissions. The
first bitmap history entry uses the writer's `merge` reason; the later
lane-specific write creates no additional entry when the bitmap is already
clean.

## Remaining fallback boundaries

The owner declines unsupported states before publishing retained changes. These
boundaries apply to ordinary workspaces, independent of fixture names:

- Hidden fast-forwards mixed with a snapshot reload require additional native
  policy handling. Dependent snapshot cascades are also declined; the owner
  does not silently retain stale dependency versions.
- Hidden scope-only merges require the supported default Node aspect set and
  unchanged aspect configuration. An existing bitmap entry uses real workspace
  capture even when that entry is unavailable on the current lane.
- Model-backed components without a bitmap entry still require a distinct
  scope-loading path when a current component exists. They are not treated as
  empty incoming additions.
- Readme-component lifecycle changes, whole-component removal, unrelated
  histories, unresolved configuration conflicts, and interactive conflict
  prompts retain canonical handling. File additions and deletions are separate
  from whole-component removal.
- Custom environments, application registrations, unowned issue callbacks,
  unsupported remote transports, and filesystem layouts that cannot satisfy
  the native proof checks retain canonical handling.

Inactive bitmap entries retain their original workspace files and configuration
for status comparison. A writer promotes an inactive empty `scope` to the
component scope while preserving `defaultScope`; active unexported entries keep
their empty scope. Projection activates only components actually written by
the selected merge; excluded and skipped entries remain inactive. An inactive
component taking the keep-ours conflict path is conservatively declined until
its availability and callback behavior is covered.

Genuine incoming additions have no fabricated current Consumer. Their initial
capture is empty; incoming Version metadata and the retained model package
prefix form the post-write policy input. Existing inactive bitmap entries use
their actual files instead. Main merges use each component scope for pending
merge identifiers and snapshot messages, even when the workspace lane belongs
to another scope. Named lanes retain their own scope.

A hidden-only snapshot does not reset visible dependency caches or load visible
components merely to create its snapshot. Retained repository proofs are still
validated before publication. A failed visible snapshot preserves the merge
result and reconstructs only the canonical cache-reload dependency closure.

Built Versions may retain passive builder data and imported artifact references.
The supported builder configuration is empty apart from a boolean `__specific`;
this does not enable a build or arbitrary builder configuration. Passive
deprecation configuration accepts only boolean `deprecate` and `__specific`.
The default Node environment and callback eligibility checks still apply.

## Qualification

The fixed lane corpus currently contains 39 scenarios, exercised in four modes
(156 rows). It includes explicit fallback and error cases as well as native-owned
commands. Thirteen successful scenarios form the timed subset; extra correctness
cases do not silently expand the performance corpus.

`scripts/rust-object-import/merge-transaction-qualification.cjs` has an opt-in
cold-lane diagnostic mode. It compares exact command output and persisted
objects, workspace files, generated packages, raw dependency caches, remote
references, and bitmap history. It additionally requires the retained native
owner and accepted command publication, and rejects canonical model loads or
Source body handoff. Matching output alone does not establish native execution.
The syscall observer also checks that Node does not read Source bodies during
successful native commands. Explicit unsupported, cancellation, error, and
legacy fault cases have separate assertions: they cannot count as native-owned
commands or reach cold publication before falling back.

Diagnostic reports are not release qualification or performance evidence.
Release acceptance requires a frozen source/CLI/helper/addon binding, all
compatibility modes, complete-command measurements, and fresh exact-head CI.
The existing wrapper benchmark and its historical normalized report comparisons
remain separate from the stricter cold-command checks.

The fixed lane-domain runner is `scripts/rust-object-import/cold-lane-measure.cjs`.
Set `BIT_COLD_LANE_CLI`, `BIT_COLD_LANE_HELPER`, and `BIT_COLD_LANE_REPORT` to the
frozen physical CLI, packaged helper, and output report. Without
`BIT_COLD_LANE_PROOF`, it runs four-mode acceptance. Set that variable to the
completed acceptance report to measure one warmup and three retained alternating
pairs. `BIT_COLD_LANE_EXTRA_FILES` selects the workspace scale; the proof must
match it exactly.

Run each profile with `BIT_COLD_LANE_BASELINE=javascript` and
`BIT_COLD_LANE_BASELINE=native-wrapper`, with separate acceptance reports. The
latter keeps native kernels enabled but uses the existing wrapper preload to
bypass the cold command entry point. Its acceptance trace must show wrapper
execution without cold command frames. The historical `object-helper` baseline
only enables object loading and is not equivalent to the prior native wrapper.
Scenario domain, baseline, exact corpus, CLI modules, helper/addon, source and
harness hashes all participate in proof validation. Diagnostic subsets and
unfinished reports cannot authorize timing runs.
