# Client workspace inspection in Rust

`BIT_RUST_CLIENT_VCS=on` enables the native inspection engine. It remains opt-in. Node owns workspace discovery, component loading, extension callbacks, issue reporting, lane presentation and public output formatting. Rust owns captured tracked-file comparisons, default Version semantic comparison and verified file diff planning. This does not retire every TypeScript client VCS path.

## Operation ownership

Inspection operations use one pinned helper lease and bounded native snapshots. `inspectionBegin` reads tracked files, strips the canonical BOM and normalizes versioned root `.bitmap` content. Rust retains pre-LF bytes and Linux-EOL identities. Private compatibility capsules support an interrupted helper without rereading workspace files after a public model callback. They are removed when the awaited operation ends; public `CompFiles` getters keep their eager behavior.

Mini-status and file status summaries preserve the existing order: load every component, capture comparison metadata synchronously, then compare. A later model-loading callback can still mutate an earlier component's model references. Unknown getters and replaced methods follow the canonical continuation. A helper failure after this comparison boundary uses frozen default metadata rather than replaying public callbacks.

Parallel default component loading returns freshly loaded components in request order, while callbacks and cache writes retain their existing completion order. This removes the pre-existing completion-order race in public diff output.

Full status preserves component-to-Version conversion callbacks. The native default comparison captures semantic fields after conversion, aligns dependency versions and file metadata, orders files and dependencies, and computes semantic identities. Node checks mutation selectors and applies them to the original object aliases. Source-code-only comparison preserves its separate JSON row semantics. Custom methods and unsupported metadata fall back to the canonical path.

File diff reuses verified workspace and repository provenance. Its native capture verifies both the raw disk identity and the caller's pre-LF byte identity before writing private capsules. A changed disk revision declines this path. Rust reads verified stored Sources and runs Git over retained bytes; public file content remains part of the diff result. Existing component loading may still hydrate file bodies, so this path does not claim that complete diff commands avoid Node file body reads.

## Native inventory and embedded captures

The embedded addon retains immutable inspection bytes in Rust. A read handle can outlive its engine and returns independent Buffer copies for canonical continuation; it releases its budget when the final handle closes. Embedded mini-status no longer writes temporary Source capsules. The standalone helper retains the existing capsule transport.

Workspace inventory uses `inventoryBegin` and `inventoryFinish` on one owner. Rust scans and retains candidates, reads nested ignore files on the shared worker pool, evaluates configured policies, rebases component paths and builds the sorted manifest. The reply includes the final manifest and root ignore-cache additions needed to preserve the existing object; it does not expose intermediate filtered lists. Filtering uses ordered 64-file batches above 128 candidates. The adapter supplies the installed ignore compiler's expressions and checks custom hooks and mutations before applying root-cache additions. Failed or cancelled operations publish no manifest.

An owner permits at most 32 pending inventories, 4096 retained candidate paths and 8 MiB of candidate path bytes. Parent-policy evaluation additionally bounds depth to 128 and aggregate cache prefixes to 65,536 entries and 8 MiB. Nested ignore files are limited to 64 KiB each and 1 MiB of total pattern text. Unsupported limits, custom ignore implementations and Unicode paths/expressions use canonical filtering. The Unicode fallback preserves V8 legacy case folding, which the pinned native regex engine does not fully reproduce. Native inventory is a migration boundary; it does not itself establish a whole-command speedup.

## Compatibility and limits

Native inspection snapshots are bounded to 4096 files and 32 MiB per helper owner. Unsupported shapes and budgets decline to canonical behavior. Root bitmap normalization shares the existing JSONC parser subset and JavaScript property ordering and number formatting. The Node path remains available for other JSONC grammar and custom behavior.

Missing or crashed helpers preserve public results and errors. Inspection tokens cannot escape their operation or be reused after finish. Private capsules are compatibility state, not workspace or repository writes.

## Validation

The frozen production source is `01b5ffaf080e337d841bc9dbe53e801d5058d9f1`. Its private CLI contains 147 recorded source files and 145 physically compiled modules across 31 canonical components. The native source digest is `ef14105d9b52585898d5120c49e828b90ab2263e1ed72debf930ec56ec57172d`; the Linux GNU helper SHA-256 is `a0c8b503329386b81b75452c588e939e250f91b305a376214a2ec3f1dc7d8c2a`.

Qualification passed 269 Rust tests (239 object-import, 24 scanner and six actual Node differentials), 14 source and 14 compiled adapter tests, 69 canonical model tests, and packaged helper smoke plus 30 artifact/discovery and 11 HTTP/runtime tests without skips. The wider adapter suite passed 486 source tests with 15 intentional skips and 487 compiled tests with 14 intentional skips; its source and compiled packaged subsets then passed 23 tests each without skips. The final command-owner wrapper also passed the 14 focused tests in each adapter mode.

Two final real-workspace proofs, with four and 264 tracked Sources respectively, run Node, native, missing-helper and crashed-helper modes through clean, EOL, metadata-only, content, inventory and missing-main phases. It compares exact stdout/stderr and before/after state, sorting only component/lane index row insertion order while retaining raw evidence. The small report SHA-256 is `427b67214417802d55a8612f376f08b0dad4d030ac5b3dded8638213ec133790`; the large report is `f48ad0fdf9884e1376fb3438710ee47aeca0a572f740a482874b19d2ec9fe399`. All 18 native commands in each report use one inspection owner each. Begin/Files/Compare/Diff/Finish completed 18/12/22/6/18 requests, with zero failures. All six mini-status phases read zero Source/spool bytes in the main Node process and send zero Source RPC bytes. In the small proof, full status framework loading reads 503–799 Source bytes; public diff loading reads 357. These are reported adapter boundaries, not eliminated reads.

The earlier proof at `65c6e383` is archived separately because its diff commands used multiple inspection owners. The proof and partial measurements at `5e917165` are also archived separately because the larger workload exposed the pre-existing component result ordering race. Neither is relabeled as evidence for the final production source.

The whole-command measurements use two components with four or 264 tracked Sources on tmpfs and Btrfs, three alternating Node/native pairs after one warmup per mode, diagnostics disabled, child-inclusive CPU and 10 ms sampled process-tree peak RSS. Each flow measures mini-status, full status and diff in five successful phases; missing-main error commands and setup remain untimed. Output and repository state are compared before reducing retained reports to stage hashes. The four reports contain 360 timed commands and 120 excluded warmup measurements. Results and report fingerprints are recorded in [PR #84](https://github.com/zkochan/bit/pull/84). Rollout remains opt-in; these measurements do not establish a general speedup.
