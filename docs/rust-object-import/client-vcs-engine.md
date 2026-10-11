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
