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

Merge Source receipts reuse retained raw spools when their hashes match. Base
Sources without an existing spool get a raw receipt. Node hydrates the default
Source class from these bytes and checks their length and identity; it retains
compressed and inflated sizes for the original repository cache accounting.
Legacy compressed history-query receipts remain supported. The helper bounds
both compressed receipt input and retained raw receipt bodies to 32 MiB.

Compatibility checks compare captured descriptors directly without rebuilding
intermediate descriptor maps. Buffer alias validation checks the intrinsic
TypedArray length and own-key count: every Buffer byte has a non-deletable own
index, so extra string or symbol properties increase that count. This preserves
extra-property rejection without running a regular expression for every byte.

The workspace helper uses its CPU-aware default pool, capped at four workers.
Checkout Source batches of at least 32 files read and verify one worker-sized
chunk at a time. Each worker receives a share of the remaining compressed and
inflated byte budgets. A Source exceeding that conservative share retries the
read-only batch with the original serial budget. Indexed collection preserves
file order; workspace writes and their failure prefixes remain serial. On Unix,
normalization returns bytes without allocation when no carriage return exists.

Single-Source authority checks use guarded direct pending, strong and weak cache
lookups. Strong lookup inspects the dependency's explicit LRU introspection API
without changing recency; unknown API replacements, TTL tracking, background
fetch promises and accessor-backed selected entries decline. Weak lookup retains
the actual surviving alias without promoting it. Full graph projections still
capture all entries because they need that complete view.

The helper response reader grows a bounded buffer geometrically and scans only
the newly received bytes for the terminator. It preserves response limits,
complete-frame validation and rejection of trailing data while avoiding repeated
copies of every previously received chunk.

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

Read-only checkout preflight can be compared separately with:

```sh
node scripts/rust-object-import/checkout-preflight-benchmark.cjs /absolute/baseline-helper /absolute/candidate-helper
```

This keeps both helpers alive with their default worker counts, alternates their
request order, warms each size twice and retains seven pairs. Each batch contains
64 Sources of 1 KiB, 64 KiB or 512 KiB. Reports include helper hashes and raw
request times. Fixture setup, cleanup, Node compatibility work and workspace
writes are outside the timer. This benchmark cannot establish a Node/native
whole-command speed advantage.

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

Workspace reads use the same bounded worker pool for batches of at least 32 files. Each
worker receives a share of the remaining 8 MiB raw-byte budget; a read-only serial
retry preserves support for a single file larger than that share. Results preserve
input order and never publish a partial batch. File metadata sizes reserve bounded
read buffers, and ordinary LF files reuse their raw hash for snapshot/Linux identity.
The `workspace-read-benchmark.cjs <baseline-helper> <candidate-helper>` microbenchmark
includes response transfer and verifies every returned body and hash; it does not
replace paired whole-command measurements.

Owned merge preparation requests packed body snapshots. Each immutable pack contains
bounded raw bodies with explicit offsets, lengths and SHA-1 identities. Later
retargeting creates a new pack and leaves earlier files and descriptors unchanged;
exclusive creation still rejects collisions. Unpacked callers keep the original
per-body format, and older helpers decline the optional request through the existing
continuation. Source hydration and lazy compatibility getters read only the selected
range, reject truncation and verify its hash. Each public read gets an independent
Buffer while existing clone aliases remain shared. Native materialization continues
to use retained Rust bytes, and escaped getters become eager before pack cleanup.
