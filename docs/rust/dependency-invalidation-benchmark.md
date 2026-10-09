# Warm dependency-cache invalidation validation

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

This follow-up measures the actual `bit status --json` command after dependency-bearing source edits and a workspace package configuration change. It restores the same pre-edit warm cache before every legacy/Rust run; it does not benchmark an already refreshed post-edit cache.

```sh
node scripts/rust-dependency-analysis/command-invalidation-benchmark.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner invalidation.json
```

Use the isolated builder from [the command benchmark](dependency-command-benchmark.md). This runner requires its private provenance marker and validates compiled runtime hashes. The measured CLI source is `b262e69d48401a41e1c52bbd0a9ed61077697a9b`; the runner worktree starts at `836dd844a`. Dependency runtime, component loader and scanner production sources are unchanged between those revisions. The release scanner hash and compiled module hashes are retained in the raw result. Fetching and compilation are excluded.

The three workloads append an unresolved dependency import to the tracked capitalize index, append distinct imports to both capitalize and ellipsis indexes, or add a dependency entry to the workspace's package.json. The configuration workload tests the documented global package.json invalidation boundary; the unreferenced marker dependency need not change status JSON. No installation occurs. Every mutation is confined to the disposable snapshot and original bytes, mtimes and cache are restored in `finally`.

Before accepting a workload, the runner proves that legacy warm-cache output equals uncached legacy output, counts actual dependency-tree operations in both variants and changed or removed cache-entry timestamps, and requires source edits to expose their exact new missing dependency names in status output. Measured runs independently require source edits to invoke dependency-tree analysis and the global package change to refresh all 334 cache timestamps, exact complete JSON equality with the uncached reference, and real native requests/helper launches. Unsafe missing-dependency results are not persisted: the existing old cache entry may remain, but its mtime check rejects it on every run. This is why source invalidation is proved by actual tree operations and changed output rather than requiring cache timestamps to change.

Each workload has one discarded warmup per variant followed by nine interleaved runs per variant. Commands include startup, native transport, resolution and reporting. The private V8 compile cache is primed and shared across variants; the OS cache is warm. Cache inspection runs outside the timed interval. This is one Linux/x64 host (Node 24.21.0, AMD Ryzen 9 9950X3D2, 32 logical CPUs), without exclusive-host control. CPU/RSS limitations match the earlier command benchmark: GNU time supplies process-tree CPU but largest individual-process RSS; summed separately observed Node/helper peaks are not an exact simultaneous tree-memory measurement.

| Mutation                        | Legacy median | Rust median | Tree operations per run | Native requests / helpers |
| ------------------------------- | ------------: | ----------: | ----------------------: | ------------------------: |
| One source component            |      3,409 ms |    3,406 ms |                       1 |                     3 / 1 |
| Two source components           |      3,381 ms |    3,403 ms |                       2 |                     6 / 2 |
| Workspace package configuration |     10,965 ms |    7,614 ms |                     334 |                 2,944 / 2 |

All **54 measured runs** passed exact whole-JSON parity, plus the three warm-versus-uncached legacy proofs. Both source mutations changed status output and exposed the exact newly introduced missing dependencies. Their old cache timestamps remained unchanged, while real analysis ran on each invocation. The workspace package mutation refreshed all 334 timestamps and invoked all 334 dependency trees in every variant/run. All runs began and ended with 334 cache entries. The package marker was unreferenced, so status JSON correctly stayed equal to the pre-edit baseline despite mandatory reanalysis.

Small source invalidations show no meaningful command-time improvement. Global configuration invalidation reduced median command time by **30.6%**; ranges were 10,446–12,092 ms legacy and 7,269–8,185 ms native. Global native outcomes were 2,925 successful scans and 19 explicit unsupported fallbacks. Maximum observed concurrent helpers were one for single-source, two for two-source, and one for workspace-package; the two-source peak must not be interpreted using a sequential-helper memory bound.

Both source workloads edit one-file components, so native extraction there covers only 3 files per run, and helper startup cancels out the parse saving. The `large-source` workload (`BIT_COMMAND_BENCH_MUTATIONS=large-source`) edits `scopes/workspace/workspace/workspace.ts` instead, so one dependency tree covers that ~70-file component. It is not part of the raw results above. A separate run on a later `rust` revision passed the same proofs and exact parity, with 72 native scans and one helper. Medians were 7,648 ms legacy and 7,443 ms native (−2.7%), with process CPU at 10.85 s and 10.30 s. That host was heavily loaded by unrelated builds, so only the interleaved comparison is meaningful, not the absolute times. Re-analysing even a large component after an edit saves only a few hundred milliseconds; command startup dominates.

This validates detection of newly missing dependencies and the workspace package invalidation boundary. It does not establish resolved-dependency replacement, component-specific policy/TS configuration changes, or install invalidation. Original source/package bytes were verified against the runner checkout after completion.

Raw data: command-invalidation-results.json (`command-invalidation-results.json`).
