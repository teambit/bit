# Native merge preparation performance

The native merge path remains opt-in (`BIT_RUST_CLIENT_VCS=on`). A faster
preparation request does not establish a faster complete Bit command.

Preparation borrows the Source bodies and normalized workspace snapshots
already verified by checkout. It retains manifest checks, Source hash checks,
workspace snapshot checks, duplicate-path checks and aggregate byte limits.
The three-way classifier uses path indexes and a reusable four-worker Rayon
pool; zero- and one-file batches execute directly. Protocol requests and public
mutation/callback boundaries retain their ordering.

Updated, added and deleted-conflict rows refer to the existing retained target
body. They do not serialize that body as hexadecimal or create another spool.
Git output and conflict bodies receive separate retained entries. The standalone
merge-history protocol still returns its existing wire representation.

Buffer alias validation enumerates own keys directly. It rejects the same extra
properties without allocating a property descriptor for every byte; alias identity
and content hashes remain checked.

## Reproduction

Build the release helper from `native/`, then run:

```sh
node scripts/rust-object-import/merge-prepare-benchmark.cjs /absolute/path/to/bit-object-import
```

The benchmark generates disposable repositories and workspace files, keeps one
helper alive, warms each size once and retains seven preparation samples. It
checks ordered update rows and hashes each selected output spool outside the
timed interval. The report records the helper SHA-256 and verified Source-read
counts. Its 6-, 266- and 1,000-file workloads contain about 1 KiB per Source.
They exercise clean incoming changes, not expensive Git conflict resolution.
Fixture creation, output verification and cleanup are excluded. Filesystem caches
are warm; use `TMPDIR` to choose storage.

Complete-command qualification and measurement use
`merge-transaction-qualification.cjs` and `merge-transaction-measure.cjs`.
These include CLI startup, adapters, helper work, Git, public effects and cleanup.
They require a matching four-mode correctness proof before retaining timings.

## Remaining costs

The Node adapter still observes and normalizes current buffers, takes freshness
snapshots, hydrates public Source instances and preserves callback behavior.
Preparation reads are serial, and component requests share a serialized protocol
session. Removing those costs requires a wider ownership boundary; increasing
worker count alone does not remove them. This change does not parallelize
filesystem mutations or alter fallback behavior.
