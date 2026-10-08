# Diagnostic CLI CPU and source-work profiles

[Raw profiles](command-cpu-profile-results.json) record eight exact whole-command JSON comparisons, using the frozen current-source 334-component CLI at `a72e7cb66`, Node 24.21.0, and the prototype-key guard helper whose SHA-256 is in the report. These are **diagnostic runs**, separate from acceptance timings. V8 samples the CLI main thread at 1 ms; helper CPU is excluded. Actual CLI process CPU is recorded separately and can include other threads.

| Workload    | Legacy detective calls | Native detective calls | Legacy synchronous detective time | Native synchronous detective time | Legacy parsing/extraction sample weight | Native parsing/extraction sample weight |
| ----------- | ---------------------: | ---------------------: | --------------------------------: | --------------------------------: | --------------------------------------: | --------------------------------------: |
| Cold status |                  3,124 |                    206 |                        3,276.8 ms |                           34.6 ms |                                  22.47% |                                   2.24% |
| Cold graph  |                  3,124 |                    206 |                        3,349.8 ms |                           35.2 ms |                                  18.89% |                                   1.79% |
| Warm status |                     62 |                     62 |                           10.5 ms |                           10.2 ms |                                   0.33% |                                   0.38% |
| Warm graph  |                     62 |                     62 |                           10.7 ms |                           10.5 ms |                                   0.29% |                                   0.26% |

Both cold commands visit 334 analysis trees. Native submits 2,946 authoritative inline files: 2,927 successful outcomes and 19 explicit compatibility fallbacks. Status starts two helpers; operation-scoped graph starts one. Warm commands visit zero analysis trees and start zero helpers. The remaining 62 detective invocations are outside the cached workspace-tree boundary and occur with either backend; “warm cache bypasses workspace analysis” does not mean every CLI detector invocation disappears.

All variants read 2,979 distinct workspace source paths. Cold commands make 6,222 source reads totaling 20,117,241 bytes; warm commands make 2,979 reads totaling 9,851,265 bytes. Reads are counted separately for sync, callback and promise APIs; this sample uses the synchronous API. The Rust change preserves source acquisition and hook dispatch, so it does **not** remove these reads. Source freshness/materialization is therefore a separate warm-path question. Counter identities use logical source paths for reads, TypeScript source hashes and JavaScript AST object identity for detector inputs; unique detector inputs are not a logical file count.

The synchronous detective spans and weighted samples establish substantial eligible work on cold status, consistent with the independent approximately 30% command improvement recorded in the earlier status benchmark. They support choosing cold status as the primary workload. They do not turn weighted stack samples into an exact elapsed-time budget or a share of total process CPU. Detector spans include TypeScript parsing/extraction; JavaScript AST parsing before detective dispatch is outside those direct spans. The asynchronous tree spans are retained as diagnostic measurements and must not be summed or divided by concurrency to infer critical-path time.

Profiling adds instrumentation, hashing and sampling overhead. No profile elapsed time is substituted into acceptance medians. Fallbacks, source reads and garbage-collection samples remain in the reports. A meaningful tracer test verifies real detective output/error forwarding and all three source-read API forms. Native-only phase diagnostics are recorded separately in PR #31, with worker stage sums explicitly distinguished from batch wall time.

Reproduce:

```sh
node scripts/rust-dependency-analysis/command-profile.cjs \
  /tmp/bit-rust-final-cli /absolute/path/to/frozen/helper \
  docs/rust/command-cpu-profile-results.json
```

The driver validates compiled-module hashes, uses private global configuration, restores the dependency cache on completion/failure, and retains CLI-owner traces so detached children cannot overwrite results. Build revision, tool revision/hash, helper hash, Node, CPU and kernel are recorded in the raw report.
