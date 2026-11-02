//! The cases of `e2e/` ported to the native CLI ([`commands`], [`flows`], [`functionalities`], [`harmony`], [`helper`], [`known_failure`]), mirrored by path: `e2e/commands/list.e2e.ts`
//! is `commands/list.rs`. `native/plans/TEST_PORTING.md` tracks which suites are ported.
//!
//! Each case runs the `bit` binary in an isolated workspace of its own, with the Node.js CLI of
//! `bit-version` behind it (`bvm install <version>`, or `BIT_E2E_NODE_CLI`). Run with
//! `cargo test -p bit-cli --features e2e --test e2e`.

/// End-to-end CLI command parity suites.
mod commands;
/// End-to-end multi-command workflow parity suites.
mod flows;
/// End-to-end cross-feature functionality parity suites.
mod functionalities;
/// End-to-end Harmony workspace, lane, and scope parity suites.
mod harmony;
mod helper;
mod known_failure;
