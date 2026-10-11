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
