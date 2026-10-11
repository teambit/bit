# Rust client VCS engine

Umbrella issue: [#73](https://github.com/zkochan/bit/issues/73).

The target is a Rust engine owning client VCS operations: repository objects,
refs and indexes, history, workspace comparison and checkout, snapshots/tags,
merges, and fetch/push orchestration. TypeScript adapts Harmony extensions,
canonical component class metadata, installation/build tooling and presentation.
Work is grouped into substantial operation-level PRs.

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
