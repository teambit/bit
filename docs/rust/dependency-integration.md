# Opt-in dependency extraction integration

This experiment connects the standalone scanner to Bit's existing dependency-tree pipeline. Legacy extraction remains the default. Resolution, traversal filters, pathMap shape, missing/error data, persistent cache storage/invalidation and the component loading concurrency guard remain in the existing TypeScript pipeline.

## Select and observe the backend

Build the scanner with `cargo build --locked --release` in `native/`, then supply an absolute executable path:

```sh
BIT_RUST_DEPENDENCY_SCANNER=/absolute/path/native/target/release/bit-dependency-scanner \
DEBUG=precinct bit status
```

Unsetting the variable restores the default. Relative executable paths are ignored with a `precinct` debug message. The integration does not install or download native artifacts. Use an executable built from the same revision when collecting evidence.

A session is created for each `generateTree` operation (typically one component analysis, not a whole command) and always disposed in `finally`. It prefetches eligible known entries, then only accepted resolved frontier edges after the existing resolver and dependency filter run. Traversal itself remains sequential; visited entries bypass extraction and retain their cached missing/error information. There is no process-global helper or persistent source/AST cache. The coordinator bounds requests, responses and cached records and reports backend unavailability through `unavailableReason`.

Native `ok` records are normalized to dependency source strings by the existing Node `isBuiltin` filter. This does not restore raw import-specifier propagation: precinct already returns strings to dependency-tree. Genuine native parse errors throw and become the existing `PARSING_ERROR` issue. Explicit unsupported syntax, source read/encoding/size limitations, backend load/crash/protocol failures and missing results use legacy extraction and emit fallback details under `DEBUG=precinct`. Source parse errors are not silently retried.

## Initial eligibility and limitations

Batched read-path extraction requires a built-in JS/TS extension, empty supported detector options, and no environment detectors or registered global detector hooks. Eligibility does not call custom `isSupported` predicates during prefetch. Their invocation order and side effects therefore remain on the existing path. Node built-in filtering is done after extraction rather than supplied as native parser options. TSX's generated `jsx:true` option is equivalent to its native extension mode; other parser/classification options retain legacy dispatch.

Registered hooks or environment detectors disable speculative **prefetch**, but do not disable native built-ins. In those contexts precinct reads source normally, handles the leading no-check directive and selects environment/global/built-in detectors in the existing order. A selected custom detector runs unchanged. If no custom detector matches and built-in options are eligible, the session scans that already-read source through an inline request. This avoids calling custom predicates again or rereading a changed file. Inline cache keys include the absolute logical path and a source-content digest and remain separate from read-path prefetch records. JS module classification stays in the Rust engine on the native path; unsupported outcomes resume legacy classification on the same source. Normal hook contexts therefore execute serial native requests at their traversal turn; cross-file batching there is a follow-up. Bit itself always registers the `env.jsonc` detector hook (and the MDX hook when that aspect loads), so in real commands every file currently takes this serial inline path and path prefetch is not used; prefetch only runs in callers without hooks, such as the integration tests.

Arbitrary custom predicate side effects and global hook registration can vary during traversal; eligibility is checked again when consuming a prefetched file. No selected custom detector is substituted, including custom implementations that reuse a built-in function. Backend unavailable/oversized inline requests retain the same legacy source snapshot. The per-component session does not batch across component loads, and this PR does not remove their existing concurrency guard.

All input paths stay in their existing logical form; the coordinator resolves read paths relative to the operation cwd without realpath collapsing. Results are retained only within one operation. This staged extraction may read a file before its traversal turn. Like the legacy traversal, it does not provide an atomic filesystem snapshot; edits during analysis require a new operation. Ineligible/custom detectors run at their original traversal turn. Unsupported native syntax can entail a native read followed by the legacy read.

Full Bit-command gains remain unmeasured. Existing extraction benchmarks do not include this integration, final dependency resolution or persistent-cache hits. Before expanding eligibility or enabling the backend by default, test exact final trees and issues in disposable workspaces using a checkout-matched Bit executable; exercise cache invalidation, hooks, mixed formats/options, filtered frontiers, cancellation, packaging and supported operating systems. Do not clear a user's caches to produce benchmark states.
