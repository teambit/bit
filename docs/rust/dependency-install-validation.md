# Isolated install acceptance gate

Updated completion: [final work-package checklist](completion-checklist.md) and [final command acceptance](final-command-acceptance.md). This report retains its historical inputs and results; later evidence supersedes its open follow-ups.

`install-validation.cjs` runs the real Bit CLI in a Linux network namespace. Its package-manager observer delegates to the original `@pnpm/napi` installer; it does not implement a fake successful install. The helper remains explicitly opt-in. Correctness and native participation must pass before this lane can support install timing claims.

```sh
node scripts/rust-dependency-analysis/install-validation.cjs \
  /tmp/bit-rust-cli-source \
  /absolute/path/bit-dependency-scanner \
  /tmp/install-validation-result.json \
  --legacy-umbrella /existing/bvm/node_modules/@teambit/legacy
```

The CLI input must be a private build with `.bit-rust-private-build.json`; compiled module hashes are checked. The driver copies the complete installed snapshot into an owned temporary baseline, then gives each variant a fresh physical/reflink copy at the same absolute workspace path. Absolute internal symlinks are rerouted; dangling internal aliases are preserved, dangling external aliases pruned, and live external aliases rejected. The optional existing legacy umbrella package is fully copied into this baseline, with separate source-path/version/member-hash provenance. The driver never installs in the supplied snapshot, BVM tree, or user checkout.

Each real command runs in `unshare -Urn`, so it and descendants have no external network interface. Unsupported hosts fail the gate. The command is `install --lockfile-only --skip-import --skip-compile --skip-write-config-files`. An empty dependency cacache is asserted before each variant. An identical comment is appended to the owned `generate-tree-madge.ts` source to attempt invalidating model dependency reuse without changing imports or installed package requirements. This does not assume extraction occurred: the observer separately counts actual `generateTree` calls, helper starts/requests/outcomes, and package-manager calls.

Private store/cache paths and disabled global virtual store are requested in `pnpm-workspace.yaml`, `.npmrc`, and environment configuration. Before forwarding an observed install call, the observer refuses store/cache paths outside the private workspace. Registry credentials and proxy configuration are excluded from that trace. The native config reader honors the YAML camel-case settings; a direct config-only experiment found that the `.npmrc` and environment store overrides did not change its defaults.

Acceptance requires both real commands to succeed, native helper requests with successful outcomes, real lockfile-only installer calls, exact dependency-cache records and project inputs, and matching resulting lockfile bytes. Empty observations cannot pass. Commands have two-minute timeouts and bounded output. Owned copies are removed after completion. Reports contain dependency/project data and bounded failure output; keep them private when workspace data is sensitive. The script produces no install timing or speedup result.

## Current result

The October 8, 2026 Linux/x64 probe used Node 24.21.0, a private CLI built from current `rust` with the isolated builder, and the release helper. The builder already copies the BVM-installed `@teambit/legacy` 2.1.0 package that the checkout links to externally. The `--legacy-umbrella` option is still passed so that provenance stays explicit. Before this probe, linking failed because that package was missing, and an intermediate probe correctly refused the shared default store.

**Tracing correction.** An earlier probe recorded zero `generateTree` calls, zero helper starts and zero installer calls for both variants, despite 334 new dependency-cache records. That was a tracer artifact. A failed Bit command forks its detached analytics sender (`legacy.analytics/dist/analytics-sender.js`). `fork()` passes on the `--require` preloads, so the tracers loaded in that child, and its later exit overwrote both trace files with its own zeros. Traces are now written only by the process that started them (`BIT_COMMAND_BENCH_TRACE_OWNER`). The same fix applies to the command and invalidation benchmark traces, whose successful commands do not fork the sender.

**Observed with the fix.** Both variants loaded all components and ran real dependency analysis. The legacy run made 334 `generateTree` calls. The Rust run made 668, started 4 helpers and sent 5,892 native requests: 5,854 successful scans and 38 explicit unsupported fallbacks. Each variant then made one lockfile-only installer call with private store/cache paths. Inside the installer, both failed fetching React metadata from `node-registry.bit.cloud`: the namespace's network denial rejected the connection (`Network is unreachable`, error 101). The lockfile bytes were unchanged and equal.

**Parity.** The strict gate fails on dependency-cache records (7 of 334 differ) and on installer project inputs, but only in array order. After sorting arrays, Rust's records and inputs equal legacy's exactly. A legacy-versus-legacy control run shows the same instability: 6 records differ only in array order. Tree-call counts also vary between legacy runs (334 in the comparison run, 668 in the control). Strict whole-record equality therefore cannot pass even without Rust, as with `graph --json` before PR #20. Order-insensitive equality is recorded only as a diagnostic; the gate stays strict.

Install acceptance remains open. There is no successful no-network install and no install benchmark. Follow-up needs:

- a self-contained package metadata/lockfile baseline that succeeds under network denial;
- deterministic ordering of install-time dependency data, or an explicitly approved order-insensitive contract.

A compact observed result, including the control comparison, is recorded in [dependency-install-validation-results.json](dependency-install-validation-results.json).
