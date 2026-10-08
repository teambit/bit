# Parser and transport decision

The backend uses Oxc 0.153.0 (MIT) and a persistent, bounded NDJSON helper. ASTs stay in Rust and are dropped after extraction. The legacy detector remains authoritative for unsupported syntax/options and extension hooks. Default selection stays legacy; `packaged`, an absolute helper path, and `off` provide explicit selection and rollback.

## Candidate evaluation

The legacy Babel/node-source-walk and TypeScript-ESTree detectives define compatibility, including behavior that differs from language specifications. Oxc and SWC both provide maintained Rust JavaScript/TypeScript parsers. Oxc supplies arena allocation and visitors suitable for extracting compact records without returning an AST to Node. SWC is Apache-2.0; its parser supports JavaScript, TypeScript, JSX and configurable decorators. Official references: [Oxc parser](https://oxc.rs/docs/guide/usage/parser.html), [Oxc source and license](https://github.com/oxc-project/oxc), [SWC parser options](https://swc.rs/docs/configuration/compilation), [SWC license](https://github.com/swc-project/swc/blob/main/LICENSE).

`parser-candidates.cjs` uses `@swc/core` 1.16.13 for the alternate syntax screen and screens both native candidates against the existing fixture corpus and tracked dependency/workspace sources. Oxc's column is the actual extractor result, including explicit compatibility fallback; SWC's column is syntax acceptance only. SWC has no Bit extraction adapter in this experiment. Syntax acceptance cannot establish dependency metadata parity or justify replacing the differential suite. The report retains individual source hashes and failures, rather than treating parser success as compatibility.

The recorded screening contains 457 inputs: 433 are legacy success, native success and SWC syntax acceptance; 17 are legacy success with explicit Oxc fallback and SWC acceptance. The two legacy successes rejected by SWC are the deliberately skipped malformed `@bit-no-check` fixture and Flow under the configured ECMAScript parser. These reflect dispatch/configuration differences, not proof that SWC cannot support the legacy language surface. The remaining rows retain parser errors and unsupported dispatch separately.

The Oxc implementation is selected because its actual extractor passes rich metadata/order comparisons, resolved-tree comparisons, custom-detector precedence checks, and full-command JSON comparisons. There is no claim that Oxc beats SWC in a comparable extraction benchmark. Legacy Flow/proposal syntax, AMD dispatch, unsupported options, decorators requiring legacy asset handling, and prototype dependency keys deliberately use the legacy route. TypeScript parse failures preserve legacy diagnostic class, message and coordinates through a rare error-only adapter; a legacy success never erases a native parse failure.

## Transport decision

A persistent helper removes per-file process startup and reuses one process over a graph operation. The coordinator limits requests/results/bytes, uses exclusive bounded leases, clears source results between graphs, validates whole responses before exposing outcomes, and disposes or cancels the child explicitly. Resolution, cache ownership and custom hooks remain in TypeScript. Helper CPU and RSS are included in command measurements.

Retain this transport. It provides process failure isolation and bounded termination without loading parser code into the CLI address space. Packaged selection validates target, protocol, native source identity, compiled adapter identity, checksum and host compatibility; missing or incompatible artifacts fall back to legacy. The Node adapter uses ordinary process APIs and is tested on supported Node versions rather than requiring a Node-specific native ABI.

A native binding remains a conditional alternative, not unfinished implementation. Node-API offers [ABI stability](https://nodejs.org/download/release/v22.22.0/docs/api/n-api.html), but a binding would still need its own distribution and failure/cancellation design. Existing full-command gains demonstrate that helper startup/transfer does not prevent the selected cold workload from improving. Warm persistent-cache hits launch no helper. A binding comparison is warranted if measured transfer/startup becomes the limiting cost; no binding performance claim is made here.

## Concurrency and further scope

Preserve the existing component-loader concurrency policy. Parallel Rust file work and bounded helper leases do not prove that mutable traversal caches, custom detector hooks, and component writes can safely run concurrently. Operation-scoped reuse already removes repeated graph startup while preserving sequential ownership. Revisited concurrency is therefore a documented decision to retain current behavior.

Package/path resolution, custom detector migration, CSS/MDX parsing, a persistent AST store, object-store changes and warm component-loading redesign remain separate projects. Warm commands bypass extraction; source freshness reads are not automatically redundant. Profiling determines whether another project is justified. Completing this experiment does not require rewriting those independent subsystems.

## Final contract and measured batching boundary

The finalized v1 contract uses a request ID and ordered, validated absolute lexical paths for file identity. Language mode comes from the audited extension rather than a separate caller-supplied language field. Unknown/nonempty detector options return explicit unsupported outcomes. Diagnostic category and file context are structured by outcome status/path; legacy message/class/coordinates are adapted at the TypeScript error boundary. These are documented refinements of the proposal, not missing wire fields to add without a consumer need.

Pure built-in traversal uses bounded known-entry/frontier batches. When hooks are registered, detector predicates execute in their original order before eligibility is known; the adapter sends that exact already-read source snapshot. The measured full CLI therefore uses individual inline protocol requests within persistent helpers. It does not speculatively invoke predicates or reread source to manufacture larger batches. Process startup is amortized over an operation, and ASTs never cross the boundary. The separate pure/hook pipeline matrix measures both forms; CLI profiling records their actual boundary cost.

The CLI helper defaults to at most eight Rust worker threads and each operation permits at most four exclusive helper leases. The Node coordinator defaults to 256 files per path batch, 1 MiB request chunks, 8 MiB responses, 32 MiB cached outcomes, 8 MiB queued bytes and 64 queued requests, with validated upper limits. These are separate bounds, not a promise that summing process peaks measures concurrent memory. Session disposal and graph-boundary cache clearing remain mandatory.
