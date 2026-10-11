# Rust workspace persistence operations

This stage extends the file writer merged in PR #71. With
`BIT_RUST_WORKSPACE_PERSISTENCE=on` and an explicit or packaged
`BIT_RUST_OBJECT_IMPORT` helper, ordinary `DataToPersist.persistAllToFS()` operations
can delete paths, write files, and create links through the same Rust process.
The older `BIT_RUST_WORKSPACE_MATERIALIZATION` flag remains available independently.
Both paths remain opt-in.

Node validates every path before mutation and preserves the delete → write → link
phase boundaries. Deletion hooks may add files; file hooks may add links. Ordinary
removal retains the caller's concurrency chunks. Empty-parent cleanup removes all
selected paths first, then visits their immediate parents in reverse lexical order,
including duplicate parents. It ignores `.DS_Store` when deciding whether a directory
is empty, matching the existing utility, and does not walk ancestors. Recursive
removal deletes symlinks themselves rather than their targets.

The existing bounded binary file protocol and canonical newline conversion are
retained. Custom file writers, non-overwriting files and unsupported inputs keep
their existing concurrency chunks. Custom removal methods stay in Node. A link
phase containing any custom or unsupported writer uses its original synchronous
`forEach`, including mutations of later entries and ignored hook return values.
Overridden persistence phase methods also select the original implementation.
Capsule persistence is unchanged.

The new `BWP1` action frames contain up to 64 operations and bounded absolute UTF-8
paths. Rust validates the complete frame before mutation and acknowledges a
completed prefix. Unix links retain ordinary hard-link creation, directory and
cross-filesystem symlink fallbacks, absolute symlink targets, and retries for
existing destinations. Windows regular-file hard links are native; directory
junctions and explicit symlink permission fallbacks use the canonical writer.
Filesystem failures stop the prefix. Node terminates and reaps the helper before
replaying the remainder through the original utilities, preserving public errors.
Link replay is synchronous and stops at its first error. Sequential native actions
can have fewer concurrently started side effects than canonical removal on failure.

`withWorkspacePersistence()` provides an awaited scope for reusing helpers across
multiple persistence operations. Import and component-writer finalization own
these scopes, including installation and compilation writes. Each helper serves
one operation at a time; at most four workspace helpers exist across scopes and
the earlier file-only path. Excess concurrent callers use the canonical writer.
Helpers launch lazily, idle helpers can be reused within their scope, and every
helper is reaped before the scope returns or throws. Failed helpers are retired so
later operations can acquire a fresh process. Nested scopes reuse the owner;
different helper selections cannot reuse a previous selection's process.

## Qualification

The source and physically compiled suites cover real `DataToPersist`, `RemovePath`
and `Symlink` instances, complete phase ordering, immediate-parent cleanup,
`.DS_Store`, recursive removal, Unix link kinds, Windows ordinary links, native
failure replay, missing/crashed helpers, custom and prototype hooks, phase-boundary
mutations, synchronous custom-link ordering, nested scopes, helper selection
changes, concurrent limits, and failed-helper retirement. Rust tests reject invalid
and truncated action frames before mutation. Existing file materialization and
object/model qualification remain in place. CI runs both source and compiled
persistence suites on Linux, macOS and Windows.

Full-command qualification uses `persistence-node` and `persistence-native` modes
in the existing import harness. These use the same compiled CLI, object transport
and helper, changing only the persistence flag. Cold and warm checkout and
installation verify objects, models, bitmap entries, workspace bytes and package
links. Separate excluded diagnostics distinguish file acknowledgements from
deletion/link acknowledgements and count actual helper launches. Ordinary import
fixtures exercise writes and links; deletion semantics are exercised directly by
the persistence suites. Generated reports, binaries and private compiled CLIs stay
outside Git in `$HOME/bit-workspace-persistence-evidence-2026-10-11`.

The final implementation passed 305 applicable Node tests (two platform skips),
44 physically compiled persistence/materialization tests, 74 Rust tests and 69
canonical model/index tests. Canonical TypeScript lint, rustfmt, warning-denied
Clippy, perfectionist Dylint and rustdoc passed. All 20 implementation CI jobs
passed, including the three operating systems.

The retained Linux measurements below are medians in milliseconds, with Node →
Rust values. Checkout and install used nine alternating paired rounds; the
many-small-file checkout used three, with 100 components and 2,500 files. Warmups
and tracing were excluded from timing. CPU and peak simultaneous process-tree RSS
were also recorded in the reports.

| Command / filesystem     | Cold Node → Rust | Warm Node → Rust |
| ------------------------ | ---------------: | ---------------: |
| Checkout / tmpfs         |    328.2 → 326.7 |    299.0 → 300.3 |
| Checkout / Btrfs         |    329.0 → 329.6 |    301.6 → 303.8 |
| Install / tmpfs          |  2318.3 → 4511.7 |  1339.3 → 1387.5 |
| Install / Btrfs          |  1622.9 → 1604.7 |  1169.9 → 1208.5 |
| Many small files / tmpfs |    801.0 → 827.6 |    724.8 → 746.2 |
| Many small files / Btrfs |    887.3 → 901.8 |    774.9 → 782.5 |

These results do not establish a performance improvement. The tmpfs cold install
was particularly variable: Node ranged from 1519–5171 ms and Rust from
1602–10717 ms; all completed retained rounds are included. Rust's cold peak RSS
was also slightly higher in every case. Persistence therefore remains opt-in.

The evidence directory contains the six reports and
`final-provenance-audit.json`. The audit checks source, compiled-module, harness
and helper hashes, expected round counts, successful native acknowledgements and
bounded helper launches. After rebuilding the private CLI, its affected compiled
modules matched the earlier reports byte for byte. Interrupted and superseded
runs are preserved separately under `exploratory/` and excluded from the table.
To reproduce, prepare a private CLI with `prepare-cli.cjs`, then run
`import-qualification.cjs` with `BIT_IMPORT_QUALIFICATION_MODES=persistence-node,persistence-native`,
`BIT_IMPORT_QUALIFICATION_COMMAND=checkout` or `install`, and the desired scratch
filesystem and round count. The retained drivers record the full environment.
