# Release extraction comparison: actual tracked source files

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

Updated completion: [final work-package checklist](completion-checklist.md) and [final command acceptance](final-command-acceptance.md). This report retains its historical inputs and results; later evidence supersedes its open follow-ups.

Recorded 2026-10-07 against the revision and executable SHA-256 in raw results (`dependency-benchmark-results.json`). Build: `cargo build --locked --release` in `native/`. Run on Linux x86_64 with Node v24.21.0; the JSON records CPU model, Rust version, parser versions, worker count and the exact corpus with SHA-256 hashes.

## Result and decision

The standalone Rust prototype passes exact legacy metadata and ordered source-key comparison on this 240-file sample, with **235 native successes and five explicit legacy fallbacks** per unique batch. Those fallback parses and additional reads are included in timing. The result justifies continuing to session batching and opt-in integration; it does not establish any improvement in `bit status`, `bit graph` or install.

| Workload and variant                   | Median extraction, ms | Median including startup and validation, ms | Range including startup, ms | Median process-tree CPU, ms | Peak summed RSS upper bound, MiB |
| -------------------------------------- | --------------------: | ------------------------------------------: | --------------------------: | --------------------------: | -------------------------------: |
| Unique: current legacy semantics       |                 500.0 |                                       654.6 |                 646.0–682.7 |                        1300 |                            436.6 |
| Unique: TS batch/dedup control         |                 506.4 |                                       660.8 |                 641.1–679.6 |                        1290 |                            438.1 |
| Unique: Rust + legacy fallback         |                  17.9 |                                       162.6 |                 158.9–165.7 |                         220 |                            134.9 |
| Duplicate 3x: current legacy semantics |                1263.3 |                                      1431.9 |               1401.7–1458.7 |                        2700 |                            563.5 |
| Duplicate 3x: TS batch/dedup control   |                 500.3 |                                       661.2 |                 650.1–666.1 |                        1310 |                            437.6 |
| Duplicate 3x: Rust + legacy fallback   |                  16.4 |                                       162.5 |                 156.3–163.7 |                         220 |                            135.2 |

On unique inputs Rust takes about 4x less startup-inclusive elapsed time than the control, and about 28x less time inside the extraction interval. Use the **4x** figure when discussing this cold-helper transport experiment: the internal number excludes Node startup, detector loading and result validation. All variants pay Node startup and detector loading; Rust additionally pays helper startup, request JSON serialization, source reads, response transfer/deserialization and fallback. A persistent helper or lazy legacy loading may change those costs and needs separate evidence.

The artificial duplicate workload shows that deduplication alone removes substantial work. It submits each of the same 240 files three times, totaling 720 requests. It is not evidence that the real traversal parses every file three times: current visited caching already suppresses much repeated work. The TypeScript control is a local serial extraction coordinator model with one result per unique logical path and request fan-out, not an integrated Bit batching implementation.

## Method and reproducibility

```sh
cd native
cargo build --locked --release
cd ..
BIT_LEGACY_ROOT=/path/to/installed-checkout \
  node scripts/rust-dependency-analysis/benchmark.cjs \
  native/target/release/bit-dependency-scanner \
  /tmp/dependency-benchmark-results.json
```

`BIT_BENCH_THREADS` defaults to four. The runner requires GNU `/usr/bin/time`; its metrics are Linux-oriented. No native dependencies are installed by the script. Legacy packages are loaded from `BIT_LEGACY_ROOT` through the same harness as the compatibility suite.

Corpus selection systematically samples 240 files across sorted tracked JS/TS variants in `scopes/dependencies`, `scopes/workspace` and `components/legacy/consumer-component`. It includes tests and index barrels along with runtime sources; this is representative source syntax rather than a measured distribution of files reached by a command. The corpus totals 1,281,566 source bytes. Full paths, content hashes and the five fallback paths are in the raw results.

For each workload, each variant gets one warmup followed by nine measured runs. Variant order rotates each iteration. Every measured run is a fresh Node process; Rust starts one release helper for the whole unique-path batch. Thus OS caches are warm, Node/helper startup is cold, and no Bit persistent dependency cache is consulted. The variants are:

- Legacy: synchronous read and current precinct-like detector dispatch for every submitted path.
- Control: synchronous reads and the same legacy extraction once per unique path, then fan-out in request order.
- Rust: identical unique-path dedup, one read-path batch to Rust, then legacy read/parse for each explicit unsupported result and fan-out in request order.

The oracle is generated before measurements from legacy dispatch. Every run compares statuses, raw metadata and ordered precinct source keys after extraction. A mismatch aborts the run; files are not removed to obtain a favorable score. Unsupported results are not dropped: they execute the legacy path. Parse errors, read errors and unexpected statuses fail the parity gate for this valid corpus.

The internal timer starts before native request serialization/read/extraction and ends after response decoding/fallback/fan-out. The outer timer surrounds the entire worker subprocess, including Node/module startup, manifest loading, GNU time overhead, correctness assertions and output. Large oracle manifests are identical for all variants. The benchmark driver itself and its once-only oracle work are outside the outer timer; this measures a worker batch, not startup of the benchmark tool or a Bit command.

GNU time's process-tree CPU includes child/helper CPU (with centisecond granularity). Node's `process.cpuUsage` excludes helper CPU and is reported separately. GNU time's peak RSS is a maximum for an individual process, **not simultaneous summed memory**. The table uses Node self peak plus helper peak as a conservative upper bound: peaks can occur at different times, and the wrapper/driver are excluded. This cannot be used to assert compliance with issue #4's 10% total peak memory criterion. Helper and Node peaks are also retained separately in the JSON. Shared-host contention, GC, parser worker activity and turbo frequencies affect variation.

## Remaining validation

Before default enablement, measure the actual critical path on an executable built from this checkout and a disposable workspace, with warm/cold Bit-cache states restored between interleaved runs. Include session/frontier batching, custom-hook precedence, final resolved tree parity, traversal ordering, cache invalidation, cancellation, bounded byte buffering and mixed options. The native engine currently falls back for nonempty options and buffers whole batches, so this empty-options four-worker experiment does not establish memory safety or supported production coverage. Validate package installation and supported platforms separately.
