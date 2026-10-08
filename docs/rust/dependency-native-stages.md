# Native extraction stage diagnostics

The helper accepts explicit `--timings` alongside `--threads N`. Diagnostics are off by default: ordinary runs create no profiling clock/counters and write no diagnostic stderr. Protocol v1 stdout and responses remain byte-identical. Each profiled input line emits one schema-version-1 JSON diagnostic to stderr, identified by a request ordinal rather than paths, source text or caller-controlled IDs. Invalid requests also receive a diagnostic; their unexecuted stages remain zero.

Nanosecond durations separate bounded source acquisition (`source_read_ns`), Oxc parsing (`oxc_parse_ns`), module classification and visitor extraction (`extraction_ns`), UTF-8 validation plus JSON request decoding (`request_decode_ns`), JSON response conversion and buffered writing (`response_serialize_write_ns`), and batch wall time (`batch_wall_ns`). Inline source acquisition performs no filesystem read. Reading the NDJSON line precedes the batch timer; final response flushing is included in batch wall time. Diagnostic serialization itself follows the batch timer. Allocation outside the parser call and request validation/scheduling are not attributed to parsing.

Per-file stage durations are summed across parallel workers. They are not critical-path durations, CPU usage, or percentages of batch wall time. Profiling adds clock and atomic-counter overhead and is for diagnosis, not ordinary command benchmarking. Stderr write failure terminates the helper explicitly. Callers enabling diagnostics must drain stderr.

Reproduce the checked sample using the install fixture from PR #28:

```sh
node scripts/rust-dependency-analysis/native-stages.cjs \
  native/target/release/bit-dependency-scanner FIXTURE_ROOT \
  docs/rust/dependency-native-stages-results.json
```

The script checks source hashes, successful extraction of 64 disk files and 64 inline files, exact stdout equality with profiling disabled, and empty default diagnostics. The committed sample records the helper hash, fixture provenance and two diagnostics using two threads. It is a single diagnostic sample, not a speed claim.

Validation: 24 Rust tests, including actual disk/inline parsing and invalid-line recovery with byte-identical outputs; pinned pnpm formatter; Clippy with warnings denied; pnpm perfectionist Dylint with no warnings. Four tests cover profiling semantics, disabled broken diagnostic sinks, explicit diagnostic failure, and flag validation. Existing extraction and transport tests remain passing.

The portable transport suite additionally checks actual-helper Unicode/space paths and platform separator spellings, filesystem case behavior without collapsing logical case identities, and symlink paths independent of read targets. Inline content remains isolated by logical identity. All 41 session tests pass locally on Linux with zero skips; CI exercises Windows/macOS. Symlink creation skips visibly only when a Windows runner returns EPERM/EACCES, and case expectations are determined by the actual fixture filesystem rather than assumed from the operating system.
