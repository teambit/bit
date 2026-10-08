# Final command acceptance

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

The dependency-scanning experiment passes its measured extraction, cold-command, warm-command and sampled-memory gates. The Rust backend remains opt-in: this one-host evidence supports the implementation, while broader default rollout remains a separate decision. Final combined correctness and packaged-platform evidence is indexed in [completion checklist](completion-checklist.md).

## Large current-source workspace

The raw report (`command-large-memory-results.json`) contains **135 actual CLI commands**: nine interleaved measured runs per variant and workload after warm-up, comparing legacy, batching-only TypeScript control, and Rust. Every run matches complete, unnormalized command JSON. Cold native runs must launch the helper and successfully extract sources; the TypeScript control must actually parse. Warm status, graph and list start no helpers.

The frozen private Bit 2.2.93 build comes from `a72e7cb66dd52be1c86aacb8745296fa5147b461`, with 334 compiled components and 17,215 outputs. The separate [source-read/CPU profiles](command-cpu-profile.md) inventory 2,979 unique source paths totaling 9,851,265 bytes in this snapshot; cold loading reads 6,222 times totaling 20,117,241 bytes. These source counts are diagnostic-profile evidence, not counters added to the timed matrix. Node 24.21.0 runs on Linux x64, AMD Ryzen 9 9950X3D2, 32 logical CPUs; kernel and compiled-module hashes are retained in the report. The immutable stage-capable helper has SHA-256 `ab4aeb1eb389b443136f772a23f7b4d3e495638ddd4abfd07acf1091063ee14c`; native detailed tracing is disabled. Later packaged-provenance and diagnostic changes have separate final correctness proofs and are not retrospectively attributed to this binary/build.

| Command/state | Legacy median ms (min–max) | TS control median ms (min–max) |  Rust median ms (min–max) | Rust elapsed change |
| ------------- | -------------------------: | -----------------------------: | ------------------------: | ------------------: |
| status-cold   |  14216.3 (14150.2–14351.0) |      14354.3 (14228.2–14490.0) | 11032.0 (10933.9–11168.1) |             -22.40% |
| status-warm   |     7103.6 (7076.5–7151.3) |         7137.8 (7082.8–7223.8) |    7100.2 (6309.9–7184.7) |              -0.05% |
| graph-cold    |  17158.7 (16950.3–17343.6) |      17259.2 (17117.3–17342.7) | 13911.4 (13803.3–13982.6) |             -18.93% |
| graph-warm    |  10192.1 (10110.9–10253.7) |      10185.2 (10160.3–10249.8) | 10237.3 (10147.0–10324.9) |              +0.44% |
| list-warm     |        796.0 (766.0–810.4) |            801.2 (778.8–815.7) |       801.6 (762.3–812.6) |              +0.70% |

The agreed cold-status workload improves by **22.40%**, exceeding the 15% target and observed run ranges. Cold graph improves by **18.93%**; the operation-scoped graph helper is reused instead of starting one process per component. Batching-only TypeScript gives no meaningful whole-command improvement here. Warm/startup median differences are at most +0.71%, below the 5% regression threshold. The warm-status native minimum is unusually fast; the median, not that outlier, determines acceptance.

## Combined process memory and CPU

| Command/state | Legacy / control / Rust median tree CPU ms | Legacy / control / Rust median sampled RSS KiB | Rust RSS change |
| ------------- | -----------------------------------------: | ---------------------------------------------: | --------------: |
| status-cold   |                      20520 / 20780 / 14970 |                    2239432 / 2145800 / 1153788 |         -48.48% |
| status-warm   |                         9850 / 9870 / 9830 |                    1068420 / 1068772 / 1068448 |          +0.00% |
| graph-cold    |                      29040 / 29140 / 22700 |                    2123692 / 2142152 / 2138604 |          +0.70% |
| graph-warm    |                      17740 / 17760 / 17840 |                    2062544 / 2068128 / 2071436 |          +0.43% |
| list-warm     |                         1400 / 1310 / 1400 |                       575820 / 579764 / 574160 |          -0.29% |

Cold status reduces sampled process-tree peak RSS by **48.48%** and tree CPU by 27.05%. Cold graph reduces tree CPU by 21.83% but its sampled peak RSS increases by **0.70%**: memory savings are not universal. All memory changes pass the 10% threshold. Every accepted sample set has zero failed live-process reads and zero PID races. Sampling includes the GNU time wrapper and all observed descendants, including native helpers; independent per-process maxima are not used for the gate.

Sampling is every 20 ms. Shared pages count once per process, short-lived processes and between-sample peaks may be missed, and OS/private V8 compile caches are warm. A cold workload empties Bit dependency records, not the OS cache. Timing and sampling run together; CPU totals include helpers. Sampler exit-memory handling and its 17 tests are described in [small/control validation](final-control-and-workspace-results.md). Raw reports retain per-run peak process identities, sample gaps, benign exit snapshots, memory ranges, helper participation and cache-record counts.

## Remaining acceptance workloads

- [Extraction and integrated control](final-control-and-workspace-results.md): 54 standalone comparisons, 3.84× startup-inclusive extraction versus TypeScript control, including four real fallback files; 243 integrated dependency-tree comparisons with unchanged resolution.
- [Small Node 22/24 commands](final-control-and-workspace-results.md): 270 measured actual commands on the genuine four-component, 64-file fixture. No small-workspace speedup is claimed; all warm and sampled-memory gates pass.
- [Genuine install](https://github.com/zkochan/bit/pull/28): real original package-manager forwarding with isolated local-only packages, 64 native extractions on every cold install. Median native wall time is about 1.6% higher and sampled RSS 0.8% lower; this is parity/regression evidence, not install acceleration.
- [Edit/configuration and sixteen-edit memory](https://github.com/zkochan/bit/pull/30): resolved-import replacement, valid component policy, supported cache invalidation, exact canonical parse diagnostics and actual 16-edit CLI commands. Sixteen-edit RSS changes by +0.26%, within 10%; unsafe results preserve the legacy cache behavior.
- [Packaged execution](packaged-final-proof.md): actual extracted Bit distribution, trusted helper selection and exact valid/malformed-source command JSON. Initial off/packaged/corrupt/missing/rollback status and graph evidence belongs to [PR #29](https://github.com/zkochan/bit/pull/29).

## Reproduction and decision

```sh
BIT_COMMAND_MEMORY_COMMANDS=status,graph,list \
BIT_COMMAND_MEMORY_VARIANTS=legacy,control,native \
node scripts/rust-dependency-analysis/command-memory.cjs \
  /tmp/private-current-source-cli /absolute/path/to/frozen-helper /tmp/results.json
```

Prepare the private current-source CLI using the documented build driver; do not run destructive cache resets against a working checkout. Reports verify frozen source/runtime hashes and confined cache paths and restore state afterward. Performance values apply to these recorded workloads and machines. Unsupported detectors, syntax and options use explicit compatibility paths; persistent caches and component concurrency retain their established policy. The persistent helper meets the measured goals without requiring a native binding. Warm loading, package resolution, stylesheet/MDX parsers and object-store work are separate projects in the parent plan.
