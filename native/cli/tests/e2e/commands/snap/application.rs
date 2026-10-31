//! Published application registration participates in snapshot metadata.
use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::ffi::OsStr;

#[test]
fn node_application_registration_matches_node_snapshot() {
    let helper = Helper::new();
    helper.re_init_workspace_with(false);
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.output_file(
        "bar/foo.node-app.js",
        "module.exports.default = { name: 'foo-app', entry: require.resolve('./foo.js') };\n",
    );
    helper.run("link");
    helper.run("compile");
    config::set_workspace_key(&helper.scopes.local_path, "my-scope/bar/foo", serde_json::json!({}));
    let oracle = helper.clone_workspace();
    let command = "snap bar/foo --ignore-issues * --message application";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stdout, native.stderr);
    assert_eq!(native.stderr, node.stderr);
    let actual = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected = config::read_jsonc(&oracle.join(".bitmap"));
    let left = actual["bar/foo"]["version"].as_str().unwrap();
    let right = expected["bar/foo"]["version"].as_str().unwrap();
    assert_eq!(native.stdout.replace(left, "SNAP_HASH"), node.stdout.replace(right, "SNAP_HASH"));
    let component = |root: &std::path::Path| {
        let run = Helper::cmd_in_with(
            root,
            "cat-component bar/foo@latest --json",
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        let value = parse(&run.stdout);
        value["extensions"].clone()
    };
    assert_eq!(component(&helper.scopes.local_path), component(&oracle));
    assert!(
        component(&oracle)
            .as_array()
            .unwrap()
            .iter()
            .any(|aspect| aspect["name"] == "teambit.harmony/application"
                && aspect["data"]["appName"] == "foo-app"),
    );
}
