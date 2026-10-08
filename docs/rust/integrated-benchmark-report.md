# Actual dependency-tree pipeline benchmarks

Updated completion: [final work-package checklist](completion-checklist.md) and [final command acceptance](final-command-acceptance.md). This report retains its historical inputs and results; later evidence supersedes its open follow-ups.

These measurements run the new `generateTree` source, real installed detectives, the real filing-cabinet resolver and a release Rust helper. Each measured run must match the legacy final dependency graph, ordered path maps, missing dependencies and error codes. Parser-specific diagnostic text/stack traces are excluded from equality, as in the integration suite. No Bit command performance claim follows from these pipeline results.

## Results and next decision

The large graph has 96 systematically sampled tracked-source entries and 287 graph files (283 native-eligible extractions). The small sequence has eleven actual component roots, with 29 graph files (25 native successes) across their component-shaped operations. Global-hook cases register a nonmatching detector, forcing authoritative per-file inline requests instead of speculative prefetch. All modes resolve the same dependencies.

| Pipeline workload                      | Legacy median, ms | Native per operation, ms | Pooled native, ms | Native helper starts |
| -------------------------------------- | ----------------: | -----------------------: | ----------------: | -------------------: |
| Large graph, pure built-ins            |             724.1 |                    126.4 |                 — |                    1 |
| Large graph, nonmatching global hook   |             725.6 |                    151.7 |                 — |                    1 |
| Eleven small graphs, pure built-ins    |              48.1 |                     35.7 |              18.9 |               11 → 1 |
| Eleven small graphs, global hook       |              47.8 |                     38.3 |              20.6 |               11 → 1 |
| Warm visited graph, pure built-ins     |              2.18 |                     2.02 |              2.13 |                    0 |
| Warm visited graph, global hook        |              2.19 |                     2.25 |              2.32 |                    0 |
| Single edit, fresh visited state, pure |             597.0 |                     93.9 |              92.9 |                    1 |
| Single edit, fresh visited state, hook |             598.1 |                    116.1 |             116.8 |                    1 |
| Unsupported parser-option routing      |             723.8 |                    717.9 |                 — |                    0 |

The two small-graph rows compare all three variants in the same interleaved experiment; large and option rows come from the original per-operation integration experiment. Each variant has nine measured runs after a discarded warmup. Large graphs return 282 successful native outcomes and one explicit legacy fallback (`scopes/dependencies/pnpm/load-pnpm-esm.cjs`), whose read/parse/resolution work is included. Small graphs return 25 native successes and no fallback. Warm visited cases invoke no helper or extraction.

Helper pooling saves approximately **17 ms** beyond per-operation sessions across this eleven-component sequence, cutting helper launches from eleven to one. Its pipeline benefit exceeds the observed run spread. The worker-process median is about 284 → 267 ms for pure small graphs, and 288 → 271 ms with the hook: the same ~17 ms improvement becomes approximately 6% when source-loader startup is included. This supports the bounded lease implementation as an opt-in improvement, while maintaining the current component concurrency guard. It does not meet or establish issue #4's 15% whole-command threshold.

Warm visited differences are fractions of a millisecond. The pooled hook median is slightly above legacy; this is not evidence of passing the 5% warm **command** regression gate. Report full-command warm results before default enablement. Options unsupported by Rust intentionally remain on the legacy path; the option case preserves one legacy parse issue in both variants.

Single-edit timings are lower than first-operation timings because the worker first primes the same parser/resolver and OS state, then modifies one real source file and starts a fresh visited map. An additional unresolved import must appear in the final result. This checks analysis after an edit and avoids stale operation-cache reuse. **It does not exercise Bit's persistent dependency-cache invalidation or an incremental command.** The configuration case sets a parser option on the actual pipeline and verifies legacy routing; it is not a persistent configuration-cache benchmark.

## Reproduce

```sh
cd native
cargo build --locked --release
cd ..
BIT_LEGACY_ROOT=/path/to/installed/checkout \
  node scripts/rust-dependency-analysis/integrated-benchmark.cjs \
  native/target/release/bit-dependency-scanner output.json
```

The runner copies tracked source trees into a disposable directory, links installed dependencies read-only, generates legacy reference results, and removes only its own temporary dataset. It changes no user workspace/cache. It uses Node's in-memory TypeScript loader from the integration tests and real installed packages. This is a source-runtime experiment, not a packaged CLI build. GNU `/usr/bin/time`, Linux `/proc` and `getconf CLK_TCK` are required.

For the pool comparison, point `BIT_SCANNER_INTEGRATION_ROOT` at a checkout containing the command-scope lease implementation, set `BIT_BENCH_VARIANTS=legacy,native,pooled`, and select cases with `BIT_BENCH_WORKLOADS=small-pure,small-hook,warm-pure,warm-hook`. The pooled worker invokes `withRustDependencyScannerScope` around the real sequence of graph operations; the per-operation variant uses the same source without that outer scope. This isolates physical helper reuse rather than comparing different parsers or source graphs. The pool preserves entry batching and clears its graph cache at lease release.

Raw reports:

- [Original per-operation integration matrix](integrated-benchmark-results.json): 126 measured runs.
- [Pooled small/warm comparison](integrated-benchmark-pooled-results.json): 108 measured runs.
- [Edit comparison](integrated-benchmark-edit-results.json): 54 measured runs.

All 288 measured runs passed the same final-result parity gate, as did discarded warmups. The runner rotates variant order each iteration. Workloads use warm OS page caches, fresh Node workers, and freshly started helpers; warm visited/edited cases explicitly prime their graph inside the worker. Files come from tracked dependency/workspace/legacy component trees, including their real relative import closure. Entry paths, actual small-component groups, source hashes, graph/missing/error counts and raw timings are preserved in JSON. The edit report records the appended import separately from original source hashes.

Reports record the checkout base revision, binary hash, source module hashes and source-worktree status. Pooling source was measured before its separate commit, so a base revision alone does not identify that implementation: use its recorded module hashes. Installed detector/parser versions are explicit. The native helper uses its default available-CPU policy, capped at eight workers. The corpus includes real production sources but is not a measured distribution of component sizes reached by a user command.

## Timing, CPU and memory limits

`elapsedMs` includes actual graph construction, native startup, reads/parsing, transfer, inline hashing, legacy fallback, resolution, filters, path-map assembly and helper cleanup. Final assertions run afterward. The worker waits for helper close during instrumentation because production intentionally unrefs idle helpers; it does not substitute a different helper protocol or transport. Prototype-method wrappers count real outcomes and helpers and sample helper resource data; their small instrumentation cost is included.

`processElapsedMs` surrounds the complete worker, including TypeScript source compilation, module loading, manifest decoding, setup and assertions. For warm/edit cases it also includes the **preceding priming graph**, so its total and process-tree CPU cannot be interpreted as a standalone warm/edit command measurement. The driver and once-only oracle construction are outside these process timings.

GNU time's process-tree CPU includes Node and waited-for children; its centisecond precision limits tiny workloads. Node CPU is separate. Helper CPU samples use the host's recorded `CLK_TCK` and exclude work after the pre-disposal sample; GNU time's tree total remains authoritative. Node's peak RSS covers the entire worker, including priming. Helper `VmHWM` is sampled before disposal. Adding Node peak and largest helper peak is only a conservative estimate for these **sequential** workloads, may combine peaks from different times and excludes the driver. It is not a combined simultaneous peak measurement and does not cover concurrent pool leases. No memory acceptance gate is claimed. The raw GNU time peak is a maximum individual-process value, not a sum.

## Full-command build investigation

The checkout's bitmap identifies Bit 2.2.93. PATH `bit` is 2.0.26, while `node bin/bit.js --version` loads installed `@teambit/bit/dist/app` and reports 2.2.73. Neither is a revision-matched executable for this integration.

A disposable source snapshot was created with an independent Git directory and a full private copy of installed node_modules. Absolute workspace source links were rerouted to that snapshot; no hardlinks were created into live compiled outputs. The existing scope objects/components/refs/index were copied into its private scope. Attempting the documented compiler (`node bin/bit.js compile dependencies --json --safe-mode`) still fails:

```text
your workspace has outdated objects. please use "bit import" to pull the latest objects from the remote scope
(specifically: teambit.dependencies/dependencies@1.0.1208)
```

A complete current-component build therefore requires fetching the missing revision-pinned Bit objects/environment state before compiling all affected CLI components in isolation. Merely updating an installed package version or compiling the app entry point would not make the executable revision-matched. This milestone stops at the concrete build blocker and actual integrated-pipeline evidence; it does not substitute measurements from the older installed CLI.

Next, obtain a reproducible isolated checkout-matched CLI build, then benchmark `bit status`, `bit graph --json` and a confirmed analysis-bearing install operation against restored warm/cold persistent-cache states. Include command startup, total process-tree memory/CPU, source edits/config invalidation and packaged platform behavior. Keep Rust opt-in until those command-level gates pass.
