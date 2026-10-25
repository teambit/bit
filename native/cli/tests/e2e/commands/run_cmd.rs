use crate::{helper::Helper, known_failure::KnownResult};
use std::ffi::OsStr;

#[test]
fn run_without_apps_in_component_workspaces_matches_node() -> KnownResult<()> {
    let helper = Helper::new();
    helper.re_init_workspace();
    let workspace = &helper.scopes.local_path;
    for count in [0, 1, 2] {
        if count > 0 {
            helper.populate_components(count, true, "");
        }
        for command in ["run", "run missing-app"] {
            let node =
                Helper::cmd_in_with(workspace, command, &[("BIT_NATIVE", OsStr::new("off"))]);
            let native = Helper::cmd_in(workspace, command);
            assert_eq!(node.status.code(), Some(1), "{command}: {node:?}");
            assert!(native.native, "{command}: {native:?}");
            assert_eq!(native.status.code(), node.status.code(), "{command}");
            assert_eq!(native.stdout, node.stdout, "{command}");
            assert_eq!(native.stderr, node.stderr, "{command}");
        }
    }
    Ok(())
}
