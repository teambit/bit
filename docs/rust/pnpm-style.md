# Rust linting and formatting provenance

Rust code uses the same lint and formatting configuration as pnpm/pnpm at commit `23194836797de7de606ab6ab9a03d40e5ee28fe2` (main when fetched on 2026-10-07).

The following files are copied without changes:

- Root `rustfmt.toml`, `rust-toolchain.toml`, and `dylint.toml` into `native/`.
- `pnpm/scripts/rustfmt.mjs` and `rustfmt.json` into `scripts/rust/`.

The `[workspace.lints.rust]` and `[workspace.lints.clippy]` sections of pnpm's root `Cargo.toml` are copied without changes into `native/Cargo.toml`. Every Rust member must inherit these with `[lints] workspace = true`.

The formatter is pnpm's pinned custom rustfmt, not the default formatter shipped with Rust. The perfectionist dylint library and its rules use pnpm's exact pinned configuration, including merged imports and the function/file/nesting limits. Follow the supplementary [pnpm Rust code style guide](https://github.com/pnpm/pnpm/blob/23194836797de7de606ab6ab9a03d40e5ee28fe2/pnpm/CODE_STYLE_GUIDE.md).

Run from `native/`:

```sh
node ../scripts/rust/rustfmt.mjs --all -- --check
cargo clippy --locked --workspace --all-targets -- -D warnings
cargo dylint --all -- --all-targets --workspace
cargo test --locked --workspace
```

To format, omit `-- --check` from the formatter command. The formatter launcher retains pnpm's shared immutable cache directory, so existing installations can be reused.

Source: https://github.com/pnpm/pnpm/tree/23194836797de7de606ab6ab9a03d40e5ee28fe2
