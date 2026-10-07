# Sampled simultaneous command memory

The earlier reports added separately observed Node and helper high-water marks. The new Linux-only runner instead samples the RSS of the command and its observed descendants during the same sampling pass. It does not change ordinary Bit commands or scanner transport.

```sh
node --test scripts/rust-dependency-analysis/process-tree-memory.test.cjs
node scripts/rust-dependency-analysis/command-memory.cjs /tmp/bit-private-build /absolute/path/to/release/bit-dependency-scanner memory.json
```

Use a disposable current-source CLI with the provenance marker produced by `command-build.cjs`. The runner verifies the compiled runtime hashes and CLI version, rejects workspace/cache aliases, restores its own dependency-cache snapshots, and checks complete status JSON without normalization. Each cold/warm workload has a discarded warmup per variant followed by nine interleaved runs per variant. Cold runs start with zero dependency-cache entries; warm runs use the same primed snapshot. All accepted runs must finish with the expected component count. OS and the shared private Node compile cache are warm.

The driver starts GNU time and samples that process plus its descendants every 20 ms using Linux procfs. The driver itself is excluded. GNU time's small wrapper is included. Child discovery checks every thread's `children` file, deduplicates process IDs, and rechecks process identity after reading RSS to reject unrelated PID reuse. Previously observed children remain tracked if their parent exits. Each record retains the peak sample's process list, sample count, maximum sampling gap/duration, missing/failed/raced procfs reads, and sampler CPU. Failed or identity-raced reads reject a run. Node high-water and GNU time's maximum individual-process RSS are reported separately.

This is a near-simultaneous RSS sum assembled from sequential procfs reads, not an atomic kernel snapshot. Shared mapped pages count once for each process that maps them. Between-sample peaks and short-lived children can be missed; a process that exits during a read is reported as a missing-process read. The result is not USS/PSS, an exact maximum, or a sum of independent high-water marks. Compare the recorded sampling gaps and read quality before interpreting a run. GNU time's CPU excludes the external sampling driver; elapsed time includes the command's instrumented execution and the host's scheduling effects.

Twelve tests cover thread-child discovery, a missing task children list (kernels without `CONFIG_PROC_CHILDREN`), descendant deduplication, simultaneous versus independent peaks, orphan tracking, stale/PID-reused children, identity changes during a read, missing and unreadable processes, input validation, a real resident allocation, and timeout/cancellation of SIGTERM-resistant commands. They run in the existing Linux pipeline CI job. The command runner uses a two-minute deadline and kills its own detached process group after a one-second termination grace period; source/cache cleanup then runs in `finally`. No packages beyond Node built-ins are required by the sampler tests.

The private builder copies the current contents of external links that resolve in the installed checkout (such as a relative `@teambit/legacy` BVM alias; see PR #25). It now also removes external aliases that are already dangling there, since they cannot be copied, and records both counts. Internal dangling links remain for later compilation. This cleanup affects only the disposable copy, never the installed dependency tree.

## Recorded results

The measured CLI is the verified Bit 2.2.93 source snapshot at `b262e69d48401a41e1c52bbd0a9ed61077697a9b`. Later CI/benchmark commits do not change its dependency runtime. The independently copied snapshot retains all compiled runtime hashes; its absolute workspace links were rerouted and checked before use. The native binary SHA-256 is recorded in the raw report. Measurement tooling matches commit `d6bf4dfe4`, with individual script hashes recorded. Host: Linux/x64, Node 24.21.0, AMD Ryzen 9 9950X3D2, 32 logical CPUs. Heavy builds and other planned benchmark commands were serialized; exclusive host control is not claimed.

| Status dependency cache  | Legacy median peak sampled RSS | Rust median peak sampled RSS | Legacy / Rust elapsed median |
| ------------------------ | -----------------------------: | ---------------------------: | ---------------------------: |
| Cold (0 → 334 entries)   |       2,191,076 KiB (2.09 GiB) |     1,158,740 KiB (1.11 GiB) |            10,438 / 7,224 ms |
| Warm (334 → 334 entries) |       1,062,932 KiB (1.01 GiB) |     1,057,560 KiB (1.01 GiB) |             3,350 / 3,338 ms |

All **36 measured runs** passed exact complete status JSON parity and independent cache-count guards. Cold native commands started two sequential helpers; warm commands started none. Median cold sampled tree RSS was **47.1% lower**; warm medians differed by approximately 0.5%, with no demonstrated regression on this workload. This supports the status workload's memory gate under the declared sampled-RSS metric; it does not establish exact peaks, physical unique-memory consumption, or acceptance for every command/platform.

Every measured run had zero failed and zero identity-raced procfs reads. The largest sampling gap was 21.41 ms and the largest sampling-pass duration was 2.69 ms. Missing-process reads occurred as processes exited and remain recorded. Up to three processes were observed concurrently. In addition to Node and the GNU time wrapper, an auxiliary Node process can contribute memory; the sampled sum includes it. Rust was not necessarily alive at the maximum-memory instant, and the report retains the actual process list rather than attributing the entire peak to the helper.

Legacy cold sampled peaks ranged from 2,139,004 to 2,225,736 KiB; native from 1,145,552 to 1,172,168 KiB. Warm ranges were 1,056,144–1,242,596 KiB legacy and 978,700–1,071,704 KiB native. Do not confuse these sampled ranges with GNU time's per-process maximum or the historical independent high-water sums. Original cache contents were restored after completion.

Raw results: [command-memory-results.json](command-memory-results.json). Multi-helper edit workloads, graph, install and other platforms still require their own memory evidence.
