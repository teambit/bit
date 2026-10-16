# Snapshot and tag qualification

This milestone moves snapshot/tag planning and publication into the Rust client. The
reference behavior is the published Bit 2.2.94 CLI. The JavaScript adapter still runs
Harmony providers, component class hydration, extension issue checks and hooks, the
editor, builders, package transformers, and registry availability queries.

## Ownership and publication order

Rust freezes component selection, automatic dependent snapshots and workspace-root
participation before pre-snap callbacks. It validates the original read set before
callbacks and accepts replacement source proofs only for explicitly identified,
validated callback changes. Source contents cross the adapter boundary through private
file spools, rather than JSON component payloads.

Rust allocates versions, computes dependency graphs, serializes and hashes Source,
Version and model objects, preserves parents and history, and updates local refs,
index, staged metadata and bitmap. Soft tags save per-component versions and messages
without publishing objects. Persistence consumes those saved values.

Publication follows the reference CLI's phases. Build preparation can write staged
snap metadata before a failed builder. Objects and the scope index are published
before package transformation; a failed transformer therefore retains that prefix
without advancing the bitmap. Once extension startup or a publication phase has
begun, an error is reported directly rather than rerunning the command in Node.

## Observable behavior exercised

The real-workspace oracle fixtures cover ordinary snap/tag and dependent cascades,
state and glob selection, versions files, soft-tag persistence, per-component editor
messages, registry collision retries, issue filtering, workspace blocking issues,
local-only and removed components, graph rebuild/omission, and workspace-root
participation and provenance.

Extension fixtures exercise React and composition metadata, application registration, physically compiled
custom aspects, in-memory onLoad changes, physical pre-snap changes, callback
parameters, editor parsing, build artifacts, package transformations and callback
failure prefixes. A tracked package.json remains a tracked Source and is linked
without generated package metadata. Artifact tests preserve binary contents and
reject changed, oversized or escaping spool receipts. Nested files retain the reference
loader's breadth-first order in the serialized Version; source hashes and inflated
object contents are compared, rather than compressed stream bytes.

The reference snapshots preloaded file contents even when a pre-snap callback
changes the physical source. Those physical changes remain in the workspace. It also
preserves an existing dangling source link. Both behaviors are retained.

## Retained canonical boundaries

Tagging on a lane follows canonical validation. Unsupported option grammar, missing
published adapter modules and malformed or over-budget receipts are rejected before
publication. Native batches are bounded to 4,096 components and 32 MiB of captured
source data; artifact receipts are bounded to 4,096 files and 32 MiB and require
confined regular files. Soft premajor/preminor/prepatch tags can be saved, but Bit 2.2.94
rejects their persistence; that path delegates before effects to preserve its error.
Invalid tag editor combinations likewise retain canonical validation.

## Platform qualification

The Rust workflow runs workspace tests on Linux x64/ARM64, macOS Intel/ARM64 and
Windows. It runs the complete ported oracle suite on Linux. The dedicated Windows
workspace VCS job runs status/diff and the snapshot/tag extension fixtures. Windows tests preserve native path separators in
public diff headers, file-link behavior and package metadata.

Bit 2.2.94's Windows file-remote acknowledgement problem is characterized separately
from native publication. Remote status/diff fixtures use the published local export
lifecycle and seed canonical repository objects and indexes on Windows. This
provides real repository states without depending on the broken remote setup
operation. Product acknowledgement checks remain strict. The Windows job runs
every selected oracle group and reports failure if any group fails.

The JavaScript host uses a Rust-owned private `.cjs` file rather than an inline
command-line script, preserving Windows process-creation limits. Its session owns
the file until the child exits; cleanup is tested on success and callback failure.

The registry fixture explicitly restores blocking mode on accepted sockets, including
Windows sockets inheriting a nonblocking listener. Real TCP regressions cover a
disconnected client and delayed headers on an explicitly nonblocking socket. Autosync
fixtures disable automatic Git maintenance before copying their repository; copy
failures remain strict and identify the source and destination.

## Validation record

All required local checks passed: pinned formatter, Clippy, Dylint, rustdoc,
workspace tests (1,201 passed; one existing ignored case), the complete ported
suite (378 passed), and the porting inventory check. The release workspace build
also passed with warnings denied.

On Linux x64, five alternating fresh-copy pairs per command produced these medians:

| Workload | Node 2.2.94 | Rust release | Node / Rust |
| --- | ---: | ---: | ---: |
| Ordinary snap | 835.051 ms | 289.172 ms | 2.89× |
| Ordinary tag | 862.526 ms | 289.988 ms | 2.97× |
| Callback snap | 866.918 ms | 813.980 ms | 1.07× |
| Callback tag | 872.776 ms | 796.997 ms | 1.10× |

All twenty complete stdout/stderr pairs match. Only newly allocated snap refs are
normalized; Rust diagnostic trace lines are removed from stderr. Every Rust run
was checked for native execution without delegation. The callback gain is modest:
these commands still execute the same published Harmony providers and hooks.

The [measurement record](../../scripts/rust/benchmarks/snapshot-tag.json) contains every sample,
commands, source/helper/binary SHA-256 fingerprints, fixture paths and raw log
directories. The ordinary fixture is the durable two-component status/diff
workspace; the callback fixture is the compiled `callback_workspace(false)` setup
in `native/cli/tests/e2e/harmony/snapshot_environments.rs`, with its fixture-owned
links made relative so fresh copies remain independent.

Reproduce each workload with `scripts/rust/bench-native-command.py --source
<FIXTURE> --node <PINNED_NODE_WRAPPER> --rust <RELEASE_BIT> --runs 5 -- <COMMAND>`.
The wrapper executes Node 22.22.0 and the published 2.2.94 entry point. Native source
fingerprinting hashes the unique regular files listed by `git ls-files -co
--exclude-standard -z native`, sorted by path, as `path NUL contents NUL`.

Actual terminal runs of ordinary snap, ordinary tag and callback tag also matched
colors, output and exit codes. They used `script -q -e`, `TERM=dumb` to suppress
animation, and `FORCE_COLOR=1`, with `CI` and `NO_COLOR` unset. CI mode and the `t`
alias are separately covered by the callback oracle. Tests normalize only the
process id in Node runtime warning prefixes when both color environment variables
are present.

The nested diff fixture also accounts for Node's concurrent sibling-directory
completion order: only its two sibling rows and corresponding Files summary order
are normalized; paths, statuses, contents and other placement remain checked.
