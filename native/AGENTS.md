# The Rust `bit` CLI

`native/` is a Cargo workspace that builds `bit`, a Rust CLI that runs some commands natively and
delegates everything else to the Node.js Bit CLI. Read [docs/rust-cli.md](../docs/rust-cli.md)
before changing a command: it lists every native command, what it declines, and how it finds the
Node.js CLI.

## Scope: never change the Node.js CLI

The Rust CLI must stay mergeable into `teambit/bit` master without touching the Node.js CLI.
Compared with master, a branch may change only:

- `native/`
- `docs/rust-cli.md` and `docs/rust/`
- `scripts/rust/`
- `.github/workflows/rust.yml` and `.github/workflows/rust-scope.yml`

`scripts/rust/check-scope.sh <teambit/bit master ref>` enforces this, and the `Rust scope`
workflow runs it on every pull request and push to `rust-workspace-materialization`. Do not
bring back the in-process integration this CLI replaced:

- no `rust-*.ts` glue, `BIT_RUST_*` or `BIT_NATIVE_INSTALL` flags, or other Node.js changes;
- no napi addon (`native/workspace-napi`) and no binary other than the CLI's (`cli/src/main.rs`):
  the other crates are libraries;
- no stdin/stdout protocol servers for a Node.js caller.

If a native command needs something only JavaScript knows, the CLI's embedded host script
(`cli/src/host/host.js`) asks the installed Node.js CLI, using only modules the published
`@teambit/bit` package ships. A module that exists only in a newer Node.js CLI must make the
command decline, not fail.

## Decline before writing

A native command either reproduces the Node.js CLI exactly or declines, and a decline hands the
untouched workspace to the Node.js CLI (`Outcome::Declined`). So:

- parse the arguments narrowly: an unknown flag, an id form or an input the port does not cover
  declines;
- read, plan and format the report before anything is written or printed;
- after the first write, failures are the command's own and are reported like the Node.js CLI
  reports them, never declined (the Node.js CLI would run the command a second time). The same
  holds for a remote that changed: `bit export` declines only before a remote persists.

## Verify against the Node.js CLI

Parity is checked against a released Node.js CLI, not against this repository's sources:

- `BIT_NATIVE=off bit <command>` runs the Node.js CLI, `BIT_NATIVE_TRACE=1` prints why a command
  ran natively or declined.
- Compare stdout, the exit code and the resulting files (the workspace, `.bit`, and any remote)
  on fresh copies of the same fixture, in a non-interactive run, on a TTY (`script`) for colors,
  and with `CI=1` (status lines are hidden on CI).
- A file remote is shared state: restore it before each run.
- Mask what legitimately differs (new hashes, dates, timings) and say so; Node's order of some
  changed-component lists is not deterministic.
- Oracle tests that run the Node.js CLI's own functions are opt-in:
  `BIT_TEST_SNAPSHOT_CLI=<@teambit/bit installation> cargo test`.

Name the Node.js behavior a port reproduces in its doc comment (`StatusMain.status`,
`ExportCmd.report`, …), and describe what the code does, not how an earlier integration did it.

## Checks

Run from `native/` before every commit:

```sh
node ../scripts/rust/rustfmt.mjs --all -- --check   # pnpm's pinned formatter (write: without `-- --check`)
cargo clippy --locked --workspace --all-targets -- -D warnings
RUSTFLAGS='-D warnings' cargo dylint --all -- --all-targets --workspace   # perfectionist lints
RUSTDOCFLAGS='-D warnings' cargo doc --locked --workspace --no-deps
cargo test --locked --workspace --no-fail-fast
```

`node ../scripts/rust/prepare-pnpm-engine.mjs` prepares pnpm's engine sources once (CI runs it
before building). The perfectionist lints bound function size, nesting and local names: split a
function into steps rather than allowing a lint. Prefer unit tests next to the code
(`<module>/<module>_tests.rs`) and integration tests in `cli/tests/` with a stub Node.js CLI.

When a command's native coverage changes, update its row in the native commands table of
`docs/rust-cli.md`.
