# Final extraction, control and small-workspace validation

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

These experiments use the final stage-capable helper with profiling disabled: executable SHA-256 `ab4aeb1eb389b443136f772a23f7b4d3e495638ddd4abfd07acf1091063ee14c`. Inputs, revisions, tool versions, raw runs and fallback counts are retained in each report. They are separate from earlier historical results and from the large command/memory matrix.

## Eligible extraction

Final standalone results (`dependency-final-extraction-results.json`): 240 source files, 1,176,557 bytes; 236 native successes and four explicit legacy fallbacks, with fallback reads/parsing included. Both unique and artificial threefold-duplicate workloads use nine measured runs per variant after warm-up, rotating legacy, batching-only control and Rust.

| Workload     | Legacy startup-inclusive median | TypeScript control | Rust plus fallback | Control / Rust |
| ------------ | ------------------------------: | -----------------: | -----------------: | -------------: |
| Unique       |                        622.3 ms |           616.6 ms |           160.4 ms |          3.84× |
| Duplicate 3× |                      1,327.7 ms |           614.8 ms |           163.8 ms |          3.75× |

The 2× extraction criterion passes including source reads, transfer, fallback, startup and validation. Internal extraction times are retained but not substituted for these outer medians. Artificial duplication demonstrates the value of deduplication; it does not establish that normal Bit traversal repeats every parse three times. Independent process-peak sums are upper bounds, not simultaneous memory acceptance.

## Actual dependency-tree boundary

Integrated TypeScript control results (`integrated-typescript-control-results.json`): nine measured runs for each of three variants across nine workloads, **243 exact final-result comparisons**. The reproducible production-source inventory contains 324 files totaling 1,706,738 bytes. The large traversal reaches 293 eligible files; pure control records 293 reads/parses and 405 cache hits. The sole explicit native fallback is `scopes/dependencies/pnpm/load-pnpm-esm.cjs`.

| Workload                      | Legacy pipeline median | TypeScript control | Native pipeline |
| ----------------------------- | ---------------------: | -----------------: | --------------: |
| Large pure                    |               723.7 ms |           708.8 ms |        134.2 ms |
| Large with nonmatching hooks  |               720.6 ms |           734.4 ms |        159.3 ms |
| Small pure graphs             |                54.8 ms |            56.5 ms |         38.3 ms |
| Small graphs with hooks       |                54.7 ms |            55.0 ms |         40.1 ms |
| Warm pure                     |               2.273 ms |           2.334 ms |        2.098 ms |
| Warm with hooks               |               2.302 ms |           2.352 ms |        2.124 ms |
| Unsupported detective options |               730.3 ms |           724.2 ms |        730.2 ms |
| Edited pure graph             |               623.0 ms |           613.9 ms |         99.9 ms |
| Edited graph with hooks       |               610.6 ms |           617.6 ms |        121.5 ms |

The large pure native pipeline is approximately 5.28× faster than the control, including extraction and the unchanged resolution/traversal boundary. Control-only differences are small and usually overlap observed variation. Hooks preserve predicate order and authoritative inline source; unsupported options run the legacy path with zero native starts.

The small-graph harness deliberately exercises separately owned graphs and therefore starts 11 native helpers; actual operation-scoped CLI reuse is measured in the command matrix. Warm/edit outer process timers include their preparation traversal and are **not warm CLI timing evidence**. Warm pipeline timers isolate the measured cache-hit traversal. Graph errors retain the existing benchmark category comparison; canonical error details are validated separately by the focused/full-CLI syntax proofs in PR #30. Memory here is an independent-peak upper bound, not the 10% gate.

## Small actual CLI workspace, Node 22 and 24

Node 24 report (`command-small-memory-node24-results.json`) and Node 22 report (`command-small-memory-node22-results.json`) each contain **135 measured actual CLI commands**, nine per variant/state: cold/warm status, cold/warm graph, and warm list. The genuine four-component fixture has 64 source files totaling 5,012 bytes, verified by its source-hash manifest. All comparisons use complete unnormalized command JSON. Native cold commands must actually launch a helper and extract successful files; the control must actually parse; warm/startup cases must start no helpers.

| Node    | Command/state | Legacy median | TypeScript control | Native median | Native sampled RSS change |
| ------- | ------------- | ------------: | -----------------: | ------------: | ------------------------: |
| 24.21.0 | Status cold   |      410.9 ms |           416.7 ms |      416.9 ms |                    −4.00% |
| 24.21.0 | Status warm   |      346.7 ms |           354.2 ms |      348.2 ms |                    +0.56% |
| 24.21.0 | Graph cold    |      371.0 ms |           384.0 ms |      377.6 ms |                    −1.60% |
| 24.21.0 | Graph warm    |      273.1 ms |           276.0 ms |      274.4 ms |                    −3.57% |
| 24.21.0 | List warm     |      219.6 ms |           220.5 ms |      216.8 ms |                    +0.42% |
| 22.22.0 | Status cold   |      440.6 ms |           445.9 ms |      445.0 ms |                    −2.37% |
| 22.22.0 | Status warm   |      363.0 ms |           365.0 ms |      362.2 ms |                    −0.49% |
| 22.22.0 | Graph cold    |      397.3 ms |           398.6 ms |      401.4 ms |                    +1.65% |
| 22.22.0 | Graph warm    |      285.8 ms |           286.3 ms |      287.6 ms |                    −0.06% |
| 22.22.0 | List warm     |      225.5 ms |           227.0 ms |      225.5 ms |                    +2.41% |

Startup dominates this deliberately small fixture; no speedup is claimed. All warm native medians remain within 5% and all native sampled-memory medians remain within 10% of legacy. Raw reports retain ranges, actual process-tree CPU, process identities, sampling gaps and zero failed/raced reads.

Memory uses 20 ms near-simultaneous Linux process-tree RSS, including helper/wrapper processes and excluding the driver. Shared pages count per process and brief processes/between-sample peaks can be missed. The sampler now recognizes missing VmRSS during `exit_mm` only after a valid seven-field, zero-resident `statm` snapshot and a repeated stable PID identity check; `releasedMemoryReads` remains visible. Positive resident counts, malformed data, unreadable live tasks and PID races still fail validation. Seventeen sampler/controller tests pass. The first small run was rejected before acceptance because the old sampler misclassified this reproduced exit race; no invalid samples were retained.

Reproduce with an independent copy of the install fixture and the frozen current-source private CLI:

```sh
BIT_COMMAND_BENCH_WORKSPACE=/tmp/owned-small-fixture \
BIT_COMMAND_MEMORY_COMMANDS=status,graph,list \
BIT_COMMAND_MEMORY_VARIANTS=legacy,control,native \
node scripts/rust-dependency-analysis/command-memory.cjs \
  /tmp/private-cli /absolute/path/to/final-helper /tmp/results.json
```

Use the desired Node executable for each supported version. Source hashes, cache confinement, compiled-module hashes, native participation, private global configuration and finally-restoration are enforced by the driver.
