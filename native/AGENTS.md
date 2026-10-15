# The Rust `bit` CLI

`native/` is a Cargo workspace that builds `bit`, a Rust CLI that runs some commands natively and
delegates everything else to the Node.js Bit CLI. Read [docs/rust-cli.md](../docs/rust-cli.md)
before changing a command: it lists every native command, what it declines, and how it finds the
Node.js CLI. The repository-wide guide ([../CLAUDE.md](../CLAUDE.md)) applies too; this file
specializes it for the Rust code.

## Behavior policy

The Node.js CLI defines Bit's behavior; a native command is a faster implementation of it.

1. **Match observable behavior, not structure.** What must match is what a user or a tool can
   observe: stdout and stderr, colors, exit codes, the files written (the workspace, `.bit`,
   remote scopes) and the order of everything printed. Mirroring the TypeScript decomposition is
   a convenience for cross-referencing, not a requirement.
2. **New behavior belongs to the Node.js CLI first.** A native command does not add flags,
   output or features the Node.js CLI lacks. When the Node.js CLI changes, the port follows it.
3. **Bugs in Bit are reproduced, not fixed, in the port.** If the Node.js CLI behaves oddly (for
   example, `bit export <id>` in 2.2.94 reports "nothing to export" after exporting), either
   reproduce it or decline that input, and point it out; fixing it is a Node.js change.
4. If the intended behavior is unclear or looks wrong, stop and ask rather than guessing.

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

### Tests

- Prefer unit tests next to the code (`<module>/<module>_tests.rs`) and integration tests in
  `cli/tests/` with a stub Node.js CLI.
- No tolerant tests: a test that needs `node` or `git` calls it and lets the missing tool fail
  the test; never probe for it and `return` early. The oracle tests above are the one opt-in
  set, selected by `BIT_TEST_SNAPSHOT_CLI`, not by probing. Gate platform-only tests with
  `#[cfg(...)]` or `#[cfg_attr(..., ignore = "...")]` so the report shows them.
- When temporarily breaking an implementation to prove a test catches the regression, revert
  with `git restore <file>`, never by moving a saved copy back: Cargo's freshness check is
  mtime-based, and a stale binary makes later runs fail in impossible-looking ways. If test
  outcomes flip with no code change, `touch` the source file and rerun first.

## Style

- Warnings are errors (Clippy's pedantic and nursery groups, the perfectionist lints). When a
  lint must be suppressed, use `#[expect(lint, reason = "…")]` with the specific reason, never a
  bare `#[allow(...)]`; split a function into steps instead of suppressing a size lint.
- No `unsafe` without a `// SAFETY:` comment stating the invariant, and a reason it is needed.
- No star imports of modules this workspace owns (`use super::*`); external preludes are fine.
- Doc comments (`///`, `//!`) state the contract. Name the Node.js behavior a port reproduces
  (`StatusMain.status`, `ExportCmd.report`, …) and describe what the code does, not how an
  earlier integration did it. Put implementation-only rationale in `//` comments, and do not
  restate in prose what a test already shows.
- Prefer renaming or extracting a helper over a comment that translates the code.

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
before building). A test failure that also fails on the base branch is reported as such, never
hidden.

When a command's native coverage changes, update its row in the native commands table of
`docs/rust-cli.md`.

## Dependencies

Check `[workspace.dependencies]` and the crates already in `Cargo.lock` before adding one, and
add a dependency to the crate that needs it, not to a shared crate. Do not add a third-party
crate the workspace does not already use without a human's approval. pnpm's engine crates are
pinned to one pnpm commit in `Cargo.toml`; bump them together, never one at a time.

## Commits and pull requests

- Conventional Commits with the `rust` scope: `feat(rust): native bit lane list`,
  `fix(rust): …`, `ci(rust): …`.
- Keep commits focused: a port does not also refactor or reformat unrelated code.
- A pull request says what was verified against the Node.js CLI and how (fixtures, flags,
  masked fields), and what still declines.

## Things not to do

- Do not change files outside the Rust CLI's paths (see Scope), even to make a port easier.
- Do not make a native command print or write something the Node.js CLI would not.
- Do not decline after the first write, or retry a write by delegating to the Node.js CLI.
- Do not disable lints, tests or CI checks (including `Rust scope`) to make a pull request
  green.
