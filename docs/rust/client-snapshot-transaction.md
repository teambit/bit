# Client snapshot transactions in Rust

With `BIT_RUST_CLIENT_VCS=on`, ordinary client snapshots and tags use one pinned Rust helper for transaction decisions, future versions, auto-tag graph traversal, dependency updates, metadata serialization, and object-store commit receipts. Public hooks, builders, class hydration, workspace links and transport remain Node callbacks at their existing boundaries.

Windows object writes also require the existing `BIT_RUST_OBJECT_IMPORT_WINDOWS_WRITES=on` opt-in. Qualification enables that policy explicitly and restores it after each fixture.

The outer transaction covers initialization, pre-snapshot hooks, version preparation, lane capture, soft tagging or dependency flattening, interleaved object/workspace updates, staged configuration, builds, removal, lane updates, persistence, merge cleanup, links and cache cleanup. The repository transaction runs inside the existing persistence mutex. Public post-persistence callbacks retain their original position after mutex release.

A local cursor records completed public effects before waiting for Rust receipts. A missing helper, rejected response or terminated session resumes the remaining canonical suffix without repeating completed hooks or writes. The same helper owns all snapshot transaction tokens for a command; other client operations may have their own helper owners. Native object writes retain individual receipts. A failed concurrent repository write phase does not promise rollback or a complete ordered ledger of every write already made by the canonical pool.

## Ordinary objects and custom callbacks

Adapters check defining class identities, method descriptors, dependency containers and known framework hooks before invoking private planning. Unsupported custom objects and hooks continue through canonical behavior. Semver grammar comes from the defining Node package; Rust owns the ordinary version decisions. Guards preserve package-local function identities, mutable alias checks and callback order.

Version metadata uses a tagged JavaScript value representation so Rust preserves UTF-16 strings, numeric formatting, property order, undefined omission and JSON escaping. Rust projects the canonical Version, Component, Lane and LaneHistory fields, computes object identity, constructs headers and compresses the body. Before its first private await, the adapter captures immutable metadata, Source bytes and headers, and the ordinary validation flag and function. Fallback retains those captures while preserving the canonical destination reference lookup after compression. Mutation regressions cover both the first asynchronous boundary and an accepted native serialization response. This means ordinary metadata projection still has Node preparation work; serialization and compression are native.

Workspace file Sources carry a guarded disk descriptor through ordinary clones. Rust checks the raw file fingerprint before normalization, then constructs the canonical Source header and body. Existing repository Sources are read only when the object actually exists on disk. Newly generated Sources without disk provenance use bounded inline bytes; reports distinguish those bytes from workspace file bytes. Source header length follows Node's decoded UTF-16 length, including invalid UTF-8 replacement behavior.

Ordinary buffered build artifacts retain their capsule disk path through Vinyl cloning and Source creation. Their LF normalization preserves a BOM, matching canonical artifact behavior. Workspace Sources retain their own BOM stripping rule. Custom Vinyl accessors, streams, stat objects and unsupported clone shapes keep the canonical path; local builders and their callbacks remain Node operations.

Private transport uses the defining JSON serializer and declines patched serializers or inherited `toJSON` callbacks before encoding a frame. Unsupported inputs, stale aliases and helper failures preserve canonical execution; the implementation remains opt-in.

## Frozen qualification

- Production checkout: `d8d7ca8669c9fe210eefb4304955e9791f045d6d`.
- Native source digest: `e5c8f40373d56d5aebc8d41ca8eb85af99e26ecd223fab4cd71c063c1b8ac5de`.
- Official GNU release helper SHA-256: `72e4894447e409d9aa7fcdb37f0df0344e4acab5071ea438dba6443b6878bf03`.
- Correctness report SHA-256: `d3351ff1c62ec5be8ca89feb3f8bb898c46d1362afac3163f8a804eb53f17751`.

The private CLI binds 140 production source files and 138 compiled outputs to the production checkout. Rust qualification contains 260 passing tests, including actual Node model differentials, plus strict formatting, Clippy, Dylint and rustdoc. Focused source and compiled snapshot suites each pass 27 tests; canonical TypeScript and lint checks pass. Broader adapter regression runs, including shared operation/platform tests, pass 265 source tests with two skips and 266 compiled tests with one Windows-only skip. The additional source skip covers mixed source/installed constructor registration; the compiled public operation proves that lifecycle. Canonical model tests pass 69, and packaging/provision/discovery tests pass 30. CI runs actual model differentials and both adapter modes on Linux, macOS and Windows.

Four actual disposable workspaces exercise Node, native, missing-helper and crashed-helper behavior. Eight saved stages cover initial soft tag and persistence, dependent auto-tag and persistence, lane auto-snap, detached snap, a real successful local build, and the partial state after a deliberate compiler failure. Object IDs, inflated headers and bodies, working files, bitmap/config, staged/unmerged state, histories and status match. Only component/lane index row insertion order is sorted for comparison; every field and duplicate row is retained, alongside original index bytes. Qualification fixes log clocks and narrowly seeds snapshot/lane UUIDs to compare stored objects reproducibly. Failed-build command output is retained separately without claiming byte-identical workspace paths.

Native accepts eight outer transaction begins and 104 receipts, five repository begins and 40 receipts, eight future-version plans, five auto-tag plans, 15 dependency updates, 55 serializations and 55 object commits, with zero failed acknowledgments. The 36 Sources include 27 disk descriptors, of which 11 are built artifacts, four repository Sources and five generated Sources carrying 752 compatibility bytes. The successful built tag alone commits 19 objects and reads all 11 artifact Sources directly from capsule disk provenance. All snapshot token operations for each command use one pinned helper; other helper owners are reported separately. The standalone `snapshotVersionIdentity` kernel is not called by this qualification; identity is exercised through native serialization.

## Whole-command measurements

Four retained reports cover 4 and 264 workspace files on tmpfs and Btrfs, with three alternating Node/Rust pairs after an excluded warmup pair per report. The 32 workspace flows include 168 timed commands and 56 excluded warmup command measurements. Successful soft tags, persistence, lane auto-snap, detached snap and a real local build are timed; the deliberate compiler failure is checked but untimed. Diagnostics are disabled during measurements. Each flow still compares all eight saved states, then stores their comparison hashes.

Each cell below is the median of all three measured rounds, shown as Node / Rust. CPU includes child processes through `/usr/bin/time`; RSS is the peak simultaneous process-tree sum sampled every 10 ms, including helpers, Git and compiler children. Sampled RSS can miss brief peaks. These Linux measurements do not predict other machines or platforms.

| Filesystem | Files | Command | Wall ms (Node / Rust) | CPU s (Node / Rust) | Peak RSS MiB (Node / Rust) | Rust / Node wall |
| --- | ---: | --- | ---: | ---: | ---: | ---: |
| tmpfs | 4 | Initial soft tag | 296.0 / 302.7 | 0.39 / 0.40 | 151.9 / 160.6 | 1.023 |
| tmpfs | 4 | Persist initial tag | 423.6 / 458.4 | 0.58 / 0.62 | 238.7 / 256.2 | 1.082 |
| tmpfs | 4 | Auto-tag soft tag | 312.5 / 316.0 | 0.40 / 0.42 | 156.4 / 168.7 | 1.011 |
| tmpfs | 4 | Persist auto-tag | 436.4 / 464.0 | 0.59 / 0.63 | 237.1 / 264.1 | 1.063 |
| tmpfs | 4 | Lane auto-snap | 441.1 / 462.6 | 0.60 / 0.62 | 237.3 / 264.3 | 1.049 |
| tmpfs | 4 | Detached snap | 426.0 / 453.6 | 0.56 / 0.61 | 236.8 / 244.8 | 1.065 |
| tmpfs | 4 | Tag with local build | 2065.5 / 2078.3 | 2.17 / 2.20 | 885.2 / 907.1 | 1.006 |
| tmpfs | 264 | Initial soft tag | 376.3 / 383.8 | 0.46 / 0.50 | 177.8 / 217.2 | 1.020 |
| tmpfs | 264 | Persist initial tag | 583.1 / 705.9 | 0.79 / 0.96 | 327.5 / 343.6 | 1.211 |
| tmpfs | 264 | Auto-tag soft tag | 395.2 / 414.9 | 0.53 / 0.54 | 194.6 / 224.3 | 1.050 |
| tmpfs | 264 | Persist auto-tag | 592.7 / 729.9 | 0.87 / 1.08 | 341.3 / 354.8 | 1.232 |
| tmpfs | 264 | Lane auto-snap | 610.4 / 772.6 | 0.91 / 1.12 | 345.6 / 370.5 | 1.266 |
| tmpfs | 264 | Detached snap | 594.7 / 676.2 | 0.89 / 0.97 | 334.4 / 346.8 | 1.137 |
| tmpfs | 264 | Tag with local build | 2296.7 / 2501.2 | 2.48 / 2.72 | 899.5 / 944.7 | 1.089 |
| btrfs | 4 | Initial soft tag | 291.1 / 303.9 | 0.37 / 0.38 | 150.0 / 158.8 | 1.044 |
| btrfs | 4 | Persist initial tag | 447.5 / 485.2 | 0.59 / 0.64 | 237.9 / 256.9 | 1.084 |
| btrfs | 4 | Auto-tag soft tag | 306.1 / 321.7 | 0.39 / 0.41 | 156.9 / 167.9 | 1.051 |
| btrfs | 4 | Persist auto-tag | 451.9 / 479.3 | 0.60 / 0.64 | 237.4 / 268.1 | 1.061 |
| btrfs | 4 | Lane auto-snap | 459.1 / 486.0 | 0.58 / 0.65 | 241.4 / 268.7 | 1.059 |
| btrfs | 4 | Detached snap | 438.1 / 449.8 | 0.56 / 0.58 | 236.7 / 246.5 | 1.027 |
| btrfs | 4 | Tag with local build | 2195.5 / 2184.6 | 2.21 / 2.30 | 952.8 / 972.6 | 0.995 |
| btrfs | 264 | Initial soft tag | 364.0 / 379.5 | 0.48 / 0.49 | 182.9 / 212.0 | 1.043 |
| btrfs | 264 | Persist initial tag | 602.1 / 719.0 | 0.87 / 0.99 | 329.7 / 336.2 | 1.194 |
| btrfs | 264 | Auto-tag soft tag | 389.8 / 403.6 | 0.50 / 0.54 | 199.7 / 228.5 | 1.035 |
| btrfs | 264 | Persist auto-tag | 614.3 / 765.4 | 0.91 / 1.09 | 334.3 / 351.6 | 1.246 |
| btrfs | 264 | Lane auto-snap | 628.0 / 780.3 | 0.93 / 1.10 | 327.2 / 373.2 | 1.243 |
| btrfs | 264 | Detached snap | 605.9 / 720.8 | 0.88 / 1.03 | 330.9 / 352.2 | 1.190 |
| btrfs | 264 | Tag with local build | 2418.8 / 2588.9 | 2.61 / 2.86 | 973.1 / 1023.9 | 1.070 |

Across these command medians, Rust / Node ratios are 0.995–1.266 for wall time, 1.014–1.241 for CPU and 1.020–1.221 for sampled peak RSS. There is no consistent speedup; rollout remains opt-in. Native ownership currently retains canonical metadata preparation and immutable fallback captures in Node.

Report SHA-256 fingerprints:

- `snapshot-perf-tmpfs-small.json`: `40c6518f25c0a3a4bf99784ae8665e8f8ba307dd4fce11119de6602382263172`.
- `snapshot-perf-tmpfs-large.json`: `3ae0d92a4be4f5f68cc53e51a88bb3e49bf7723f82763c4cd3315d81dec18c5d`.
- `snapshot-perf-btrfs-small.json`: `2d8c9938a6ead2de7b39b7ffefa9b987b7f5c94f18c73ebf03d90538bcc79e3d`.
- `snapshot-perf-btrfs-large.json`: `d5e75e1b0ef50f1920bbb426373a394638f905a377f2a0a2b539ef06a4695071`.

Reproduce from the qualified production checkout with a physically compiled CLI prepared by `scripts/rust-object-import/prepare-cli.cjs`. Run `snapshot-transaction-qualification.cjs CLI HELPER` with `BIT_SNAPSHOT_TRANSACTION_REPORT` for the four-mode correctness report. Run `snapshot-transaction-measure.cjs CLI HELPER REPORT` sequentially for each filesystem and size, setting `BIT_SNAPSHOT_TRANSACTION_SCRATCH`, `BIT_SNAPSHOT_TRANSACTION_EXTRA_FILES=0` or `130` per component, and `BIT_SNAPSHOT_TRANSACTION_ROUNDS=3`. Set `TMPDIR` to the persistent staging directory. Source files, compiled modules, qualification harness and helper fingerprints are checked before and after every flow. Older reports preceding the Source capture fix are retained as exploratory evidence and excluded from this table.
