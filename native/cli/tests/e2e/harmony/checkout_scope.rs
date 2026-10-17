//! Discover and materialize new default-scope components during checkout head.
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

#[test]
fn checkout_head_includes_new_components_from_the_default_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports='existing';\n");
    helper.add_component_bar_foo();
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    let old = helper.clone_workspace();
    helper.output_file("new-component/index.js", "module.exports='from scope';\n");
    helper.run("add new-component -i new-component");
    helper.tag_without_build("", "");
    crate::helper::remote::publish(&helper);
    helper.get_cloned_workspace(&old);
    let oracle = helper.clone_workspace();
    let command = "checkout head --include-new-from-scope -x";
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, command, &[("CI", OsStr::new("1"))]);
    let node = Helper::cmd_in_with(
        &oracle,
        command,
        &[("CI", OsStr::new("1")), ("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(native.native, "{}", native.trace);
    assert!(native.status.success(), "{} {} {}", native.stdout, native.stderr, native.trace);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", node.stdout, node.stderr);
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout),
        super::checkout_callbacks::stable_output(&node.stdout),
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        config::read_jsonc(&oracle.join(".bitmap")),
    );
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let directory = bitmap
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == "new-component")
        .unwrap()["rootDir"]
        .as_str()
        .unwrap();
    assert_eq!(
        fs::read(helper.scopes.local_path.join(directory).join("index.js")).unwrap(),
        fs::read(oracle.join(directory).join("index.js")).unwrap(),
    );
}
