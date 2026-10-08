# Fresh final helper/runtime binding

[Recorded results](packaged-final-proof-results.json) validate the combined **packaged runtime, stage-instrumented native source, and final parsing-error adapter** against actual Bit commands. The integration checkout is `20d25c077` (packaging through `cbd318c7d`, including Windows namespace handling and explicit-target build attestation, plus the stage implementation from `8cbe23e71`); precinct source is explicitly overlaid from `bccdbd770`. The report records the complete source identity, artifact manifest, compiled runtime build descriptor, adapter source hash, and binary hash.

This proof refreshes the independent, already tar-extracted Bit bundle from [the full distribution smoke](https://github.com/zkochan/bit/blob/rust-scanner-discovery/docs/rust/packaged-cli-proof.md). Standard dependency compilation again produced **855 outputs, zero errors**, and CLI version **2.2.93**. The packager itself ran `cargo build --locked --offline --release --workspace --target x86_64-unknown-linux-gnu` in the source checkout, with its target directory explicitly pinned. That exact command is required by the installer and runtime build binding. The fresh explicit-target release helper was packaged, extracted/protocol-tested, and installed by the actual distribution assembler. Its Rust source SHA-256 is `035d2d4b9c674fddbaa33c65b0699b62e1d45801cb199a73df4315efc5801873`, which differs from the earlier frozen guard artifact; its executable SHA-256 is `27b8ca9d27ea063300f903a46c271616d70761fb7034df7f5a7f0558c0277138`. The old artifact was not treated as satisfying this new source/build binding.

Four uncached `status --json` commands passed complete, unnormalized JSON equality:

| Source state               | Legacy    | Packaged                                                              |
| -------------------------- | --------- | --------------------------------------------------------------------- |
| 64 valid sources           | 0 helpers | 1 helper, 64 requests, 64 successful files                            |
| Added malformed TypeScript | 0 helpers | 1 helper, 65 requests, 64 successful files and 1 native `parse_error` |

The malformed source is `const value: = 1;`; equality includes the legacy parsing issue's diagnostic details. Only the owned fixture dependency cache is cleared, and the malformed file is removed afterwards. The fresh stage artifact also passed all **16 real archive installation/discovery tests** and its standalone extraction/protocol smoke. No stage timing option was enabled during these command checks.

Reproduce in a checkout containing the same packaging and native source, with an owned extracted bundle/fixture from the full smoke:

```bash
cargo fetch --locked --manifest-path native/Cargo.toml
python3 scripts/rust-dependency-analysis/artifacts/package-helper.py package --directory /tmp/final-artifacts --target x86_64-unknown-linux-gnu
node scripts/rust-dependency-analysis/packaged-final-proof.cjs \
  '<owned-evidence>/extracted/Bit bundle' '<owned-evidence>/workspace' \
  /tmp/final-artifacts/<fresh-artifact>.tar.gz /tmp/final-proof.json bccdbd770
```

This is a Linux GNU correctness refresh, not a second whole-tar test or a performance/platform claim. The earlier full tar/extraction and rollback proof remains separately frozen and labeled. Platform/Node CI remains a separate gate; legacy remains the default.

The prior host-target executable `ab4aeb1e…` used by frozen performance experiments remains unchanged; this fresh artifact uses a distinct explicit-target Cargo output. All 16 real package tests passed with zero skips, including relocated assembly, source/compiled-module binding, corruption fallback, and the bounded repeated-discovery check.
