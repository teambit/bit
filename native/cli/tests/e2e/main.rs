//! The cases of `e2e/` ported to the native CLI, mirrored by path: `e2e/commands/list.e2e.ts`
//! is `commands/list.rs`. `native/plans/TEST_PORTING.md` tracks which are ported.
//!
//! Each case runs the `bit` binary in a workspace of its own, with the Node.js CLI of
//! `bit-version` behind it (`bvm install <version>`, or `BIT_E2E_NODE_CLI`). Run with
//! `cargo test -p bit-cli --features e2e --test e2e`.

mod commands;
mod flows;
mod harmony;
mod helper;
mod known_failure;
