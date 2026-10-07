# Local graph command parity after deterministic JSON ordering

This validates the real `bit graph --json` command after [PR #20](https://github.com/zkochan/bit/pull/20) orders serialized local graph nodes and edges. The benchmark performs exact whole-JSON comparison; it does not sort, normalize or otherwise transform command output. The earlier backend-off ordering blocker remains preserved as historical evidence in [the original command report](dependency-command-benchmark.md).

The private CLI is the verified full source build at `b262e69d48401a41e1c52bbd0a9ed61077697a9b` plus GraphCmd source overlay `4b6eb3e219c382acb272ab251fc46c42e659e833`. Only `teambit.component/graph@1.0.1208` was recompiled: 306 outputs, zero component errors, all output realpaths inside the private snapshot. The provenance marker records the overlay source SHA-256, compilation-result SHA-256 and compiled `graph/dist/graph-cmd.js` hash; the ordinary command harness validates the compiled module hash before launching any measured command. The overlay source hash is `bb95bb0741a127e12dae7c44d73765415f2abac804948d19edfe0ad93b004341`. Scanner/dependency runtime sources are unchanged.

PR #20 is merged, so a disposable current-source CLI from the [isolated builder](dependency-command-benchmark.md) already contains the ordering change; the overlay above is only needed to reproduce this exact revision. (On a checkout whose `node_modules` links outside itself, the builder also needs [PR #25](https://github.com/zkochan/bit/pull/25).) Then run:

```sh
BIT_COMMAND_BENCH_COMMANDS=graph node scripts/rust-dependency-analysis/command-benchmark.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner graph.json
```

Each cold/warm workload has one discarded warmup per variant and nine interleaved measured runs per variant, with exact complete JSON equality to its corresponding legacy reference. Cold dependency-cache state starts with zero entries; warm state restores 334 entries. Only the private cache leaf is changed, and its initial contents are restored afterward. Startup, helper lifecycle, transport and fallback work are included. V8 compile cache is privately primed/shared across variants and OS cache is warm. No heavy team build/install operation overlapped this measurement window; the host was not exclusively controlled.

| Dependency cache         | Legacy median | Rust median | Legacy / Rust tree CPU median |  Native helpers |
| ------------------------ | ------------: | ----------: | ----------------------------: | --------------: |
| Cold (0 → 334 entries)   |     17,077 ms |   15,589 ms |            28,310 / 24,240 ms | 334, sequential |
| Warm (334 → 334 entries) |     10,102 ms |   10,070 ms |            17,150 / 17,140 ms |               0 |

All **36 measured runs** passed exact complete JSON equality, resolving the recorded local graph ordering blocker. Cold legacy ranges were 16,925–17,159 ms and native ranges 15,539–16,643 ms: an **8.7% median reduction**. Warm ranges were 10,022–11,170 ms and 10,036–11,121 ms, with no demonstrated warm-cache gain. Native cold commands sent 2,944 inline requests, returning 2,925 successful scans and 19 explicit unsupported fallbacks. Every cold run started with zero cache entries and ended with 334; every warm run retained 334. Every cold native command launched 334 helpers with a maximum of one live helper; every warm native command launched none and sent no requests.

The gain is smaller than cold status because graph has different operation boundaries. `Workspace.getGraphIds()` creates `GraphIdsFromFsBuilder`; its `loadManyComponents()` uses `mapSeries` and calls `workspace.get(compId)` separately for each component. Each component thus enters its own helper-owning scope. This benchmark does not attribute all command time to parsing. [PR #26](https://github.com/zkochan/bit/pull/26) has since run each graph build as one operation scope, keeping serial traversal and clearing per-component caches. A later measurement on the same host cut helper launches from 334 to 1 per cold run, with a cold median of 17,148 ms legacy vs 14,285 ms Rust (−17%, from −9% here). That measurement is not part of the raw results below.

Raw results and build/runtime provenance: [command-graph-results.json](command-graph-results.json). Node 24.21.0, Linux/x64, AMD Ryzen 9 9950X3D2, 32 logical CPUs. GNU time reports tree CPU and largest single-process RSS; helper/Node separately observed peaks are not exact simultaneous tree memory.

This concerns the local graph JSON schema. Remote graphlib output and install/configuration workloads are separate contracts and are not covered by these measurements.
