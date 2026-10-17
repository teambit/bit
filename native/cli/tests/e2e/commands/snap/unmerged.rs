//! Pending merge configuration is captured by ordinary snapshot publication.
use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::ffi::OsStr;

const COMMAND: &str = "snap --unmerged --ignore-issues * --message merge";

#[test]
fn pending_package_configuration_matches_node_snap() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.run("tag bar/foo --message base");
    let model = parse(&helper.run("cat-component bar/foo --json"));
    let head = model["head"].as_str().unwrap();
    helper.append_file("bar/foo.js", "\n// merged source");
    let pending = serde_json::json!([{"id":{"scope":"my-scope","name":"bar/foo"},"head":head,"laneId":{"name":"dev","scope":"my-scope"},"mergedConfig":{"teambit.pkg/pkg":{"packageJson":{"description":"merged metadata"}},"teambit.harmony/node":{}}}]);
    std::fs::write(helper.scopes.local_path.join(".bit/unmerged.json"), pending.to_string())
        .unwrap();
    let node_root = helper.clone_workspace();
    let native = helper.native_run(COMMAND);
    let node = Helper::cmd_in_with(&node_root, COMMAND, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    let actual = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected = config::read_jsonc(&node_root.join(".bitmap"));
    let left = actual["bar/foo"]["version"].as_str().unwrap();
    let right = expected["bar/foo"]["version"].as_str().unwrap();
    assert_eq!(native.stdout.replace(left, "HASH"), node.stdout.replace(right, "HASH"));
    assert_eq!(
        actual.to_string().replace(left, "HASH"),
        expected.to_string().replace(right, "HASH"),
    );
    let version = parse(&helper.run("cat-component bar/foo@latest --json"));
    assert!(
        version["extensions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|aspect| aspect["name"] == "teambit.pkg/pkg"
                && aspect["config"]["packageJson"]["description"] == "merged metadata"),
    );
}
