# Rust client VCS engine

Umbrella issue: [#73](https://github.com/zkochan/bit/issues/73).

The target is a Rust engine owning client VCS operations: repository objects,
refs and indexes, history, workspace comparison and checkout, snapshots/tags,
merges, and fetch/push orchestration. TypeScript adapts Harmony extensions,
canonical component class metadata, installation/build tooling and presentation.
Work is grouped into substantial operation-level PRs.

## Cold merge configuration and dependency ownership

Supported main-branch merges now retain their planned file contents inside the
Rust command owner while configuration merging and dependency analysis run.
`commandPolicyPrepare`, `commandDependencyDetect` and
`commandDependencyComplete` extend the existing prepare/plan/finalize/apply
lifecycle. These phases finish before snapshot IDs are allocated or workspace
changes are published.

The retained source overlay exposes added, changed and removed files at their
original logical paths. The shared dependency scanner and resolver read that
overlay, including newly added roots and relative imports, without sending
Source bodies through Node. Disk reads and retained source ranges have separate
freshness proofs; the command validates both before publication. Independent
capture and proof work uses the bounded native worker pool.

TypeScript supplies canonical semver decisions and built-in Node environment
metadata through pure helpers shared with the normal runtimes. Rust merges
configuration, detects the resulting dependency graph, projects dependency
metadata and raw caches, builds snapshot graphs, and updates generated package
dependency sections. Component policy ordering and merged-configuration
precedence follow the canonical resolver. Native snapshot graphs preserve
historical identities when a dependency cycle returns to the previous version
of the component being snapped.

The lifecycle also preserves a merge whose automatic snapshot fails because of
missing manually configured packages. It retains the merged files and pending
merge state, performs the canonical dependency-cache reset and selected reload,
and renders the canonical issue error without allocating a snapshot. Manual
conflicts retain conflict markers; the ours strategy preserves current files.
Unsupported callbacks, application components and unsupported policy or issue
shapes decline before publication so the canonical command can handle them.
Lane command ownership remains a separate boundary.

`cold-command-qualification.cjs` compares public output and durable state in
canonical, native, missing-helper and crashed-helper modes. Its native trace
checks actual command application and absence of Node model loading or Source
body bridging. Changed imports, added source files, runtime-to-dev transitions,
forced component policy, a late unsupported callback and a duplicate-package
snapshot blocker are covered alongside the existing checkout and merge cases.
`merge-transaction-qualification.cjs`
also checks the older main-conflict fixtures, including failed autosnaps.
Performance claims require separately frozen release artifacts and complete
command measurements; passing these correctness checks alone is insufficient.

## Checkout repository and workspace operation

This chunk starts from merged #72. `BIT_RUST_CLIENT_VCS=on` enables native
preparation for ordinary checkout/reset/revert, with helper selection using the
existing object-import discovery and packaged installation machinery.

A read-only `BCK1` request resolves a Component tag or full Version hash, validates
the Version manifest against the selected canonical metadata, and verifies every
referenced Source before checkout can delete old workspace files. Orphaned tags
retain their canonical precedence. Manifest matching tolerates cached Version
file ordering changes while preserving the adapter's live order and fields.

Rust computes updated/unchanged/removed statuses and removal paths from the
current file identities and protected-path projection. It owns Source decoding,
complete zlib-stream verification, Source header identity and SHA-1 validation.
Header sizes are validated using decoded string lengths rather than byte lengths,
as required by the existing object format. A plan is bounded to 4096 files, a
4 MiB JSON request/response, and 32 MiB compressed and decoded object budgets.
Unsupported paths, ambiguous duplicate paths, or unsupported records fall back.

Verified Source bytes remain in a bounded per-helper cache. The awaited checkout
scope shares that helper across planning, removals and final writes. `BWC1` uses
these snapshots directly at the writer's final destinations, applying canonical
binary detection and EOL conversion. Cache misses reread and verify objects.
Cache storage is bounded to 32 MiB of bodies, 4 MiB of keys and 4096 entries.
Writes retain existing in-place inode, mode, hardlink and symlink behavior.
Acknowledged-prefix failures reap the child before canonical replay.

The adapter constructs ordinary component metadata and deferred SourceFiles;
target file bodies do not cross into Node solely to return to Rust. Accessing
contents hydrates through the canonical repository and invalidates native
provenance. A deferred file keeps its original object hash even if the manifest's
Ref is later mutated. Native descriptors are checked again at persistence.

## Compatibility boundaries

TypeScript still selects the public checkout mode, loads the current component,
detects modifications, orchestrates conflict/merge behavior, hydrates component
metadata, manages bitmap state and invokes hooks/install tooling. Merge-result
paths retain canonical loading and merging. Force-ours retains its existing
behavior without preparing target Sources. This chunk does not complete every
checkout mode or the full client VCS roadmap.

The existing writer retains nested component ownership and live bitmap
protection. Untracked current components do not gain removal statuses; root
workspace bitmap files remain protected. Custom consumer/model/ref readers,
prototype or contents-property overrides, repository transforms, pending objects,
and mutated cached Source buffers retain canonical loading. The adapter checks
manifest, current files, tracking, reader identities and paths again after
asynchronous planning and metadata hydration. Invalid or malformed plans retire
the helper before fallback.

The object store is expected to remain available for canonical hydration/replay.
Concurrent deletion of stored objects after preparation can make deferred Node
hydration fail; an eagerly loaded canonical SourceFile could still hold those
bytes. Rust's retained snapshots cover direct native writes, but do not provide a
synchronous Node snapshot reader. Keep rollout opt-in while this boundary and the
remaining operation migrations are addressed.

## Qualification

The qualification driver runs actual `checkout`, `checkout reset` and `revert`
against a real workspace and local remote scope. It verifies bytes, binary
preservation, added/removed/case-renamed files and bitmap versions with Node,
native, missing and crashed helpers. Separate diagnostics require successful
`BCK1` and `BWC1` acknowledgements and exactly one workspace helper.

`BIT_CHECKOUT_QUALIFICATION_ROUNDS` controls alternating retained Node/native
pairs with excluded warmups. `BIT_CHECKOUT_QUALIFICATION_EXTRA_FILES` adds 4 KiB
files split between unchanged and changed contents. Linux measurements include
GNU time command CPU and 10 ms simultaneous process-tree RSS sampling, including
helpers. Setup and trace diagnostics are excluded. Reports fingerprint source,
physically compiled modules, harness and release helper before and after runs.

Verification passes 83 source/adapter/regression tests, 64 physically compiled
checkout/persistence tests, 103 Rust workspace tests and canonical TypeScript
lint. Pinned Rust formatting, warning-denied Clippy, perfectionist Dylint and
rustdoc pass. Packaged release smoke and 30 packaging/discovery tests pass.
Source and compiled checkout regressions run in the existing Linux/macOS/Windows
canonical-model CI jobs; real command measurements here are local Linux results.

Generated CLIs, helper binaries, reports and logs stay outside Git under
`$HOME/bit-client-vcs-evidence-2026-10-11` and temporary owned directories. The
release package records production revision `289af1991345`, native source digest
`7f93a265bf1818c60c58de57a3443299b246179628aa9fcb3332b0304edda024`, and binary
SHA-256 `8cdfa8432c68f91714cf2c0ecf41ace5b65aa17155c178571e2255e88bf425e2`.

Complete-command measurements determine rollout separately from migration.
Moving code into Rust does not establish a speedup; current-file loading and
modified-state detection still contribute Node work.

## Workspace inventory, status and diff

The next operation chunk starts from merged #74. The same opt-in
`BIT_RUST_CLIENT_VCS=on` enables the read-only `BWS1` engine:

- **Scan** enumerates ordinary candidate files, subtracts literal component roots,
  and excludes Bit/Git internals. TypeScript applies hierarchical ignore rules,
  workspace-root bitmap protection and generated-file policy. Both native and
  canonical inventories now sort final paths using `ComponentMap.sort` order;
  asynchronous directory enumeration no longer determines presentation order.
- **Read** reads complete workspace file sets, computes raw disk SHA-1 and
  canonical Linux-EOL Source identities, and strips only the UTF-8 BOM from the
  public file contents as the canonical Vinyl reader does. The adapter preserves
  `cwd`, `base`, file statistics, test metadata and public missing-file errors.
- **Compare** compares canonical Version identity hashes for modified-state
  detection. TypeScript still constructs the identity projection and performs
  its existing metadata alignment, sorting, temporary bitmap filtering and
  cached-state updates. Debug logging and custom hashing hooks retain canonical
  comparison.
- **Diff** reads verified repository Sources and workspace files directly, checks
  disk files against their captured raw identities, and runs bounded parallel
  `git diff --no-index` processes. Git compares original bytes after the same
  EOL-normalized equality check. TypeScript retains labels, color formatting,
  file statuses, metadata/dependency diffs and existing binary/empty-file behavior.

An awaited status, mini-status, diff or checkout operation shares the bounded
helper pool. Inventory scans during Harmony bootstrap retain canonical loading
until an operation owns the helper lifetime. Stored Sources can remain deferred
inside supported status/diff scopes; checkout fallback paths keep their existing
reader behavior. Workspace bytes still enter Node because component loading,
docs, dependency analysis and extension hooks consume them; repository Sources
and verified disk files do not make a body round trip solely to run Git.

Requests are bounded to 4 MiB, 4096 files and 8 MiB of aggregate raw file bodies.
Responses are bounded to 32 MiB. Scan traversal additionally bounds examined
entries and queued path bytes. Diff uses at most four Git workers, bounds each
stdout stream, and cleans temporary files and child processes. Unsupported
symlinks, non-UTF-8 paths, changed files, custom readers/converters/hashing hooks,
invalid acknowledgements and unavailable helpers fall back before exposing a
partial native result. Retained buffer copies detect in-place mutations; array,
path and provenance checks reject changes across asynchronous native work.
The deferred object-store availability boundary described above still applies.

The workspace comparison qualification driver runs real `status --json` and
`diff --json` against a local remote and two stored versions. It compares clean
and modified output across Node, native, missing-helper and crashed-helper modes,
including file additions, deletions, renames and dependency metadata changes.
Separate diagnostics require successful scan/read/compare/diff acknowledgements.
`BIT_WORKSPACE_COMPARISON_ROUNDS` controls alternating Node/native pairs with
excluded warmups; `BIT_WORKSPACE_COMPARISON_EXTRA_FILES` extends the fixture with
4 KiB files. Reports fingerprint source, compiled modules, the helper and both
qualification harnesses before and after the run. Timing, CPU and simultaneous
process-tree RSS include the complete command, with setup and diagnostics
excluded. Source and physically compiled differential tests run in the existing
Linux/macOS/Windows canonical-model CI matrix.

### Workspace comparison qualification and measurements

Verification passes all 20 new source tests and 20 physically compiled tests,
94 existing source/model/trace regressions (one additional Windows-only test is
skipped locally), 64 compiled checkout/persistence regressions, 69 canonical
model tests and 118 Rust workspace tests. Canonical TypeScript lint, the
15-component Bit compilation, pinned Rust formatting, warning-denied Clippy,
perfectionist Dylint and rustdoc pass. Real status/diff and checkout/reset/revert
commands match across native, Node, missing-helper and crashed-helper runs.
Diagnostics confirm successful native work and exactly one helper per operation.
Official package smoke and all 30 artifact/provisioning/discovery tests pass.

Five alternating retained pairs follow excluded warmups for each workload on
Linux tmpfs (`/tmp`) and Btrfs (home scratch). Fixtures have one component, two
versions, and either 4 or 260 files per version; the extra files have 4 KiB
contents. The table reports independent native/Node median ratios, including
GNU time user+system CPU and sampled simultaneous process-tree peak RSS.
A value above 1 means the native command used more time or memory.

| Filesystem / files | Command         |  Wall |   CPU | Peak tree RSS |
| ------------------ | --------------- | ----: | ----: | ------------: |
| tmpfs / 4          | clean status    | 1.008 | 0.983 |         1.011 |
| tmpfs / 4          | modified status | 1.023 | 1.017 |         1.019 |
| tmpfs / 4          | clean diff      | 1.008 | 1.000 |         1.020 |
| tmpfs / 4          | modified diff   | 0.990 | 0.980 |         1.019 |
| tmpfs / 260        | clean status    | 1.070 | 1.035 |         1.054 |
| tmpfs / 260        | modified status | 1.059 | 1.026 |         1.035 |
| tmpfs / 260        | clean diff      | 1.073 | 1.116 |         1.195 |
| tmpfs / 260        | modified diff   | 1.085 | 1.113 |         1.207 |
| Btrfs / 4          | clean status    | 0.987 | 0.947 |         1.015 |
| Btrfs / 4          | modified status | 1.001 | 1.055 |         1.014 |
| Btrfs / 4          | clean diff      | 1.027 | 1.044 |         1.040 |
| Btrfs / 4          | modified diff   | 0.965 | 0.940 |         1.012 |
| Btrfs / 260        | clean status    | 1.093 | 1.081 |         1.041 |
| Btrfs / 260        | modified status | 1.069 | 1.013 |         1.027 |
| Btrfs / 260        | clean diff      | 1.080 | 1.100 |         1.188 |
| Btrfs / 260        | modified diff   | 1.045 | 1.082 |         1.196 |

Small workloads show broadly similar command performance. The 260-file native
commands are currently 4.5–9.3% slower by median wall time; native diff uses
approximately 19–21% more sampled peak process-tree RSS. These results support
continuing the migration under an opt-in flag, not enabling it as a performance
improvement. Harmony startup, component hydration, metadata projection and the
Node-facing workspace bodies remain material parts of the command.

Evidence, absolute medians, command output and trace diagnostics are outside
Git at `$HOME/bit-workspace-comparison-evidence-2026-10-11`. Source and compiled
module SHA-256 fingerprints match before and after every run; these identify
the final lifecycle integration even though the private CLI's base revision
field records the preceding production commit `4b67210f2b4b`. The benchmark
helper SHA-256 is
`b73bcc162ed56ca58633ddcb27bf9e414ca23d8fbae74eb297d69fc4fb33789e`.
The independently packaged explicit-target release records revision
`4b67210f2b4b`, native source digest
`61d7b188c63699d55128956e36e72b57f2dcb2a7afb8eaeb59e77ef5815f79af`,
and binary SHA-256
`b2710e1c394ffdd992f7af8b1ef556d66bf4cee2c11d8719505d90ac69760e46`.
Both release builds use the same native source digest; the package smoke and
artifact tests additionally validate the official target build.

## Snapshot and tag persistence

Starting from merged #75, `BIT_RUST_CLIENT_VCS=on` also owns an awaited helper
lifetime around public snap/tag operations and scope-side version creation.
The `BSS1` engine plans ordinary mainline parent/head/tag changes, prepares final
objects after build and merge mutations finish, and writes objects through the
existing atomic native store. It also reuses the Rust component/lane index
planner; native index persistence remains Linux-only while other hosts use the
canonical writer.

Version refs remain the preallocated snap hashes used by Bit. They are not
content hashes of the serialized metadata. Rust verifies Source SHA-1 identities,
reads eligible workspace files directly, checks their captured raw disk hashes,
strips only the UTF-8 BOM and applies canonical Linux EOL normalization. It builds
the existing object header with decoded UTF-16 lengths, compresses objects and
preserves their established IDs. TypeScript supplies final canonical metadata
JSON bytes because JavaScript property ordering, number formatting and extension
serialization are part of the existing format.

The complete object set is prepared before writing. A committed prefix is
acknowledged in order; failures retire the writer before canonical suffix replay.
Unknown acknowledgements or live object changes trigger complete canonical
replay. The repository retains its mutex, validation, deletion order, cache and
live object identity, post-persist hooks, remote-lane/unmerged writes and bitmap
updates. Index changes occur only after object persistence completes.

Snapshot Sources preserve canonical Buffer aliasing: unchanged LF and binary
buffers share their creation-time storage, while normalized CRLF buffers are
independent copies. Disk provenance survives read-only hydration only while the
original workspace snapshot and canonical Source buffer remain unchanged.
Content assignment, in-place mutation, custom hashing/serialization, repository
transforms, custom index paths and replaced instance/prototype methods retain
canonical execution. Eligibility and live projections are checked again after
asynchronous native work.

Requests are bounded to 4 MiB of JSON, 4096 objects and 32 MiB of prepared raw
bodies. Unsupported object classes, raw-object overrides, symlink workspace
Sources, larger batches and unavailable helpers fall back. Lane parent policy,
merge/squash/unrelated policy, VersionHistory construction, semver selection,
dependency metadata, builds and hooks remain TypeScript adapters. This chunk
does not complete the snapshot/tag milestone or the full client VCS roadmap.

The real-command qualification creates fresh disposable workspaces and runs
tag 1.0.0, an edited snap and tag 1.0.1. It compares inflated object headers and
bodies, preallocated hashes, normalized/binary Source bytes, parent chains, tag
aliases, index, bitmap, status and log output across Node, native, missing-helper
and crashed-helper modes. A narrowly scoped deterministic fixture fixes only
snapshot UUIDs and log timestamps. Separate wire diagnostics require actual
native commit/parent/index work and one helper per operation; guarded methods
are left untouched by the observer.

`BIT_SNAPSHOT_QUALIFICATION_MEASURE=1` records complete persisted-tag and snap
commands, with `BIT_SNAPSHOT_QUALIFICATION_ROUNDS` alternating Node/native pairs
after excluded warmups. `BIT_SNAPSHOT_QUALIFICATION_EXTRA_FILES` adds unique
4 KiB Sources, split between changed and unchanged files. GNU time CPU and
simultaneous 10 ms process-tree RSS include helpers; setup and diagnostics are
excluded. Reports verify source, physically compiled module, harness, fixture
preload and release-helper SHA-256 fingerprints before and after each run.

### Snapshot/tag qualification and measurements

Verification passes 12 source and 12 physically compiled snapshot adapter tests,
23 source and 23 compiled workspace comparison/provenance tests, 94 existing
regressions (one Windows-only test skipped locally), 64 compiled checkout and
persistence regressions, 69 canonical model tests and 129 Rust workspace tests.
Canonical TypeScript lint, the 16-component Bit compilation, pinned Rust
formatting, warning-denied Clippy, Dylint and rustdoc pass. Official package smoke
and all 30 artifact/provisioning/discovery tests pass. Snapshot source and compiled
adapter tests run in the existing Linux/macOS/Windows canonical-model CI matrix.

Five alternating retained pairs follow excluded warmups on Linux tmpfs (`/tmp`)
and Btrfs (home scratch), with one component, three versions and either 3 or 259
files per version. Extra files are unique 4 KiB Sources, half changed at each
stage. The following independent median ratios include the complete persisted
tag or snap command. Values above 1 mean more native time or memory.

| Filesystem / files | Command       |  Wall |   CPU | Peak tree RSS |
| ------------------ | ------------- | ----: | ----: | ------------: |
| tmpfs / 3          | initial tag   | 0.998 | 0.981 |         1.010 |
| tmpfs / 3          | edited snap   | 1.007 | 1.019 |         1.011 |
| tmpfs / 3          | following tag | 1.010 | 1.038 |         1.013 |
| tmpfs / 259        | initial tag   | 1.057 | 0.974 |         1.030 |
| tmpfs / 259        | edited snap   | 1.059 | 1.026 |         1.058 |
| tmpfs / 259        | following tag | 1.067 | 1.012 |         1.124 |
| Btrfs / 3          | initial tag   | 1.029 | 1.082 |         1.010 |
| Btrfs / 3          | edited snap   | 0.996 | 1.019 |         1.011 |
| Btrfs / 3          | following tag | 0.992 | 0.981 |         1.014 |
| Btrfs / 259        | initial tag   | 1.084 | 0.962 |         1.099 |
| Btrfs / 259        | edited snap   | 1.078 | 1.026 |         1.153 |
| Btrfs / 259        | following tag | 1.062 | 1.000 |         1.117 |

These measurements qualify production revision `b3495fe39258`, before the final
custom-Ref guards and canonical fallback cleanup. Those follow-up changes reject
custom Ref methods/getters before native policy and after asynchronous planning,
preserve the original fallback object array, and avoid an extra canonical index
serialization. Final source/compiled adapter tests and real four-mode command
qualification cover those changes separately; a final 259-file pair verifies
the updated measurement path and source/compiled fingerprints. The table remains
the five-pair measurement of the explicitly identified earlier revision.

Small commands are broadly similar. The 259-file native workflow is 5.7–8.4%
slower by median wall time, with approximately 3–15% more sampled process-tree
RSS. CPU is broadly similar. This supports continuing the migration behind
`BIT_RUST_CLIENT_VCS=on`; it does not justify enabling the engine as a performance
improvement. Harmony startup, dependency analysis, class hydration and canonical
metadata preparation remain substantial Node work.

Reports, absolute medians, logs and generated artifacts stay outside Git at
`$HOME/bit-snapshot-tag-evidence-2026-10-11`. The private CLI's original base field
records `517e93180cc0`; exact source and compiled-module SHA-256 fingerprints
identify each qualified candidate. The measured helper SHA-256 is
`85f94a2916ff6be6bdb8e23fdbc228afe451b5df6ae104e6116318dae1444121`.
The official explicit-target package records revision `b3495fe39258`, native
source digest `3b99d97934fd86ef6de413f5e8eaa60754c0cd86bf0fc580a0db50f2a9c5cbab`,
and binary SHA-256
`4b1bce25a84ae42bfc17bf0a68bfd568cfff6e8152723a64dc2b368e96e76fa6`.
Both release builds and the final adapter candidate use the same native source
digest. Real-command results here are local Linux qualification; cross-platform
adapter and filesystem coverage is provided by CI.

## Merge and history

The merge operation shares the existing awaited repository/workspace helper
lifetime. Its `BMH1` engine reads Version objects directly to populate missing
ancestry, calculates divergence and the nearest common snap, and plans the entire
three-way file merge. Graph order includes parent, squashed and unrelated edges;
file classification includes additions, updates, deletions, renames represented
as deletion/addition, textual conflicts and binary conflicts. Rust reads verified
workspace paths and immutable repository Sources directly. File bodies are not
sent from Node into the native merge request.

The native planner preserves the canonical Git merge-file behavior, labels and
final newlines. Stored Sources used as Git inputs undergo the same UTF-8 string
conversion as the existing implementation; Source bytes returned for additions
and updates retain their original representation. Workspace inputs use canonical
LF normalization. The adapter validates the completed plan, checks live inputs
again, and constructs the public SourceFile and merge result objects. No workspace
files are changed while conflict strategy is undecided.

Node continues to own component/configuration merging, extension hooks, lane
selection and merge/squash/unrelated policy, unmerged-component bookkeeping,
bitmap updates and user choices. Abort and resolve use the shared operation
lifetime and existing persistence/snapshot adapters. Those public workflows are
qualified end to end; their remaining orchestration is not claimed as a completed
Rust migration. Public synchronous graph APIs remain canonical, as do ancestry
repair requests that explicitly traverse an already cached history.

Custom readers, transformed objects, custom Ref/model methods, changed live
inputs, unsupported paths and bounded-request limits retain canonical execution.
Missing or corrupt history and an unavailable or failed helper replay canonical
traversal so existing typed errors and graceful partial-history behavior are
preserved. Matching cached Versions retain their actual parent Ref identities; altered
cached metadata retains canonical traversal. Histories with unsupported dependency
or extension metadata also retain canonical parsing. Requests allow 4096 records/files,
4 MiB of input and 32 MiB of output. Rollout remains `BIT_RUST_CLIENT_VCS=on`.

### Merge/history qualification

The isolated, physically compiled 20-component CLI passes canonical TypeScript
lint and Bit compilation. Eighteen new graph, public-history and whole-file merge
tests pass in both source and compiled modes. Existing coverage passes 46 source
provenance/snapshot regressions, 75 additional source regressions (one Windows-only
case skipped locally), 117 compiled tests including the new cases, and 69 canonical
model tests. Native qualification passes 141 workspace tests, pinned formatting,
warning-denied Clippy, Dylint and rustdoc. The official explicit-target release
package passes smoke and all 30 artifact/provisioning/discovery tests.

The real-command fixture creates sibling snapshots with textual and binary
conflicts, clean independent edits, additions, deletion conflicts, rename-as-delete
and add, and BOM/CRLF inputs. It executes manual merge, abort, remerge and resolve,
then creates and merges a lane. Node, native, missing-helper and crashed-helper
runs match complete files, decompressed objects, bitmap, index, unmerged state,
status, log and lane history. Separate diagnostics prove successful native
divergence and whole-file merge requests, workspace/repository descriptor inputs,
zero Source body bytes in input frames and one helper per operation. Missing and
corrupt history, live/pending Version mutations, parser hooks, stale inputs and
concurrent population preserve canonical fallback and public Ref identity.

An additional seeded comparison checks 1500 graphs against the actual synchronous
Bit divergence implementation and Cleargraph, including shuffled insertion order,
duplicate parents, squashed/unrelated edges, multiple common ancestors and cycles.
The qualification harness verifies source, compiled module, helper and fixture
SHA-256 fingerprints before and after commands. Run
`merge-history-qualification.cjs <private-cli> <release-helper>` for correctness.
Set `BIT_MERGE_QUALIFICATION_MEASURE=1`,
`BIT_MERGE_QUALIFICATION_ROUNDS=3`,
`BIT_MERGE_QUALIFICATION_DIAGNOSTICS=0` and optionally
`BIT_MERGE_QUALIFICATION_EXTRA_FILES=256` for alternating retained command pairs
following excluded warmups. Generated workspaces, logs and reports stay outside
Git at `$HOME/bit-merge-history-evidence-2026-10-11`.

### Merge/history command measurements

Three retained alternating pairs follow excluded paired warmups on Linux tmpfs
and Btrfs, using one component with 8 or 264 current files. Large fixtures add
256 unique approximately 4 KiB files with independently mergeable edits. The
table reports independent medians for complete commands. CPU includes child
processes; RSS sums near-simultaneous 10 ms samples of Node, helper and Git
descendants. Diagnostics are disabled during measurement.

| Filesystem | Files | Operation     | Wall ms Node → Rust | Rust/Node | CPU s Node → Rust | RSS MiB Node → Rust |
| ---------- | ----: | ------------- | ------------------: | --------: | ----------------: | ------------------: |
| tmpfs      |     8 | importObjects |           253 → 257 |      1.02 |       0.32 → 0.33 |       148.6 → 148.7 |
| tmpfs      |     8 | merge         |           313 → 311 |      0.99 |       0.39 → 0.39 |       153.9 → 157.6 |
| tmpfs      |     8 | abort         |         1211 → 1289 |      1.06 |       0.85 → 0.85 |       305.6 → 308.8 |
| tmpfs      |     8 | remerge       |           316 → 310 |      0.98 |       0.40 → 0.39 |       155.0 → 158.1 |
| tmpfs      |     8 | resolve       |           430 → 451 |      1.05 |       0.55 → 0.59 |       266.5 → 268.4 |
| tmpfs      |   264 | importObjects |           281 → 289 |      1.03 |       0.37 → 0.39 |       151.1 → 152.2 |
| tmpfs      |   264 | merge         |           871 → 538 |      0.62 |       1.18 → 0.79 |       277.9 → 236.7 |
| tmpfs      |   264 | abort         |         1763 → 1845 |      1.05 |       1.84 → 1.93 |       510.8 → 521.0 |
| tmpfs      |   264 | remerge       |           877 → 532 |      0.61 |       1.20 → 0.77 |       277.6 → 237.8 |
| tmpfs      |   264 | resolve       |           596 → 657 |      1.10 |       0.88 → 0.92 |       378.4 → 383.4 |
| btrfs      |     8 | importObjects |           256 → 263 |      1.03 |       0.32 → 0.34 |       149.4 → 150.2 |
| btrfs      |     8 | merge         |           320 → 313 |      0.98 |       0.41 → 0.39 |       153.9 → 158.3 |
| btrfs      |     8 | abort         |         1215 → 1211 |      1.00 |       0.86 → 0.85 |       331.0 → 312.2 |
| btrfs      |     8 | remerge       |           325 → 314 |      0.97 |       0.41 → 0.39 |       154.6 → 158.7 |
| btrfs      |     8 | resolve       |           459 → 457 |      0.99 |       0.59 → 0.58 |       266.5 → 268.1 |
| btrfs      |   264 | importObjects |           295 → 303 |      1.03 |       0.39 → 0.41 |       150.9 → 151.0 |
| btrfs      |   264 | merge         |           896 → 554 |      0.62 |       1.28 → 0.82 |       285.6 → 237.6 |
| btrfs      |   264 | abort         |         1784 → 1928 |      1.08 |       1.92 → 1.96 |       514.1 → 526.9 |
| btrfs      |   264 | remerge       |           886 → 564 |      0.64 |       1.30 → 0.82 |       285.9 → 237.2 |
| btrfs      |   264 | resolve       |           627 → 648 |      1.03 |       0.90 → 0.88 |       367.9 → 388.3 |

The large merge and remerge commands are approximately 36–39% faster in these
fixtures, with less CPU and sampled memory. Small merges are broadly similar;
large abort is 5–8% slower and resolve is 3–10% slower. This establishes a specific
merge benefit rather than a general command speedup. The engine stays opt-in.
Both modes receive the same environment. Native Git temporary files use system
temp (`TMPDIR=/dev/shm` here), while canonical Git inputs use the scope filesystem;
Btrfs measurements therefore include that existing implementation difference.

These results qualify production revision `ae2e61cb56b2`, with exact source and
compiled SHA-256 fingerprints in each report. The native source digest is
`369b7333d1f068f8105296dee08ac1cf40d8c623ec9dd47299d23b0001d9b7fc`.
The official explicit-target package and measured helper SHA-256 is
`ba3fe4e8b5826d6e0bdc2ae8bdcdd28cbec9534eeaf54ce19633921e633afc4a`.
Four-mode correctness and adapter tests also qualify the implicit-target helper
`f8e7f8495dc8bda62074db9bd8781dfa4894602267d7198c0acd57454dfa0949`,
built from the same native sources. Reports, retained samples and absolute medians
are in `bit-merge-history-evidence-2026-10-11/performance` outside Git. Local
qualification is Linux; the source/compiled adapter matrix covers Linux, macOS
and Windows in CI.

### Lane snapshot policy and pending merge state

The next operation boundary uses the `BMT1` protocol in the existing workspace
helper session. Rust selects lane snapshot parents, visible or hidden lane head
updates, and readme head updates. Merge reconciliation covers ordinary second
parents, diverged squash metadata, and unrelated history origin rules. Node
applies guarded patches to the existing model objects and retains hook calls,
configuration handling, public error classes, and object identities.

Rust also owns a bounded pending merge list for each helper session. Opaque
tokens and revisions bind initialization, add/remove transitions, and persistence
to the exact state acknowledged by the helper. A stale or malformed response
retires the helper before canonical fallback. Pending metadata is capped at
4 MiB and 4096 entries. Node supplies canonical JSON formatting; Rust validates
that its parsed value equals the owned list before writing it. Successful write
acknowledgements remain authoritative if the live Node object subsequently changes.

Existing ordinary Unix files retain their inode, permissions, ownership, ACLs,
and extended attributes. Symlinks and hard links use canonical persistence.
Existing Windows files use canonical persistence; native creation of new files
is supported. This remains opt-in through `BIT_RUST_CLIENT_VCS=on`.

`merge-state.test.cjs` runs against source and the physical compiled graph in
the Linux/macOS/Windows CI matrix. Real workspace qualification exercises
manual recovery, automatic ours/theirs, diverged squash, unrelated ours/theirs,
and completed lane abort in native, missing-helper, and failed-helper modes.
It compares source bytes, object contents and metadata, bitmap, index, status,
history, and pending state. Diagnostic traces require accepted native lane
snapshot, reconciliation, transition, and persistence requests with one helper
per command. Evidence remains outside Git in
`$HOME/bit-merge-state-evidence-2026-10-11`.

Fast-forward and detached squash history rewriting, broader lane orchestration,
and configuration merge policy remain for the next merge migration chunk. This
boundary does not complete the merge milestone or the umbrella roadmap.

Local qualification passes 22 source and 22 compiled adapter tests, 54 source
and 54 compiled regressions, 69 unchanged canonical model tests, 154 Rust
workspace tests, and 30 packaged-helper checks. Native formatting, Clippy,
Dylint and rustdoc checks pass. The production revision is
`65a0dae0d6456286bef2561bdb5646c6fdbf29f4`; native source SHA-256 is
`c04e02ad536979b41993b78ec9a031f0d1c294c7136a77bf6935376da7576c4a`.
The official explicit-target helper SHA-256 is
`1d4f407a23fe73bfda8cd95a93232b42a5233a61dba34b6888157f32682ad940`.

### Lane policy and state command measurements

These measurements exercise the new lane snapshot and policy/state operation
boundaries, with six real merge scenarios and 8 or 264 files at lane snapshot.
Three retained alternating Node/native pairs follow an excluded paired warmup
on Linux tmpfs and Btrfs. Every run retains exact six-policy workspace parity
before generating compact report digests. Diagnostics are disabled for timing;
CPU includes descendants, and RSS is sampled across the simultaneous process
tree at 10 ms intervals. Both modes use `TMPDIR=/dev/shm`; canonical Git input
files use the scope filesystem while native Git input files use system temp.

| Filesystem | Files | Command         | Wall ms Node → Rust | Rust/Node | CPU s Node → Rust | RSS MiB Node → Rust |
| ---------- | ----: | --------------- | ------------------: | --------: | ----------------: | ------------------: |
| tmpfs      |     8 | laneSnap        |           404 → 420 |      1.04 |       0.54 → 0.56 |       231.1 → 245.6 |
| tmpfs      |     8 | laneMergeManual |           440 → 438 |      1.00 |       0.60 → 0.59 |       232.4 → 238.2 |
| tmpfs      |     8 | laneResolve     |           443 → 447 |      1.01 |       0.58 → 0.58 |       266.6 → 268.8 |
| tmpfs      |     8 | laneMergeOurs   |           512 → 508 |      0.99 |       0.68 → 0.66 |       284.4 → 285.5 |
| tmpfs      |     8 | laneMergeSquash |           510 → 517 |      1.01 |       0.66 → 0.68 |       285.9 → 286.4 |
| tmpfs      |   264 | laneSnap        |           569 → 591 |      1.04 |       0.81 → 0.80 |       340.9 → 364.4 |
| tmpfs      |   264 | laneMergeManual |           703 → 714 |      1.01 |       0.99 → 0.97 |       337.9 → 354.1 |
| tmpfs      |   264 | laneResolve     |           604 → 643 |      1.06 |       0.88 → 0.90 |       377.9 → 384.9 |
| tmpfs      |   264 | laneMergeOurs   |           791 → 833 |      1.05 |       1.17 → 1.21 |       407.8 → 433.3 |
| tmpfs      |   264 | laneMergeSquash |           877 → 897 |      1.02 |       1.32 → 1.27 |       406.6 → 435.8 |
| btrfs      |     8 | laneSnap        |           423 → 429 |      1.01 |       0.55 → 0.57 |       244.4 → 246.3 |
| btrfs      |     8 | laneMergeManual |           452 → 444 |      0.98 |       0.60 → 0.57 |       234.1 → 235.6 |
| btrfs      |     8 | laneResolve     |           455 → 449 |      0.99 |       0.58 → 0.56 |       267.0 → 268.1 |
| btrfs      |     8 | laneMergeOurs   |           553 → 541 |      0.98 |       0.71 → 0.68 |       283.9 → 285.0 |
| btrfs      |     8 | laneMergeSquash |           544 → 556 |      1.02 |       0.69 → 0.69 |       286.9 → 286.1 |
| btrfs      |   264 | laneSnap        |           571 → 620 |      1.08 |       0.81 → 0.84 |       331.7 → 386.0 |
| btrfs      |   264 | laneMergeManual |           752 → 759 |      1.01 |       1.08 → 1.03 |       336.8 → 353.1 |
| btrfs      |   264 | laneResolve     |           625 → 671 |      1.07 |       0.96 → 0.91 |       377.3 → 392.8 |
| btrfs      |   264 | laneMergeOurs   |           834 → 891 |      1.07 |       1.25 → 1.28 |       403.6 → 434.2 |
| btrfs      |   264 | laneMergeSquash |          940 → 1005 |      1.07 |       1.46 → 1.44 |       402.3 → 432.1 |

The selected small-case wall ratios range from 0.98 to 1.04; large-case ratios
range from 1.01 to 1.08. Component abort and remerge range from 1.00 to 1.09,
ours/theirs unrelated merges from 1.00 to 1.11, and automatic theirs from 0.99
to 1.09 across all cases. These results establish operation ownership and
correctness, with additional overhead on several large paths. They do not
establish a broad command speedup. The engine remains opt-in.

The original lane-abort samples returned before the confirmation prompt
completed with closed stdin. Their 209–220 ms timings do not measure a completed
abort and have been removed from this table. The other command samples are
unaffected. The next qualification uses `--silent`, requires successful restore
output and checks completed restore state before recording replacement samples.
The original reports are retained as historical evidence with that limitation.

All four reports bind the production revision, native source and official
helper fingerprints above, exact source/compiled adapter fingerprints, and the
qualification harness digests. Retained per-round samples, full medians for
all 44 case/operation combinations, CPU and RSS values, and CSV output remain
in `bit-merge-state-evidence-2026-10-11/performance` outside Git. Reproduce with
`merge-state-qualification.cjs <private-cli> <release-helper>` and
`BIT_MERGE_STATE_QUALIFICATION_MEASURE=1`,
`BIT_MERGE_STATE_QUALIFICATION_ROUNDS=3`,
`BIT_MERGE_STATE_QUALIFICATION_DIAGNOSTICS=0`,
`BIT_MERGE_STATE_QUALIFICATION_COMPACT_REPORT=1`, and
`BIT_MERGE_STATE_QUALIFICATION_EXTRA_FILES=0` or `256`; select the filesystem
with `BIT_MERGE_STATE_QUALIFICATION_TMPDIR`.

### Squash history and lane abort operations

The next merge boundary extends the shared `BMT1` session with phased squash
policy, verified repository commit-message reads, and history reconciliation.
Rust selects whether fast-forward or detached squash should skip, request the
existing public model lookup, or rewrite ancestry. The adapter applies the
selected existing Ref objects and retains the original parent array for squash
metadata. Legacy Version parent behavior and the canonical one-incoming-snap
skip rule remain unchanged.

Parent changes occur before the existing message import hook. A failed import
or message load therefore leaves the same partial parent mutation as Node;
fallback replays only the message-read phase. Rust reads Versions in fresh
bounded batches because their identifiers can remain stable while their bodies
change. The graph reader shares this validated decoder. Compressed and decoded
batches are capped at 32 MiB, with 4096 references and a 4 MiB response. Normal
cached Version messages must match the fresh result; mutated messages, custom
readers, parsers, transforms, and cache hooks retain canonical loading. These
reads return commit-message metadata, rather than file bodies or entire Versions.

History reconciliation selects only the first supplied Version that already has
an existing history record, matching the canonical short-circuit. Node applies
that selection to the existing record and preserves its parent/unrelated/squash
Ref and array aliases. Missing records are not inserted, and the existing dirty
state remains unchanged.

Lane abort now owns the shared operation session across its restore, reload,
pending-state clear, persistence, and checkout. Rust clears the pending list
through a token/revision-bound transition after the new consumer has loaded.
The existing restore and confirmation hooks, conflict-file deletion, checkout
error handling, and public result shape retain their order. The engine remains
opt-in. Backup/restore orchestration and configuration/aspect-data merge policy
are still adapter boundaries for subsequent substantial chunks.

Qualification uses the physically compiled 21-component CLI graph. All six
main/lane/detached squash scenarios (one and three incoming snapshots) and a
completed lane abort produce identical files, bitmap, objects, pending state,
status, and reachable history in Node, native, missing-helper, and crashed-helper
modes. Native diagnostics confirm eight policy, four message-read, and four
history-reconciliation acknowledgements. Abort initializes, clears, and persists
the pending list and restores eight source files through one owned helper.
The fixture passes `--silent` and requires restoration output, the pre-merge
bitmap/files/history, and deletion of the last-merged backup.

Validation includes 169 Rust tests, 18 source adapter tests plus one intentional
mixed-module lifecycle skip, all 19 physically compiled adapter tests, 120 source
and 120 compiled regression tests, 69 canonical model tests, canonical lint,
Clippy/Dylint/rustdoc, and 30 packaged-artifact/discovery tests. Tests cover fresh
mutable Versions, non-string messages, legacy ancestry, first-record aliases,
mutation before importer errors, malformed acknowledgements, modified inputs,
custom hooks, and fallback helper retirement.

The packaged Linux helper is bound to production revision
`601390bb30f59eebfcc790357c82e9223599c574`, native source digest
`29b99dcd1603266bc025d0585164da83f973334c0787fd70f1b3d29bff569fbd`,
and binary SHA-256
`6b67a603e0ee804af750a1e5d5737bf6682e349ce5825926cfafcbc71a128014`.
Reports retain every source/compiled/harness fingerprint and verify them before
and after qualification.

Complete-command measurements retain three alternating Node/native pairs after
one warm-up pair for each filesystem and size. Diagnostics are disabled while
timing; source/helper/harness bindings stay fixed. CPU includes subprocesses;
RSS is the sampled peak of the complete process tree. Workspaces use the named
filesystem, while `TMPDIR=/dev/shm` is common to both modes; canonical Git temps
use the scope directory and native Git temps use the system temporary directory.
Wall-time ratios span 0.96–1.09, without a broad speed gain. Larger native commands
also generally use more memory. Rollout remains opt-in. These completed abort
measurements replace the withdrawn pre-confirmation timings above.

| Filesystem | Files at lane snapshot | Operation | Wall ms Node → Rust | Rust/Node | CPU s Node → Rust | RSS MiB Node → Rust |
|---|---:|---|---:|---:|---:|---:|
| tmpfs | 8 | squashMain1 | 396 → 405 | 1.02 | 0.55 → 0.55 | 221.4 → 222.4 |
| tmpfs | 8 | squashLane1 | 368 → 382 | 1.04 | 0.52 → 0.53 | 213.2 → 218.4 |
| tmpfs | 8 | squashDetached1 | 396 → 408 | 1.03 | 0.54 → 0.56 | 220.0 → 222.9 |
| tmpfs | 8 | squashMain3 | 387 → 398 | 1.03 | 0.52 → 0.53 | 224.9 → 220.5 |
| tmpfs | 8 | squashLane3 | 363 → 384 | 1.06 | 0.49 → 0.53 | 212.4 → 216.5 |
| tmpfs | 8 | laneAbort3 | 300 → 300 | 1.00 | 0.39 → 0.38 | 155.9 → 157.9 |
| tmpfs | 8 | squashDetached3 | 408 → 410 | 1.00 | 0.57 → 0.57 | 223.0 → 220.6 |
| tmpfs | 264 | squashMain1 | 617 → 609 | 0.99 | 0.86 → 0.83 | 321.6 → 345.9 |
| tmpfs | 264 | squashLane1 | 542 → 588 | 1.09 | 0.73 → 0.80 | 311.8 → 336.3 |
| tmpfs | 264 | squashDetached1 | 592 → 605 | 1.02 | 0.84 → 0.85 | 319.2 → 342.6 |
| tmpfs | 264 | squashMain3 | 591 → 629 | 1.06 | 0.84 → 0.87 | 320.9 → 345.4 |
| tmpfs | 264 | squashLane3 | 545 → 579 | 1.06 | 0.73 → 0.79 | 312.1 → 336.8 |
| tmpfs | 264 | laneAbort3 | 450 → 432 | 0.96 | 0.59 → 0.56 | 202.9 → 235.9 |
| tmpfs | 264 | squashDetached3 | 597 → 623 | 1.04 | 0.85 → 0.88 | 320.5 → 343.7 |
| btrfs | 8 | squashMain1 | 406 → 403 | 0.99 | 0.56 → 0.55 | 217.5 → 223.0 |
| btrfs | 8 | squashLane1 | 367 → 373 | 1.02 | 0.49 → 0.50 | 211.8 → 217.3 |
| btrfs | 8 | squashDetached1 | 399 → 409 | 1.03 | 0.54 → 0.56 | 219.7 → 224.3 |
| btrfs | 8 | squashMain3 | 400 → 398 | 0.99 | 0.54 → 0.53 | 219.0 → 223.0 |
| btrfs | 8 | squashLane3 | 367 → 387 | 1.06 | 0.51 → 0.53 | 212.3 → 217.4 |
| btrfs | 8 | laneAbort3 | 314 → 316 | 1.01 | 0.39 → 0.39 | 157.2 → 158.6 |
| btrfs | 8 | squashDetached3 | 397 → 411 | 1.03 | 0.54 → 0.56 | 220.4 → 223.9 |
| btrfs | 264 | squashMain1 | 642 → 648 | 1.01 | 0.96 → 0.90 | 321.2 → 343.2 |
| btrfs | 264 | squashLane1 | 563 → 584 | 1.04 | 0.77 → 0.78 | 304.3 → 337.4 |
| btrfs | 264 | squashDetached1 | 606 → 649 | 1.07 | 0.87 → 0.90 | 322.9 → 344.6 |
| btrfs | 264 | squashMain3 | 620 → 652 | 1.05 | 0.90 → 0.90 | 321.6 → 345.0 |
| btrfs | 264 | squashLane3 | 564 → 591 | 1.05 | 0.81 → 0.78 | 312.9 → 337.3 |
| btrfs | 264 | laneAbort3 | 466 → 475 | 1.02 | 0.62 → 0.62 | 204.4 → 233.1 |
| btrfs | 264 | squashDetached3 | 611 → 660 | 1.08 | 0.89 → 0.94 | 322.5 → 343.5 |

Reproduce with `scripts/rust-object-import/squash-history-qualification.cjs`,
`BIT_SQUASH_HISTORY_QUALIFICATION_MEASURE=1`,
`BIT_SQUASH_HISTORY_QUALIFICATION_ROUNDS=3`,
`BIT_SQUASH_HISTORY_QUALIFICATION_DIAGNOSTICS=0`,
`BIT_SQUASH_HISTORY_QUALIFICATION_COMPACT_REPORT=1`, and
`BIT_SQUASH_HISTORY_QUALIFICATION_EXTRA_FILES=0` or `256`; choose the workspace
filesystem with `BIT_SQUASH_HISTORY_QUALIFICATION_TMPDIR`. The checked report
retains the individual wall/CPU/process-tree samples and exact input fingerprints.

## Component configuration and workspace dependency reconciliation

The shared client operation also owns configuration merge decisions. `BMT1`
requests merge ordered component aspect configurations, compare aspect data,
rescue scope dependency policies, reconcile workspace dependency versions, and
prepare and commit workspace JSONC conflicts. Component, scope and workspace
policy requests contain bounded metadata; source bodies remain in the existing
native repository and file merge paths.

Component policy covers ordinary aspects, environment versions and dependency
resolver policy. Configuration equality preserves canonical JSON key order;
aspect data compares object keys independently of insertion order and preserves
array order. Explicit metadata preserves ordinary top-level own `undefined` data
properties, including their distinction from absent properties; unsupported
nested values retain the canonical path. Results retain canonical configuration and data references through
source selectors. The adapter hydrates public classes and private merger state,
including the original handled-ID array, so later calls see the same state.
Scope policy appends missing forced dependencies before removing deletion
markers. Existing entry references survive, while each retained lifecycle receives
a new array, as in the canonical implementation.

Workspace reconciliation retains lifecycle ordering, forced-policy precedence,
conflict cleanup, public diagnostics and write ordering. Node parses npm semver
syntax into bounded comparator metadata; Rust evaluates version comparisons,
range satisfaction and dependency merge decisions. Public dependency-resolver
collection, Harmony callbacks, presentation and configuration backup hooks remain
adapter responsibilities.

For workspace JSONC conflicts, Rust reads the file freshly, applies the canonical
first literal replacement for each package and invokes the shared bounded Git
merge. It retains the resulting bytes in an operation-owned private candidate.
The adapter calls the public backup hook once before the native commit. A
successful commit is authoritative for the captured original path. If the helper
fails after planning or a backup hook installs a custom writer, the adapter
validates and writes the retained candidate without repeating the backup or
planning phase. Successful native writes do not pass the file body through Node.

Unix commits preserve the inode and existing metadata of ordinary single-link
files. Unsupported existing files, including Windows files, symlinks and hard
links, use the retained-candidate write fallback. Rust can prepare its owned
private candidate on Windows without changing that workspace-write fallback.
Missing helpers, unsupported
metadata, changed methods, accessors or custom logger implementations retain the
canonical path. Ordinary Harmony persistence callbacks and lane component-ID
lists remain eligible because the configuration planner does not invoke the
persistence callbacks and projects ID lists into plain wire arrays.

This path remains controlled by `BIT_RUST_CLIENT_VCS=on`; configuration policy
migration alone does not establish a command speedup.


### Configuration qualification

Qualification uses a physical private CLI with 22 compiled components. The
production commit is `7f3383a5854f1b8df5acd961db7987b62e59a11e`, based on the
merged squash/history commit `3cb390750a7c232a2564136620daab95dbeadaea`. The
official `x86_64-unknown-linux-gnu` release artifact binds native source digest
`a36d5de36d2d6897bb8842a267b033cc2c4862a00586125118de979af69071fa` and helper
SHA256 `55d6a25e42f80ed23284c303880daa1195e9f7b2c3b92cdb8fdf9a3a3715823a`.

All 192 Rust workspace tests pass with pinned formatting, strict Clippy, Dylint
and rustdoc checks. Source and physically compiled configuration adapters each
pass 24 tests. Existing source regressions pass 169 tests with one Windows-only
skip on Linux; compiled regressions pass 159 tests, canonical model tests pass
69, and official artifact/discovery tests pass 30 without skips. Full private
CLI TypeScript checking and lint pass.

The reproducible differential driver compares 2,500 seeded workspace policy
cases and 1,500 scope policy cases with the actual canonical methods and installed
npm semver. It checks diagnostics, lifecycle decisions, scope rescue/filter
ordering, original-array mutations and retained aliases. The official helper
passes all 4,000 cases, with source, compiled module, helper and driver bindings
verified before and after execution.

Real commands exercise clean and conflicting lane merges and imports in four
modes: canonical, native, missing helper and crashed helper. They compare complete
Sources and objects, bitmap, histories, pending merge configuration, raw JSONC
comments/conflict markers, backup contents and reasons, and public status. The
native lane commands acknowledge two component plans, one workspace merge and
two scope policy plans; imports acknowledge workspace updates. Both conflict
boundaries acknowledge JSONC preparation and commit. Acceptance requires a
successful acknowledgement for every new operation, preventing silent fallback
from counting as native qualification.

Adapter tests additionally cover ordinary Harmony callbacks, lane ID list
subclasses, environment own-undefined metadata, resolver optional metadata,
accessor rejection without invocation, sparse arrays, read-only scratch fields,
input mutation while planning, nested aliases and repeated merger calls. Failure
cases verify helper reaping, candidate recovery after helper death, one backup,
custom writers installed by backup hooks and the original captured target path.
The actual-command results are local Linux qualification; source/compiled
adapters run in the Linux/macOS/Windows CI matrix.

Reproduce correctness with `config-merge-qualification.cjs <private-cli>
<release-helper> <report.json>` and the seeded comparison with
`config-merge-differential.cjs <private-cli> <release-helper> <report.json>` in
`scripts/rust-object-import/`. The retained correctness report binds the
qualification driver SHA256
`88e4de51ce0c4d7b74c51849259073e689fd19e0f6168cbc8b32e3a7a3fd205f`, fixture
`25b90da9545d3c402cb54053a0d6f267c626f03bdcf3999e4a754ef7bf0deeaa`,
determinism preload
`737384a5423f2487c6e1cd0210c14bb664d54fd79300f501327d4232aba046db`, and
seeded driver `f9f928305b08101cba4828517f78fc7dbdf23874e87589456860a04cbcf6c991`.
Full source/compiled module and harness bindings are retained and checked at
both ends of each run.


### Configuration complete-command measurements

Four local Linux cases use tmpfs and Btrfs, with either 8 source files and one
automatic dependency per component, or 264 source files and 257 automatic
dependencies per component. Each has one warmup pair and three retained
alternating canonical/native pairs. Timing covers actual clean/conflicting lane
merge and import commands, including Node, helpers and Git descendants. CPU is
process-tree CPU; peak RSS is the near-simultaneous process-tree sum sampled at
10 ms, excluding filesystem cache. Fixture setup, warmups and separate diagnostic
runs are excluded. Both modes use the same default temporary-directory settings;
the workspace/scope scratch directory selects the filesystem.

The larger lane workloads take 28–32% less wall time, with higher peak memory.
Small workloads and imports have wall-time ratios of 0.96–1.05. These are
whole-client flag comparisons that also enable earlier native stages; both file
and dependency counts increase together. They do not isolate configuration-stage
speedups or establish gains for other workloads. Rollout remains opt-in.

| Filesystem | Sources | Auto deps/component | Command | Wall ms Node → Rust | Ratio | CPU s Node → Rust | RSS MiB Node → Rust |
|---|---:|---:|---|---:|---:|---:|---:|
| tmpfs | 8 | 1 | lane-clean | 463 → 484 | 1.05 | 0.60 → 0.64 | 240.1 → 243.8 |
| tmpfs | 8 | 1 | lane-conflict | 481 → 476 | 0.99 | 0.64 → 0.62 | 239.4 → 244.1 |
| tmpfs | 8 | 1 | import-clean | 273 → 282 | 1.03 | 0.34 → 0.36 | 148.6 → 149.2 |
| tmpfs | 8 | 1 | import-conflict | 283 → 272 | 0.96 | 0.37 → 0.34 | 148.7 → 149.4 |
| tmpfs | 264 | 257 | lane-clean | 1222 → 828 | 0.68 | 1.76 → 1.38 | 345.8 → 390.0 |
| tmpfs | 264 | 257 | lane-conflict | 1218 → 840 | 0.69 | 1.75 → 1.41 | 343.3 → 386.0 |
| tmpfs | 264 | 257 | import-clean | 370 → 389 | 1.05 | 0.49 → 0.48 | 171.8 → 181.2 |
| tmpfs | 264 | 257 | import-conflict | 370 → 365 | 0.98 | 0.46 → 0.45 | 172.6 → 178.2 |
| btrfs | 8 | 1 | lane-clean | 487 → 488 | 1.00 | 0.64 → 0.64 | 236.8 → 245.0 |
| btrfs | 8 | 1 | lane-conflict | 476 → 477 | 1.00 | 0.62 → 0.62 | 247.9 → 242.8 |
| btrfs | 8 | 1 | import-clean | 282 → 279 | 0.99 | 0.35 → 0.36 | 149.4 → 149.4 |
| btrfs | 8 | 1 | import-conflict | 283 → 282 | 1.00 | 0.35 → 0.35 | 149.1 → 149.0 |
| btrfs | 264 | 257 | lane-clean | 1252 → 882 | 0.70 | 1.91 → 1.44 | 343.6 → 396.8 |
| btrfs | 264 | 257 | lane-conflict | 1235 → 888 | 0.72 | 1.89 → 1.48 | 344.2 → 396.9 |
| btrfs | 264 | 257 | import-clean | 396 → 411 | 1.04 | 0.52 → 0.52 | 175.2 → 184.5 |
| btrfs | 264 | 257 | import-conflict | 386 → 394 | 1.02 | 0.55 → 0.49 | 174.0 → 178.4 |

Reproduce each case with `node scripts/rust-object-import/config-merge-measure.cjs
<private-cli> <release-helper> <extra> <scratch-directory> <report.json>`, using
`<extra>` equal to `0` or `256` and scratch directories on tmpfs or Btrfs. The
wrapper calls the same frozen qualification implementation and options used by
the retained measurement driver. Reports preserve individual samples, exact
state fingerprints, source/compiled modules, helper identity and harness hashes,
all verified at the start and end of every case. Separate correctness runs
require successful native acknowledgements for all six operations.

## Lane recovery and reset references

The next operation chunk moves lane backup capture, persistence and restoration,
bitmap recovery planning, and successful reset reference decisions into the
shared Rust operation. `LastMerged` and the public reset entry point keep the
helper alive through their persistence and workspace lifecycle.

Recovery plans contain bounded file operations, with revision-bound tokens and
acknowledged sequential prefixes. Rust reads each copy source when the operation
executes; bytes are not cached across a prompt, lane compression callback or
staged-configuration hook. Initial backup removal, directory creation and file
copies can run as one phase. A failed phase resumes the canonical implementation
at its unacknowledged tail, rather than repeating earlier public callbacks or
the whole backup operation.

The adapter preserves lane cloning and compression, typed errors, prompts and
repository class hydration. During abort, the saved lane is written to the
repository before bitmap parsing or the confirmation prompt. Cancellation
therefore retains that existing lane-write prefix. Staged files are copied or
deleted at their original lifecycle positions, and the backup is removed last.
Independent directory removals preserve the existing concurrent behavior;
sequential removal is eligible only when the directories are disjoint.

The native bitmap reader accepts a bounded subset of JSON with comments and
trailing commas. It validates component identities, scope/default-scope metadata,
duplicate roots and lane metadata before returning directory decisions.
Malformed or unsupported records retain canonical parsing and its public errors.
Class, parser, method and filesystem overrides also retain canonical execution.

Abort now protects the workspace directory when a merge introduces a workspace
root component. The directory itself is excluded from removal in both paths,
including equivalent normalized and physical paths (for example, macOS `/var`
and `/private/var`). The bitmap and workspace configuration are
still restored, and the subsequent checkout handles the surviving components.
This is an intentional correction to the previous abort behavior, which could
recursively remove the workspace directory.

For successful resets, Rust selects surviving parents, handles tag/orphaned-tag
precedence, computes lane retention and detached-head changes, and decides whether
to retain the model component. Returned parent selectors refer to the adapter's
live `Ref` objects: equal hashes alone do not establish the reference identity
used by the canonical lane-removal rule. Fresh bounded Version reads validate
parent metadata when traversal is required; the common-snap shortcut does not
require Version reads. Unsupported inputs or error outcomes decline before model
mutations, preserving the canonical ordering of partial mutations and errors.
Reset removes model references, rather than deleting the stored Version objects.

Direct native file copies currently qualify ordinary single-link Linux files.
They preserve an existing destination inode, copy source permissions and retain
destination ownership and extended attributes. POSIX ACLs, links and other
platforms retain canonical copying. Node continues to invoke public hooks and
to serialize compressed lane backups. Rollout remains opt-in under
`BIT_RUST_CLIENT_VCS=on`.

### Recovery and reset qualification

The production revision is
`966c14f3127b293d23652b194e0dd1c082092dcf`. The packaged GNU helper has native
source digest
`819776cd3df0ab3c80a691d5fa9655f6a0412621cac20b1617f6739771f85dd5`
and binary SHA256
`6539e4701ce1bbfed059803413a0d8bab5d8bae2076bda849fbde2ef3cdd32c3`.
The private CLI records the actual source and physically compiled module digests;
qualification verifies these, the helper and its harness inputs before and after
the run.

Local checks pass 213 Rust tests, pinned formatting, strict Rust lints and full
canonical CLI lint. Twelve recovery/reset tests pass in both source and compiled
forms. They cover the already-written lane prefix, cancelled prompts, fresh
staged bytes after compression hooks, compression errors, workspace-root aliases,
typed bitmap errors, a 78-case bitmap corpus, Linux inode/mode/extended attributes,
partially acknowledged backup persistence, main/visible/hidden-lane reset reference
identity, changed cached parent identity after an acknowledged plan and custom
loader error timing. Existing adapter regressions pass, with one intentional
platform skip in the source suites. Nine diagnostic tests and all 30 packaged
artifact/discovery tests also pass.

The real-command driver creates three incoming lane snaps, performs a squash
merge and a genuine silent abort, then creates two local snaps and runs head-only
and full reset. It repeats this with staged snaps/configuration present and
absent. Node, native, missing-helper and crashed-helper modes match exact source
files, raw bitmap/configuration, stored objects, reachable history, staged state,
recovery backups and public status. Reset retains the current working file bytes.

Every native diagnostic command uses one helper. Both head-only and full reset
must complete a `resetRefsPlan` request in each staged scenario. Abort must complete
pending-state initialization/transition/commit and actual recovery filesystem
steps. A successful outer protocol acknowledgement alone does not qualify: the
driver requires positive `stepsCompleted` and zero `dataFailed`. Native merge
capture/persistence completes 10 steps with staged state present and 6 with it
absent; abort completes 5 and 3 respectively. Native bitmap planning succeeds in
both aborts. Diagnostic observation preserves captured production method identities
so that the observer itself does not force canonical fallback.

Reproduce with `lane-recovery-qualification.cjs <private-cli> <release-helper>`.
The qualification driver SHA256 is
`936a93eaac52686d5d15f49bbd52260a60b42eb9309f0190736c04be7824aeb0`,
merge fixture
`55f63786803e14e9f7e78d7dfb172ae9054175d005e8a3aea7055ca2bf33f810`,
staged/lane fixture
`e615a25016b297b509ccb93e5803730b17374ced24c230d6fd28b2d1e1700551`,
determinism preload
`5e5bf6ca651bab8cc0744a468c9a4d4c882a79eb0b71b34c62740143f89c2722`,
measurement core
`8005a853e69a9245421df983a4810db841b7c391f84f45983b1dbd849f54e95d`,
and observer
`97cb446ff8a49d696e100be114868517646149dfd6a15c16191be1b18713975a`.

### Recovery and reset command measurements

`lane-recovery-measure.cjs <private-cli> <release-helper> <extra-files>
<scratch-directory> <report.json>` invokes the same frozen qualification driver,
with one warmup per mode and three alternating Node/native pairs. Use extra-files
`0` and `256` for the 8- and 264-file workspaces. It retains separately identified
staged-present and staged-absent samples for the incoming three-snap lane squash,
silent abort, head-only reset and full reset. Warmups are excluded from medians.
Diagnostics are disabled during measured commands. Wall time and CPU include the
whole command; RSS samples the Node/helper/Git process tree every 10 ms.

The fixture scratch directory selects tmpfs or Btrfs. Both modes use the same
private CLI and shared `TMPDIR` under `/var/home/zoltan/bit-cli-staging`; this does
not move every process temporary file onto the fixture filesystem. The native
mode enables the shared client VCS engine, including its previously migrated
kernels. These comparisons do not isolate the new recovery/reset policy alone.

Ratios below are native/Node. Each row retains its staged state separately.

| Case | Staged | Command | Wall ms Node→Rust | Ratio | CPU s Node→Rust | RSS MiB Node→Rust |
|---|---|---|---:|---:|---:|---:|
|tmpfs-8|present|lane merge --squash|386→396|1.03|0.54→0.55|216.8→220.2|
|tmpfs-8|present|lane merge-abort --silent|306→315|1.03|0.39→0.40|161.0→165.4|
|tmpfs-8|present|reset --head --force|241→246|1.02|0.29→0.30|145.0→148.5|
|tmpfs-8|present|reset --force|232→249|1.07|0.28→0.31|143.3→148.2|
|tmpfs-8|absent|lane merge --squash|383→392|1.03|0.54→0.55|216.5→221.1|
|tmpfs-8|absent|lane merge-abort --silent|300→316|1.05|0.38→0.41|161.7→162.7|
|tmpfs-8|absent|reset --head --force|237→244|1.03|0.29→0.29|145.0→148.9|
|tmpfs-8|absent|reset --force|236→247|1.04|0.29→0.30|144.7→148.3|
|tmpfs-264|present|lane merge --squash|561→574|1.02|0.78→0.77|315.3→339.7|
|tmpfs-264|present|lane merge-abort --silent|455→433|0.95|0.59→0.57|204.4→232.6|
|tmpfs-264|present|reset --head --force|244→250|1.03|0.29→0.30|144.3→149.0|
|tmpfs-264|present|reset --force|243→241|0.99|0.29→0.29|144.4→149.3|
|tmpfs-264|absent|lane merge --squash|533→575|1.08|0.73→0.77|314.7→338.3|
|tmpfs-264|absent|lane merge-abort --silent|442→445|1.01|0.59→0.58|205.1→236.9|
|tmpfs-264|absent|reset --head --force|246→250|1.02|0.29→0.31|145.3→149.0|
|tmpfs-264|absent|reset --force|241→246|1.02|0.29→0.30|144.5→148.4|
|btrfs-8|present|lane merge --squash|379→396|1.04|0.53→0.55|217.0→220.5|
|btrfs-8|present|lane merge-abort --silent|311→320|1.03|0.40→0.42|157.5→162.8|
|btrfs-8|present|reset --head --force|235→251|1.06|0.29→0.30|144.0→149.4|
|btrfs-8|present|reset --force|235→246|1.04|0.29→0.30|144.4→149.0|
|btrfs-8|absent|lane merge --squash|384→397|1.03|0.54→0.55|215.6→221.5|
|btrfs-8|absent|lane merge-abort --silent|311→321|1.03|0.41→0.42|158.0→166.5|
|btrfs-8|absent|reset --head --force|243→245|1.01|0.30→0.30|144.7→148.5|
|btrfs-8|absent|reset --force|240→244|1.02|0.29→0.29|144.7→148.0|
|btrfs-264|present|lane merge --squash|595→623|1.05|0.81→0.82|316.5→339.2|
|btrfs-264|present|lane merge-abort --silent|500→468|0.94|0.67→0.63|204.5→230.5|
|btrfs-264|present|reset --head --force|238→255|1.07|0.29→0.32|145.3→150.0|
|btrfs-264|present|reset --force|244→251|1.03|0.30→0.30|144.0→147.8|
|btrfs-264|absent|lane merge --squash|605→632|1.04|0.82→0.83|316.2→338.7|
|btrfs-264|absent|lane merge-abort --silent|494→480|0.97|0.68→0.65|204.3→226.8|
|btrfs-264|absent|reset --head --force|246→255|1.04|0.30→0.31|145.4→149.1|
|btrfs-264|absent|reset --force|241→250|1.04|0.29→0.30|143.5→147.8|

These measurements show no broad command speedup. Small-workspace medians are
1.01–1.07 times the Node path. Large-workspace abort medians range from 0.94 to
1.01, while squash ranges from 1.02 to 1.08 and reset from 0.99 to 1.07. Native
RSS generally increases, especially for large squash/abort commands. The complete
per-round samples and 96 paired ratios are retained with the case JSON, CSV and
summary fingerprints; rollout stays opt-in.
