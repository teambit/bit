# Client transfer operations in Rust

Rust owns ordinary client transfer selection, frozen compressed object collections, archive generation, filesystem pending writes, and push/validate/persist/retry/cleanup/resume transaction decisions. Node retains public transport, authentication, class hydration and logging callbacks. Unsupported custom readers and missing or failed helpers continue through the canonical unexecuted suffix.

The implementation remains opt-in with `BIT_RUST_CLIENT_VCS=on`. Explicit legacy tar/import-operation switches set to `off` remain authoritative. These whole-command measurements show no broad speedup.

## Frozen qualification

- Production checkout: `9973ae1a5665079819f64083eddd177954bfcfba`.
- Native source digest: `42d22ed4ce15160a5a9074e4b79012a99508c75c74a4a5e704443aabd86854ad`.
- Official GNU release helper SHA-256: `667c7f40b3eae8629d86f8b8fd7045b27cf7558b197461cbdc7135a8292ff6d4`.
- Correctness report SHA-256: `f4adc39490bdfd2193d90150893bd0d3f517819ad7dc30a9167815fca925bc6e`.

Rust: 236 tests; source adapters: 236 passed and one platform skip; compiled adapters: 237 passed; canonical models: 69; artifact/provision/discovery: 30. Canonical TypeScript and lint checks passed. Transfer-specific source and compiled suites each contain 22 passing tests. CI executes both on Linux, macOS and Windows.

Eight real file/HTTP runs compare Node, native, missing-helper and crashed-helper behavior. They exercise two scopes, main and cross-scope lane export/import, duplicate Sources, BOM/CRLF/binary files, and HTTP persist failure followed by resume. Frozen inflated object bytes, working files, bitmap/config, pending state and histories match. Index comparisons retain every field and duplicate row while sorting only component/lane row insertion order, which already varies during canonical concurrent persistence; reports retain the original index bytes.

Both incoming transports execute four native tar operations and import five native Sources without fallback. Outgoing collection, archive or pending writes, and transaction begin/receipt operations have positive accepted acknowledgments, zero failed acknowledgments, and zero Source body bytes sent through transfer RPC. Four parallel collection tests prove a single pinned transfer session; other client operations can legitimately use additional helper owners.

## Whole-command measurements

Each row is the median of three alternating Node/native pairs after one excluded warm-up pair. Diagnostics are disabled. The entire client VCS switch is compared, including other enabled client operations; these are not isolated transfer microbenchmarks. Wall time and CPU include client Node/helper/Git descendants. RSS is the near-simultaneous sum sampled at 10 ms. The loopback remote server is a separate process, so its CPU and memory are excluded. The deliberately failing HTTP export is setup, not a timing row; its successful resume is measured.

The two real components contain 6 or 518 tracked files in total. Ratios below are native divided by Node; values above one indicate a slower command or higher RSS.

| Storage | Files | Transport | Command             | Node wall ms | Native wall ms | Wall ratio | CPU ratio | RSS ratio |
| ------- | ----: | --------- | ------------------- | -----------: | -------------: | ---------: | --------: | --------: |
| tmpfs   |     6 | file      | main export         |        291.1 |          311.0 |      1.069 |     1.025 |     1.031 |
| tmpfs   |     6 | file      | main import         |        276.7 |          304.4 |      1.100 |     1.167 |     1.113 |
| tmpfs   |     6 | file      | changed main export |        264.7 |          284.2 |      1.074 |     1.118 |     1.070 |
| tmpfs   |     6 | file      | lane export         |        298.4 |          316.6 |      1.061 |     1.050 |     1.053 |
| tmpfs   |     6 | file      | lane switch/import  |        469.7 |          512.6 |      1.091 |     1.063 |     1.032 |
| tmpfs   |     6 | http      | main export         |        305.2 |          318.9 |      1.045 |     1.053 |     1.028 |
| tmpfs   |     6 | http      | main import         |        316.2 |          314.9 |      0.996 |     0.952 |     1.045 |
| tmpfs   |     6 | http      | resume export       |        275.5 |          288.9 |      1.049 |     1.057 |     1.027 |
| tmpfs   |     6 | http      | lane export         |        291.1 |          304.7 |      1.047 |     1.056 |     1.030 |
| tmpfs   |     6 | http      | lane switch/import  |        514.9 |          513.6 |      0.997 |     0.986 |     1.005 |
| tmpfs   |   518 | file      | main export         |        409.4 |          453.6 |      1.108 |     1.097 |     0.991 |
| tmpfs   |   518 | file      | main import         |        407.6 |          426.1 |      1.045 |     1.077 |     1.056 |
| tmpfs   |   518 | file      | changed main export |        368.8 |          382.9 |      1.038 |     0.965 |     1.053 |
| tmpfs   |   518 | file      | lane export         |        394.0 |          424.9 |      1.078 |     1.034 |     1.057 |
| tmpfs   |   518 | file      | lane switch/import  |        923.8 |          965.0 |      1.045 |     1.082 |     1.184 |
| tmpfs   |   518 | http      | main export         |        422.6 |          468.7 |      1.109 |     1.143 |     0.983 |
| tmpfs   |   518 | http      | main import         |        444.9 |          450.1 |      1.012 |     0.983 |     0.986 |
| tmpfs   |   518 | http      | resume export       |        312.7 |          332.8 |      1.065 |     1.100 |     1.062 |
| tmpfs   |   518 | http      | lane export         |        400.1 |          402.9 |      1.007 |     1.100 |     1.093 |
| tmpfs   |   518 | http      | lane switch/import  |        952.8 |          962.1 |      1.010 |     0.993 |     1.024 |
| btrfs   |     6 | file      | main export         |        304.2 |          327.5 |      1.076 |     1.079 |     1.004 |
| btrfs   |     6 | file      | main import         |        282.5 |          306.7 |      1.086 |     1.026 |     1.110 |
| btrfs   |     6 | file      | changed main export |        269.1 |          278.9 |      1.036 |     1.029 |     1.062 |
| btrfs   |     6 | file      | lane export         |        292.9 |          324.7 |      1.109 |     1.079 |     1.085 |
| btrfs   |     6 | file      | lane switch/import  |        475.0 |          514.5 |      1.083 |     1.111 |     1.000 |
| btrfs   |     6 | http      | main export         |        321.1 |          340.1 |      1.059 |     1.132 |     0.983 |
| btrfs   |     6 | http      | main import         |        305.4 |          339.5 |      1.112 |     1.103 |     1.016 |
| btrfs   |     6 | http      | resume export       |        271.4 |          287.8 |      1.060 |     1.088 |     1.056 |
| btrfs   |     6 | http      | lane export         |        293.1 |          312.7 |      1.067 |     1.111 |     1.034 |
| btrfs   |     6 | http      | lane switch/import  |        505.9 |          518.1 |      1.024 |     1.015 |     1.011 |
| btrfs   |   518 | file      | main export         |        474.8 |          526.9 |      1.110 |     1.066 |     1.012 |
| btrfs   |   518 | file      | main import         |        412.2 |          452.0 |      1.096 |     1.161 |     1.031 |
| btrfs   |   518 | file      | changed main export |        381.2 |          439.1 |      1.152 |     1.079 |     1.063 |
| btrfs   |   518 | file      | lane export         |        404.0 |          483.8 |      1.197 |     1.175 |     1.065 |
| btrfs   |   518 | file      | lane switch/import  |       1004.7 |         1073.0 |      1.068 |     1.141 |     1.184 |
| btrfs   |   518 | http      | main export         |        457.3 |          488.4 |      1.068 |     1.040 |     0.989 |
| btrfs   |   518 | http      | main import         |        459.1 |          483.2 |      1.053 |     0.953 |     0.984 |
| btrfs   |   518 | http      | resume export       |        323.6 |          345.9 |      1.069 |     1.162 |     1.071 |
| btrfs   |   518 | http      | lane export         |        425.5 |          434.1 |      1.020 |     1.075 |     1.059 |
| btrfs   |   518 | http      | lane switch/import  |       1045.0 |          994.6 |      0.952 |     0.938 |     1.164 |

## Reproduction

Prepare a physical private CLI using `scripts/rust-object-import/prepare-cli.cjs` and build/package the pinned release helper. Set `TMPDIR` to the private CLI staging parent. Correctness uses `transfer-qualification.cjs CLI HELPER`; timings use `transfer-measure.cjs CLI HELPER REPORT`, with `BIT_TRANSFER_MEASUREMENT_EXTRA_FILES=0` or `256` and `BIT_TRANSFER_MEASUREMENT_SCRATCH` selecting tmpfs or Btrfs. Scripts verify source, compiled modules, helper and harness fingerprints before and after every run.
