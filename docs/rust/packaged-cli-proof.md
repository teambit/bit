# Actual packaged Bit bundle smoke

Raw JSON results and test logs are stored outside this repository. Historical filenames below identify generated outputs; see the [benchmark artifact policy](README.md#benchmark-artifacts).

Recorded results (`packaged-cli-proof-results.json`) accepted **10 actual CLI commands** with complete, unnormalized JSON equality. This is correctness evidence, not a timing benchmark.

The isolated snapshot starts with the previously verified **334-component, zero-error Bit 2.2.93 build** at `a72e7cb66`. It overlays dependency sources from `47d02780e` (packaged discovery plus the native prototype-key guard) and precinct diagnostics from `067477ad3`. Standard `bit compile dependencies --json --safe-mode` produced **855 outputs and zero errors**. The production assembler installed a trusted checkout-release archive; a whole Bit tar bundle was created, extracted into another directory, and its CLI reported **2.2.93**. Every internal source/package link is relative and confined to the extracted bundle. The fixture is a private copy of the four-component, 64-source-file install fixture; its runtime package aliases are explicitly redirected to that extracted CLI.

| Mode                         | `status --json`     | `graph --json`      | Helper participation per command           |
| ---------------------------- | ------------------- | ------------------- | ------------------------------------------ |
| `off`                        | Reference           | Reference           | 0 launches, 0 requests                     |
| `packaged`                   | Exact JSON equality | Exact JSON equality | 1 launch, 64 requests, 64 successful files |
| Corrupted executable         | Exact JSON equality | Exact JSON equality | 0 launches, 0 requests                     |
| Missing artifact directory   | Exact JSON equality | Exact JSON equality | 0 launches, 0 requests                     |
| Validated installer rollback | Exact JSON equality | Exact JSON equality | 1 launch, 64 requests, 64 successful files |

Rollback installs two **real** trusted archives from distinct commits (`2bacea1ec` and `47d02780e`) with identical Rust source identity, then restores the earlier immutable revision through the installer. Corruption and missing-artifact checks exercise production discovery fallback, rather than a substituted parser. Only the disposable fixture's dependency cache is cleared before each command. The trace observes subprocess/request/output activity without changing extraction, resolution or JSON.

Reproduce after creating the private full CLI and install fixture described by the command-build/install proof documentation:

```bash
node scripts/rust-dependency-analysis/packaged-cli-proof.cjs \
  /tmp/bit-rust-final-cli \
  /tmp/artifacts/bit-dependency-scanner-0.1.0-x86_64-unknown-linux-gnu-2bacea1ecb8c.tar.gz \
  /tmp/bit-rust-install-fixture-v3 \
  /tmp/packaged-cli-proof-results.json \
  067477ad3 \
  /tmp/artifacts/bit-dependency-scanner-0.1.0-x86_64-unknown-linux-gnu-47d02780ea76.tar.gz
```

The driver preserves the private bundle/evidence directory for inspection. The recorded run resumed its already hash-verified tar/extraction after the fixture-link safety check identified aliases that needed explicit remapping; the default invocation builds and extracts afresh. A first safety check also caught source links newly generated during compilation, so portable-link conversion now runs again before archiving. Neither failed safety check accepted command results.

This Linux x64 GNU proof uses frozen, explicitly recorded runtime/helper revisions. It does not claim the later stage-instrumentation native revision is installed, other operating systems pass this full Bit bundle smoke, or any performance improvement. Later native changes require a fresh release artifact and assembled build descriptor. Other native platforms and Node versions have their own real install/extraction matrix in the scanner workflow; its results remain a separate gate. Legacy stays the default.
