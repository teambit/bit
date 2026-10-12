# Client main and lane merge transactions

Main and lane merges use an owned Rust repository session when
`BIT_RUST_CLIENT_VCS=on`. The default remains the canonical TypeScript path.
Rust selects merge status, apply decisions, result membership and dependency
policy, and retains verified Source bodies for three-way merging and file writes.

## Ownership and public effects

An outer operation acquires one physical helper. Nested lane, status and apply
journals retain independent revisions and close in reverse ownership order.
Protocol requests are serialized while the original public callbacks retain
their concurrency. A lost or invalid receipt retires the session; the adapter
continues with the callbacks, objects and clone prefix already observed.
Completed callbacks and effects are never replayed to obtain another receipt.
Interactive strategy prompts release the helper before entering the existing
prompt adapter, so closed stdin can exit normally. If the user selects a
strategy interactively, the remaining work uses the canonical suffix; explicit
strategy flags retain native apply eligibility.

Status discovery remains serial. The existing gap import runs once before
concurrent per-component merge plans. Apply remains serial, followed by the
existing writer, configuration, persistence, pending state, bitmap, installation
and auto-snap boundaries. Receipts record those boundaries after their effects.
This is not an encompassing atomic transaction or rollback mechanism.

Public prompts, imports, model and Source class hydration, configuration hooks,
installation, build, removal effects and CLI formatting remain adapters. Native
dependency selectors consume the identities and existence results returned by
the original callbacks. Hidden lane updateDependents remain in lane history
while result selection excludes them from visible workspace writes.

## Retained file bodies

The status owner prepares verified incoming, base and current contents in a
private directory. Workspace inputs retain filesystem provenance; model inputs
retain Source object provenance. Private receipts carry compressed Source
objects for the existing repository cache and public Source class hydration.
Their decoded contents are not sent back as protocol input.

Logical Source loads and file construction preserve their original group and
completion order. The adapter retains those observations for a fallback suffix.
The synchronous label prefix still hashes and classifies current LF contents in
Node so label writes precede the original Source-load awaits. Rust performs its
own verified classification afterward; both costs belong in measurements.
Rust receives completion permutations and selects the final row order. Late
apply retargets the retained plan to the Version loaded by the original public
loader, including additional Sources absent from the initial incoming plan.

File selectors carry explicit Buffer alias provenance. Unchanged target clones,
current files and incoming cached Sources preserve their respective aliases;
merged text creates a fresh Buffer. Equal bytes alone do not establish an alias.
The adapter validates the entire batch before attaching retained contents, and
the existing workspace writer writes those bodies directly from the helper.
Actual decoder-read and completed-write counters are distinct from receipt
acceptance and retained-body counts.

Private body files outlive child journal closure until workspace-engine cleanup.
Escaped public merge results hydrate their own output strings before directory
removal. Replaced public getters are never invoked by that cleanup.

## Compatibility boundaries

The operation loads the defining model module before status eligibility checks.
This handles compiled lazy exports without registering observed caller values.
Default constructors, defining functions, own data descriptors, original object
aliases and immutable Buffer observations are checked before native results are
used and again after asynchronous acknowledgements. Custom getters, proxies,
changed intrinsics, stale metadata or unsupported bounds decline to the
canonical suffix. The public file clone prefix runs once even when native apply
declines. A partially attached native batch cannot trigger canonical replay.

The history graph reader accepts validated builder artifact metadata without
reading artifact Sources or changing graph traversal and ordering. Other
repository readers retain their existing validation policy.

Ordinary fast-forward, detached-head and non-diverged deletion merges use the
existing verified Source writer without a three-way retained body plan. The
`--no-snap` fast-forward route deliberately uses three-way planning. A hidden
history update can complete with no visible file writes. Qualification checks
these distinct paths and their actual effects separately.

## Qualification and reproduction

[PR #88](https://github.com/zkochan/bit/pull/88) records the final command proofs,
complete-command measurements and rollout decision. The implementation remains
opt-in; moving an operation to Rust does not establish a speedup.

The command corpus covers 36 routes in Node, native, missing-helper and
crashed-helper modes, with six and 266 baseline workspace Sources. Supplementary
hidden/unrelated fixtures report their actual smaller Source inventories.
Captured output, errors, bitmap, workspace bytes and repository objects are
compared with TypeScript. Raw reports are retained. Canonical concurrent Source
loads can reorder adjacent added/updated report rows even between Node-only
runs; comparison treats only each such same-status block as a multiset. Row
bytes, counts, status/component boundaries and all other output stay significant.
Repository index entry order is also treated as unordered. In the main-to-lane
clean route, Node-only repeats also insert independent VersionHistory rows in
different orders. That route compares complete history rows as a multiset while
preserving every row, parent order, graph-complete reference order and header.
The original persisted bytes remain in each artifact. Native acceptance
separately requires actual policy
selection, verified decoder reads and completed writes where the route performs
them. Lost-results, pending-write and snap receipts require their observed
stopped prefixes, with no replacement helper or later native requests. The
runtime, compiled graph, helper and recursive harness dependencies are hashed
before and after each run. Earlier diagnostic subsets are not complete proofs.

Prepare a physically isolated CLI using `scripts/rust-object-import/prepare-cli.cjs`
and a [packaged helper](standalone-artifacts.md). Set `TMPDIR` to the private
staging parent and `BIT_LEGACY_ROOT` to that CLI. Run the default six-Source corpus:

```sh
node scripts/rust-object-import/merge-transaction-qualification.cjs "$CLI" "$HELPER" "$REPORT"
```

For the 266-Source corpus, call the same module's `runQualification(cli, helper,
{ extraFiles: 260, report })`. Both runs must finish with all four modes before
using either report as timing evidence.

The timing driver requires the corresponding complete proof and checks its
fingerprints and raw artifacts. Run it serially for small/large fixtures on
tmpfs and Btrfs, setting `BIT_MERGE_TRANSACTION_CLI`, `_HELPER`, `_PROOF`,
`_REPORT`, `_SCRATCH` and `_EXTRA_FILES` (0 or 260):

```sh
node scripts/rust-object-import/merge-transaction-measure.cjs
```

Each matrix measures 16 command routes with one warmup pair and three retained
pairs in alternating order. It includes Node/helper startup, Git descendants,
IPC, public effects, formatting and cleanup; fixture setup and state capture
are outside the clock. Error, prompt, build and other supplementary routes
remain in the required correctness proof and are excluded from timing loops.
Wall time, process-tree CPU and sampled aggregate RSS describe whole commands.
Keep raw reports outside the repository and report paired medians and variation,
without treating helper-only work as a command speedup.
