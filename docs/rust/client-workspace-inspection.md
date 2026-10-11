# Client workspace inspection in Rust

`BIT_RUST_CLIENT_VCS=on` enables the native inspection engine. It remains opt-in. Node owns workspace discovery, component loading, extension callbacks, issue reporting, lane presentation and public output formatting. Rust owns captured tracked-file comparisons, default Version semantic comparison and verified file diff planning. This does not retire every TypeScript client VCS path.

## Operation ownership

Inspection operations use one pinned helper lease and bounded native snapshots. `inspectionBegin` reads tracked files, strips the canonical BOM and normalizes versioned root `.bitmap` content. Rust retains pre-LF bytes and Linux-EOL identities. Private compatibility capsules support an interrupted helper without rereading workspace files after a public model callback. They are removed when the awaited operation ends; public `CompFiles` getters keep their eager behavior.

Mini-status and file status summaries preserve the existing order: load every component, capture comparison metadata synchronously, then compare. A later model-loading callback can still mutate an earlier component's model references. Unknown getters and replaced methods follow the canonical continuation. A helper failure after this comparison boundary uses frozen default metadata rather than replaying public callbacks.

Full status preserves component-to-Version conversion callbacks. The native default comparison captures semantic fields after conversion, aligns dependency versions and file metadata, orders files and dependencies, and computes semantic identities. Node checks mutation selectors and applies them to the original object aliases. Source-code-only comparison preserves its separate JSON row semantics. Custom methods and unsupported metadata fall back to the canonical path.

File diff reuses verified workspace and repository provenance. Its native capture verifies both the raw disk identity and the caller's pre-LF byte identity before writing private capsules. A changed disk revision declines this path. Rust reads verified stored Sources and runs Git over retained bytes; public file content remains part of the diff result. Existing component loading may still hydrate file bodies, so this path does not claim that complete diff commands avoid Node file body reads.

## Compatibility and limits

Native inspection snapshots are bounded to 4096 files and 32 MiB per helper owner. Unsupported shapes and budgets decline to canonical behavior. Root bitmap normalization shares the existing JSONC parser subset and JavaScript property ordering and number formatting. The Node path remains available for other JSONC grammar and custom behavior.

Missing or crashed helpers preserve public results and errors. Inspection tokens cannot escape their operation or be reused after finish. Private capsules are compatibility state, not workspace or repository writes.

## Validation

Qualification results and measurements will be recorded here after the integrated production source, compiled CLI and release helper are frozen together. Exploratory runs are not production parity evidence.
