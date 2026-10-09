# Revision-matched Bit command benchmark

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

Updated completion: [final work-package checklist](completion-checklist.md) and [final command acceptance](final-command-acceptance.md). This report retains its historical inputs and results; later evidence supersedes its open follow-ups.

The current Rust branch can be built and measured as a complete CLI. On this Linux host, `bit status --json` with an empty dependency cache took a median **10,441 ms with legacy extraction and 7,261 ms with Rust** (30.5% reduction). With all 334 dependency-cache entries present, medians were **3,349 ms and 3,367 ms**; there is no demonstrated warm-cache improvement. Rust remains opt-in.

## Build and reproduction

Measurements use source revision `b262e69d48401a41e1c52bbd0a9ed61077697a9b`, Bit 2.2.93, Node 24.21.0, and the actual compiled command/runtime graph. This resolves the earlier full-CLI build blocker. The installed 2.2.73 CLI bootstrapped object fetching and compilation only; it was not the timed CLI. The PATH-installed 2.0.26 CLI was not used.

```sh
node scripts/rust-dependency-analysis/command-build.cjs /path/to/installed/bit /tmp/bit-private-build
BIT_COMMAND_BENCH_COMMANDS=status node scripts/rust-dependency-analysis/command-benchmark.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner status.json
BIT_COMMAND_BENCH_COMMANDS=list node scripts/rust-dependency-analysis/command-benchmark.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner list.json
BIT_COMMAND_BENCH_COMMANDS=graph node scripts/rust-dependency-analysis/command-benchmark.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner graph.json
```

The builder makes an independent source archive and private physical dependency copy, reroutes workspace links, rejects links outside that copy, fetches pinned objects using existing authentication, and explicitly compiles all 334 bitmap components. No dependency installation is performed. The observed build produced 17,215 outputs with zero component errors; every output resolved inside the disposable workspace. Reproduction requires the existing installed dependency graph and access to the pinned Bit objects. The script records the revision, bitmap, compilation-result hash and compiled runtime module hashes, which the benchmark validates before running. Symlinks that leave the installed checkout (for example a relative `@teambit/legacy` link into a global BVM install) are replaced with a copy of their current contents, so the private build never reads shared state; their count is recorded as `copiedExternalLinks`. The consolidated builder has been run end to end (334 components, 17,215 outputs, zero errors), and a rerun of the status benchmark against that build reproduced the result: 2,925 native successes and 19 fallbacks, with exact parity and a similar cold-status reduction.

## Method and accepted results

Host: Linux/x64, kernel `7.1.10-200.fc44.x86_64`, AMD Ryzen 9 9950X3D2, 32 logical CPUs.

Each workload has a legacy reference, one discarded warmup per variant, and nine interleaved measured runs per variant. Every accepted run compares the complete parsed command JSON without normalization. Dependencies-cache state is restored before each run and entry counts are recorded outside the timed interval. Only the disposable workspace's cache leaf is touched; its original contents are restored afterward. Each experiment uses a fresh private `NODE_COMPILE_CACHE` directory, primed by the excluded status/reference/warmup executions and shared by both variants throughout that experiment. Commands include CLI startup, helper startup, transport, extraction, resolution and reporting. Instrumentation and GNU time run for both variants.

| Command and dependency cache              | Legacy median | Rust median | Legacy / Rust tree CPU median | Helpers with Rust |
| ----------------------------------------- | ------------: | ----------: | ----------------------------: | ----------------: |
| `status --json`, cold (0 → 334 entries)   |     10,441 ms |    7,261 ms |            16,140 / 10,360 ms |     2, sequential |
| `status --json`, warm (334 → 334 entries) |      3,349 ms |    3,367 ms |              5,300 / 5,300 ms |                 0 |

Cold status ranges were 10,383–10,485 ms for legacy and 7,194–7,296 ms for Rust. Warm ranges were 3,291–3,377 ms and 3,320–3,389 ms. All 36 measured status runs passed exact parity. All 18 startup-control runs also passed: list launched no helpers and showed no meaningful wall-time change (ranges 797–861 ms legacy and 810–868 ms native). Cold native commands submitted 2,944 inline files: 2,925 successful native results and 19 explicit unsupported fallbacks. Actual runtime hooks selected the inline-source path; these measurements do not assume the pure builtin prefetch path. The helper pool retained each of two sequential operation scopes; the observed maximum number of concurrent helpers was one.

Raw results and provenance are in command-benchmark-results.json (`command-benchmark-results.json`). The separately measured `list --json` startup control is recorded in command-benchmark-list-results.json (`command-benchmark-list-results.json`).

## Graph parity blocker

`graph --json` failed the strict gate before accepted measurements: independent **legacy-only cold runs** emitted graph arrays in different orders. The diagnostic records both complete-output hashes, the first differing field and node/edge counts in command-benchmark-graph-blocker.json (`command-benchmark-graph-blocker.json`). Both outputs contained 334 nodes and 2,159 edges, and sorting all nodes and edges retained full-field semantic equality. That comparison is an independent diagnostic only; it never passes the acceptance gate. There is no accepted graph timing or attributed native regression. Deterministic graph serialization or an explicitly approved graph equality contract is separate follow-up work.

## Limits and next gates

“Cold” means the Bit dependency cache is empty, not cold operating-system or V8 caches. This is one warmed local Linux machine; no exclusive-host claim is made. Object fetching and compilation are excluded from command timings. GNU time records CPU for the process tree and the largest individual-process RSS, not simultaneous whole-tree peak memory. Node peak plus the largest observed helper peak is a conservative sum for this verified sequential-helper workload, not a general concurrent-pool memory bound. Cold sums were approximately 2,156,356 KiB legacy and 1,102,612 KiB native; warm sums approximately 996,276 and 995,624 KiB. Sampling may miss short-lived helper peaks, and other child-process memory is not included in that sum.

Source-edit/configuration invalidation, install-related commands and cross-platform command workloads remain unmeasured. Keep opt-in operation until those gates and graph parity are resolved; these status results support the existing bounded helper reuse without promising a universal command gain.
