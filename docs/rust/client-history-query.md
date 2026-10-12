# Client repository history queries

Local log, file-history, blame, file-diff and version-history operations share a
Rust repository session when `BIT_RUST_CLIENT_VCS=on`. The default remains the
canonical TypeScript implementation. Remote authentication, imports, Harmony
callbacks, public object hydration and CLI presentation remain adapters.

## Operation ownership

The outer public operation acquires one helper session. Nested callbacks reuse
that session and serialize protocol requests without serializing the public
callbacks themselves. A lost or invalid receipt retires the session; the
canonical suffix runs using the callbacks and objects already observed, without
acquiring another helper or repeating completed public callbacks.

Rust owns version traversal, file lineage, line attribution, file comparison and
history graph membership, edge precedence and ordering. Version traversal returns
the original version JSON and size metadata so the adapter can hydrate the
canonical Version class and apply the repository's existing read-cache policy.
Pending objects and existing cache instances retain their identity and precedence.

Source bodies remain in the native repository engine for comparison and blame.
Private receipts contain exact compressed Source objects for canonical class and
cache hydration. Node reads those private objects and retains the resulting
Source buffers; they are never resubmitted as protocol input. This is a cache
compatibility boundary, and its memory and I/O cost belongs in complete-command
measurements.

File-log workspace callbacks may also hydrate their normal Source buffers before
native comparison. Query-scoped immutable aliases preserve repository provenance
through that hydration and the default file clone. Changed buffers, custom
setters and unknown cached Source replacements decline to the canonical path.
These buffers are never sent to Rust as comparison input.

The adapter validates original constructors, parser and filesystem functions,
own data descriptors, object aliases and receipt bounds before using native
results. Unsupported overrides, getters, proxies and stale aliases decline to
the canonical suffix. Owner closure discards late replies before they can
hydrate cache objects. Private Source receipt directories are removed when the
operation ends.

## Public behavior

Version-history graph construction preserves full-ref metadata callback order,
shortened-hash collisions, parent/squashed/unrelated edge precedence, lane
pointers and the original public Graph/Node/Edge classes. Ranking uses the same
graph observed by the public operation. JSON history display remains canonical
serialization and does not count as a native query.

Blame preserves the existing line-diff attribution policy, including tied log
dates and previous-line content. File diffs preserve the existing Git executable
configuration callback and formatter. Missing and corrupt repository objects
retain canonical public errors through the fallback suffix.

History queries are bounded to 4,096 versions or graph nodes and 16,384 graph
edges or logical Source loads. Retained query metadata and verified Source
caches share a 32 MiB budget; temporary decoding and response buffers are
additional allocations. Ordinary protocol
metadata is limited to 4 MiB; blame and file-diff output may use the bounded
32 MiB response path. Exceeding a supported bound declines to the canonical
implementation.

## Qualification

The command fixture covers local logs and parent graphs, full and one-line file
logs, file history, blame, tagged and lane histories, graph display and rebuild,
tied dates, and missing/corrupt Versions and Sources. The four modes are canonical
Node, healthy native, absent helper and failed helper. Raw outputs, errors and
repository/workspace state must agree; only scope-index row order is compared
semantically, with raw state retained.

The history-query observer records physical protocol requests and receipts
without replacing class methods. Framework read counters are disabled in that
mode; a zero counter is not evidence that Node made no object reads.

Frozen production revision: `43d38a15481e5307ca485b74f9de94ad33e0aa76`.
Native source digest: `0f74993fcae39d2db7e99cbf4f6201d1c4fbde22e471aa5d5ad39f476943c67d`.
GNU helper SHA256: `e9b9c3df298e34785184fd2a0f96bc9f534ae839c94855d490e70676a4cfa248`.
The physically compiled Bit 2.2.93 CLI contains 174 source and 172 compiled
module bindings. Its bootstrap revision is `323f727bc81dd6a61bbf2b279d182bd465532984`.

Both six-Source and 266-Source command fixtures passed all 21 routes in all four
modes, totaling 168 complete-command flows. Healthy native routes required their
actual traversal, analysis or graph receipts, one owned helper and no Source
body protocol input. JSON history display is a parity control with no new query.
Missing/corrupt current Versions fail before acquiring an engine. Missing Source
blame acknowledges Begin and Files, fails Blame, then retires without a Finish,
replacement helper or later operation. Corrupt Source file log preserves the
canonical error after its accepted earlier comparisons. These narrowly checked
prefixes do not relax healthy command gates.

Final proof SHA256 values:

- Six Sources: `42c6ab7d2e610e0b4c0043b412f57b0deb153aff05f5cfcb95d9f5b65faa0770`.
- 266 Sources: `8b130f69a9e8321045315ee110211aef9f815132e807ed6fabd9a12d0ae3d4fa`.

All raw before/after state artifacts and output/error bytes were retained and
hash-verified. Fixture dates and IDs and displayed duration are deterministic;
actual command clocks remain live. Source inventory and byte digests are checked
rather than inferred from the requested fixture size.

Validation passed 309 Rust tests, 550 canonical projections and 256 installed
JavaScript line-diff comparisons, formatting, strict Clippy, Dylint and rustdoc.
The 378-test adapter regression suite passed in source mode (376 passed, two
skipped) and physically compiled mode (377 passed, one Windows ACL skip), plus
69 model tests. The 39 focused cases are included in those totals. Eleven protocol
observer tests and canonical lint also passed. The late filesystem-hook regression
reproduces the old private cleanup bug and verifies the original cleanup function
remains authoritative after a public hook replacement.

The official GNU archive, revision `43d38a15481e`, has SHA256
`87205a1fcb51e9c3d99263e95f81504e3ddafce92787f3aad7874842b4fa008c`.
Its manifest binds the frozen revision, native source and helper above. The
packaged helper passed smoke, 30 runtime/provisioning checks and the 23-case HTTP
adapter corpus. Earlier revision archives and proofs remain separate evidence.

## Complete-command measurements

Four serial runs cover six and 266 actual Sources on tmpfs and Btrfs. The CLI
and its capsules remain on Btrfs. Every run uses the matching production-bound
four-mode proof and rechecks source/helper/compiled bindings, Source inventory,
byte digests and raw output/state artifacts before and after. Tracing is disabled
for measured commands. Each successful route has one warmup pair and three
retained matched Node/native pairs, with alternating order. Four expected-error
routes are compared but not timed.

There are 408 retained command samples, 136 warmups and 672 verified raw state
artifacts. The 68 scenario medians contain 64 native-backed routes and four JSON
presentation controls. Complete-command wall time, descendant CPU and sampled
process-tree peak RSS include startup, callback and canonical cache hydration
costs; fixture setup and state checks are outside the command measurements.

For the 64 native-backed routes, medians of the three matched-round native/Node
ratios range from **1.008876–1.332381 wall time**, **1.000000–1.354839 CPU** and
**1.003344–1.323131 peak RSS**. These measurements show overhead, so rollout
remains opt-in. The four JSON controls have wall ratios **0.955050–0.996969**,
CPU **0.941176–1.031250** and RSS **0.997320–1.002174**; they are not evidence
of a native history speedup.

The separately recorded ratio-of-medians method gives native-backed ranges
**0.996362–1.334121 wall**, **0.969697–1.406250 CPU** and
**1.003344–1.324452 RSS**. This method is not mixed into the matched-pair ranges.

Reproduce acceptance using `runQualification(privateCli, helper, { extraFiles,
report, scratch })` from `scripts/rust-object-import/history-query-qualification.cjs`,
with `extraFiles` zero or 260. Performance uses
`scripts/rust-object-import/history-query-measure.cjs` with `BIT_HISTORY_QUERY_CLI`,
`BIT_HISTORY_QUERY_HELPER`, `BIT_HISTORY_QUERY_PROOF`, `BIT_HISTORY_QUERY_REPORT`,
`BIT_HISTORY_QUERY_EXTRA_FILES` and `BIT_HISTORY_QUERY_SCRATCH`. It requires a
complete matching four-mode proof and rejects binding or raw artifact drift.

Performance report SHA256 values:


- tmpfs-small: `aaea614a32b4e756509489fa03dae7c166cac0154b1630af7ca43db507a6b7a8`.

- tmpfs-large: `bda00ecca830388e2b88d9df4c28d52276ad82d3afdce7ebeafa6fb322d85f45`.

- btrfs-small: `85f76aa03c519b498d6bae199547cbce5ec8dcce6210ba6731f0fa17d07aaa50`.

- btrfs-large: `f2d2a092b886fa6676e814a464a3e338e5f3ddf32f3c7fb5445614c7cfadecdc`.
