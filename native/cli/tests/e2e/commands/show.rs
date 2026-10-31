//! Released `ShowCmd` argument handling before component loading.

use crate::helper::Helper;
use std::{ffi::OsStr, fs};

#[test]
fn show_help_and_argument_errors_match_released_node() {
    let helper = Helper::new();
    let outside = helper.scopes.e2e_dir.join("outside-show-help");
    fs::create_dir_all(&outside).unwrap();
    let (_, bare_scope) = helper.new_bare_scope();
    helper.re_init_workspace();
    let ci_env = [("CI", OsStr::new("1"))];
    let color_env = [("FORCE_COLOR", OsStr::new("1"))];
    for directory in [&outside, &bare_scope, &helper.scopes.local_path] {
        for command in [
            "show",
            "show -j",
            "show --legacy",
            "show --remote",
            "show --browser",
            "show --compare",
            "show --json --remote",
            "show -j -l -r -b -c",
            "show --no-color",
            "show sample --no-color",
            "show --help",
            "show -h",
            "show sample --help",
            "show sample -h",
            "show --json --help",
            "show sample -j --help",
            "show --legacy --remote -h",
            "show sample --legacy --remote -h",
            "show --no-color --help",
            "show sample --no-color --help",
        ] {
            for native_env in [&[][..], &ci_env[..], &color_env[..]] {
                let mut node_env = vec![("BIT_NATIVE", OsStr::new("off"))];
                node_env.extend_from_slice(native_env);
                let node = Helper::cmd_in_with(directory, command, &node_env);
                let native = Helper::cmd_in_with(directory, command, native_env);
                assert!(native.native, "{command}: node={node:?}; native={native:?}");
                assert_eq!(native.status.code(), node.status.code(), "{command}");
                assert_eq!(native.stdout, node.stdout, "{command}");
                assert_eq!(native.stderr, node.stderr, "{command}");
            }
        }
    }
}
