use crate::{helper::Helper, known_failure::KnownResult};
use std::ffi::OsStr;

#[test]
fn cli_generate_docs_options_match_pinned_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    for command in [
        "cli generate --docs --metadata",
        "cli generate --docs --metadata.id=cli",
        "cli generate --docs --skill commands",
        "cli generate --docs --skill=reference",
    ] {
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
