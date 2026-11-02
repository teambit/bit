//! End-to-end parity tests for `bit cli generate --docs` metadata and skill CLI options.
//!
//! Verifies `--metadata`, `--metadata.id=cli`, and `--skill` output via [`Helper`] and [`KnownResult`].

use crate::{helper::Helper, known_failure::KnownResult};
use std::ffi::OsStr;

/// CLI commands exercised for `bit cli generate --docs` metadata and skill parity.
const DOCS_COMMANDS: [&str; 4] = [
    "cli generate --docs --metadata",
    "cli generate --docs --metadata.id=cli",
    "cli generate --docs --skill commands",
    "cli generate --docs --skill=reference",
];

/// Verifies [`DOCS_COMMANDS`] (`bit cli generate --docs`) metadata and skill options match the pinned `Node.js` CLI via [`Helper`] and [`KnownResult`].
#[test]
fn cli_generate_docs_options_match_pinned_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    for command in DOCS_COMMANDS {
        let node = Helper::cmd_in_with(
            &helper.scopes.local_path,
            command,
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let native = helper.native_run(command);
        assert!(node.status.success(), "{}: {}", command, node.stderr);
        assert!(native.status.success(), "{}: {}", command, native.stderr);
        assert_eq!(native.stdout, node.stdout, "{command}");
    }
    Ok(())
}
