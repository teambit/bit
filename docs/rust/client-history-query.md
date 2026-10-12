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

Qualification is in progress. Final source/helper fingerprints, packaged-helper
checks, complete-command results and performance measurements will be recorded
here before this change is submitted for review.
