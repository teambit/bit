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
Checkout Source requests of at least 32 files use one indexed parallel queue.
Workers reserve bytes from shared request budgets before allocating compressed
buffers or retaining inflated bodies. A large file can use the available request
allowance without forcing other workers to wait at a fixed chunk boundary. Failed
reads retry the complete read-only request with the original serial budget.
Indexed collection preserves file order; workspace writes and their failure prefixes remain serial. On Unix,
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

## In-process workspace engine

New object-import archives also contain `bit-workspace.node`, a Node-API 8
binding to the same Rust workspace and object-operation handlers. Discovery checks
the companion's checksum, size, target and libc requirement beside the selected
helper. Older archives and unavailable or incompatible companions retain the child
transport. The archive smoke test runs both transports and checks identical binary
workspace responses, retained read tokens and object decisions. The addon runs in
a separate smoke process so Windows can release its library mapping before cleanup.

Each owner has one active request. Inputs are copied before returning to JavaScript;
outputs own their bytes. Requests dispatch directly to shared Rayon workers instead
of occupying libuv workers. Pools initialize after loading the library, avoiding the
dynamic linker lock during module initialization. Retirement waits for outstanding
native work before exposing the canonical fallback.

With `BIT_RUST_CLIENT_VCS=on`, Source validation, mutable-object writes and
interactive tar imports also use the verified addon when available. Each stream
owns a dedicated protocol thread, with at most sixteen streams in process. Waiting
for a JavaScript selection or progressive archive input therefore never occupies a
Rayon worker needed by another native operation. Compression, validation and file
work continue to share the configured Rayon pools.

The stream reuses the standalone protocol handlers, including their validation,
selection and commit barriers. Acknowledged input drives Writable backpressure:
at most one input chunk is queued beside the current chunk, and each chunk is
bounded to the existing 128 MiB batch budget plus framing. Output queues hold at
most one callback and individual responses are bounded. Closing interrupts input
waits; the close notification follows completion and cleanup of all native work,
so fallback cannot race an in-flight rename. Unsupported companions and custom
helper arguments retain the child transport before any input is sent. Qualification
records the actual import transport and rejects child imports in addon proofs.

Owned workspace read receipts retain bounded snapshots in Rust. A later prepare can
reuse only a receipt from the same owner with matching path and identity; ordinary
new reads still observe the filesystem. Public clones share private verification
bytes while preserving their mutable public Buffer aliases. Base Source bodies are
loaded only for actual three-way modified rows, after verifying the complete Version
manifest. A representative 266-file merge needs 266 verified Source reads instead of
530; this work-count reduction alone does not establish a whole-command speedup.

Logical capsule loads keep independent Source instances and Buffers for concurrent
cache misses. Groups of at least eight can share their synchronous eligibility
checks. Every asynchronous continuation still checks the current repository and
constructors; accessors, thenable cache entries and replaced enqueue intrinsics
fall back to the individual loader.

Complete command timings must still pass the four-mode qualification corpus and
bind the CLI, Rust source, helper and selected addon fingerprints. Diagnostic traces
can observe an automatically discovered companion without forcing the runtime to
select it. The production opt-in remains `BIT_RUST_CLIENT_VCS=on`.

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
Owned preparation reads run in Rust, while component requests still share a
serialized protocol session. Removing those costs requires a wider ownership boundary; increasing
worker count alone does not remove them. This change does not parallelize
filesystem mutations or alter fallback behavior.

Workspace reads use the same bounded worker pool for requests of at least 32 files.
Workers draw from the complete request and reserve from one 8 MiB raw-byte budget.
Results preserve input order and never publish a partial request. File metadata
sizes reserve buffers before allocation; growth or shrinkage retries the complete
read-only request using the original serial reader. This avoids per-worker byte
shares that unnecessarily retried skewed file sizes, and ordinary LF files reuse their raw hash for snapshot/Linux identity.
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

Owned merge preparation and retargeting dispatch their heavy work onto the helper's
existing configured Rayon pool. Source reads share separate request budgets for
compressed and raw bytes, commit receipts in input order, and retry an unsupported
read-only request with the full remaining serial budget. Current-file reads also
reserve from one request budget before allocation. Failed worker
reads do not publish duplicate Source receipts. Merge classification reuses this
pool, including the caller's one-thread setting, instead of creating another pool.
Each worker reuses its zlib decoder and 64 KiB scratch buffer, resetting before every
object, including after errors. The preparation microbenchmark accepts `--packed`
to include packed private snapshots while verifying every selected body.

Retargeting also reuses operation-owned bodies when every target Source hash is
already retained. It still verifies the complete Version manifest and preserves
the existing byte budget. Public target cloning and the Node alias/hash guards
remain the authority for live cached Sources; unretained bodies follow the normal
read path. This avoids reading and decompressing those same objects a third time.

Buffer alias validation checks behavior-affecting property names rather than
enumerating every byte index. It rejects own Buffer/typed-array method and field
shadows, symbols, and thenable/legacy buffer hooks without invoking getters. Plain
extra metadata stays on the exact original alias. Prototype descriptors are checked
once per synchronous validation batch. Private comparison snapshots use captured
typed-array length/set operations, so copying does not invoke public Buffer hooks.
Byte hashes, lengths, alias identity and later mutation checks remain required.

Synchronous class-guard batches validate shared constructor/prototype descriptors
once and check every instance's own fields separately. Merge Source freshness,
retained apply clones and captured Version references use these batches. No result
is cached across calls or asynchronous boundaries; proxies, sparse arrays and
accessor entries decline without running traps or getters. Captured reference
identities remain protected by the existing row/array descriptor snapshots.

Workspace read requests can opt into a raw response: one JSON metadata header
followed by an exact bounded byte payload. Native code retains the parallel read
budgets and prepares the complete header/payload before writing a receipt. Node
validates the declared size, ordered contiguous ranges and metadata before exposing
independent Buffers. Arbitrary newlines and invalid UTF-8 bytes are payload data;
truncated, surplus or oversized responses cannot acknowledge a prefix. Existing
hex/JSON callers retain their format. Qualification tracing skips the exact raw
payload length before parsing the next response.

Projected model strings and property names use ordinary JSON strings when their
UTF-16 is well formed. Lone surrogates retain the original numeric code-unit wire
format. Rust accepts both encodings into the same UTF-16 representation and keeps
its legacy response representation, canonical JSON ordering, escaping, number
bits and hashes. Projection budgets remain unchanged. Inspection Ref guards are
batched only over pure descriptor reads, retaining checks of every own property.

Owned merge apply requests acknowledge the exact retained body prefix. Retargeting
rejects stale counts before loading or writing anything, then returns only newly
retained descriptors and the total count. Existing body descriptors remain guarded
by the original plan's freshness checks. Legacy callers still receive the complete
manifest; compact callers validate every new index and every selected old/new body.

Configuration compatibility guards retain registered property names and descriptors,
then inspect each live descriptor directly. This avoids rebuilding descriptor maps
and scanning the class registry for every aspect while still checking method
replacements, accessors, extra properties and instance overrides on every call.
Only registration metadata is retained; eligibility is never cached across hooks
or asynchronous work.

Metadata validation and snapshot projection inspect own property descriptors directly instead of allocating a descriptor-map object at every nested value. All accessor, symbol, JSON-hook, cycle and resource-limit checks remain; projections reject proxies before invoking traps. Local synthetic microbenchmarks showed lower traversal costs, but this is diagnostic evidence only and does not replace complete-command timings.

Snapshot preparation validates source bodies and identities in input order, within the existing 32 MiB raw budget, then compresses independent objects on the shared Rayon pool. Transactions below 64 KiB or containing only one object compress serially. Indexed results preserve manifest order and the compressed budget; spooling and commit receipts remain ordered. Preparation can temporarily retain up to 32 MiB of raw bodies alongside compressed output. Tests compare compressed bytes and ordering with one, two and four workers. A local 4 MiB phase diagnostic showed lower compression time, but full-command performance remains the acceptance criterion.

Status/diff qualification observes the automatically discovered addon without wrapping public class methods, and records its digest alongside the helper and CLI fingerprints. Linux filesystem diagnostics distinguish the shared Rust workers (`bit-vcs-0` through `bit-vcs-7`) from JavaScript and libuv threads using successful thread-name syscalls. Native source reads are reported separately; mini-status still requires zero source/spool reads by JavaScript or libuv. Unnamed threads and reads before a thread is named remain charged to Node. The external observer retains its synchronous, asynchronous and child-process controls.

Inspection captures reuse raw digests when BOM/bitmap conversion leaves bytes untouched, retain snapshot digests, and reuse them for unchanged Linux line endings. Captures of eight or more files use the shared Rayon pool and one atomic request allowance for raw/normalized bytes. File reads reserve before allocation, and normalization growth reserves additional bytes. Failed parallel reads retry serially before publishing a plan or writing a snapshot. Results stay in input order. Both inspection and snapshot compression enter the configured pool in child-helper mode as well as the addon. A 256-file local diagnostic compared original, updated serial and updated parallel captures with identical hashes and ordering; it is separate from whole-command acceptance.

Checkout, inspection, source snapshot and raw object readers reserve the file size already checked against their byte budget before reading. Header reads reserve only the bounded header prefix. The read limit and post-read size/hash checks still detect growth and changed contents. A Linux syscall diagnostic over 256 files accounted for the same 7,901,184 source bytes before and after preallocation, with 2,816 versus 512 nonempty reads. These counters describe I/O work, not a complete-command speedup. The observer handles interrupted reads as well as interrupted thread-name syscalls.

Diff captures bound to the caller’s raw and canonical snapshot hashes retain their bytes in memory without writing Source spools: the caller already owns the canonical fallback bytes. Where an existing operation owns a read, capture can also reuse that read’s token after checking its path and hashes. Other captures still read and validate the filesystem, and independent inspection captures retain their spool contract. Full status and diff do not create an additional ownership scope just to retain reads. The raw-byte budget includes stripped BOM bytes, and a retained body is never stripped a second time. Qualification requires real diff commands to accept captures with zero Source spools.

Diff execution also uses the operation’s configured Rayon pool rather than creating a pool per comparison. At most four workers draw files from a shared work queue and can spawn Git children, including when the pool has more workers; results retain their input order. Identical optional byte inputs skip normalization and SHA work while absent-versus-empty and EOL/binary semantics remain unchanged. All-equal batches create no Git temporary directory. Model Source reads use one indexed parallel queue with shared, independent raw/compressed allowances and read-only serial retry; output and verified read receipts retain model order.

Semantic inspection capture hydrates only the configuration and package maps required to validate native mutations. File and dependency rows retain their compact wire representation and original aliases. Dense-array and selected file/Version metadata checks inspect descriptors directly; cross-model alias checks use a set instead of pairwise scans. Post-request capture still validates hashes, values and container identities before applying a native plan. Local capture-only timings are diagnostic; whole-command performance must still be established by the hosted paired corpus.

Diff projection indexes ordinary SourceFile paths once, retaining the first file for duplicate paths and original output order. Defining class/path/array methods and descriptor-only path metadata must remain ordinary; custom path readers use the existing lookup sequence. The full request still revalidates file arrays, descriptors and relative paths after native work. This removes repeated path searches before the native diff without caching public metadata across operations.

Ordinary model-to-SourceFile loads now own a native Source-read batch for that conversion. The existing binary body reader hydrates canonical Source cache entries and returns eager file buffers, avoiding a native preflight followed by synchronous JavaScript reads of the same objects. Ownership ends before returning from the load; full status/diff still keeps independent component operations. Existing merge/history owners are reused, and guarded or failed reads keep canonical fallback.
