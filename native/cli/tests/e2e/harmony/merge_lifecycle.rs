//! Complete automatic merge lifecycle agrees with the released CLI on fresh repositories.
use crate::helper::{Helper, config};
use std::{ffi::OsStr, fs};

fn node(helper: &Helper, command: &str) {
    let run = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(run.status.success(), "{command}: {} {}", run.stdout, run.stderr);
}

fn divergent() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';");
    helper.add_component_bar_foo();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    node(&helper, "lane create dev");
    helper.output_file("bar/foo.js", "module.exports = 'lane';");
    node(&helper, "snap bar/foo -m lane");
    crate::helper::remote::publish(&helper);
    node(&helper, "switch main --force-theirs -x");
    helper.output_file("bar/foo.js", "module.exports = 'main';");
    node(&helper, "tag bar/foo -m main");
    crate::helper::remote::publish(&helper);
    helper
}

#[test]
fn automatic_lane_merge_materializes_then_snaps_like_node() {
    let helper = divergent();
    compare(&helper, "lane merge dev --auto-merge-resolve theirs -m merged -x");
}

fn compare(helper: &Helper, command: &str) {
    let oracle = helper.clone_workspace();
    let native = helper.native_run(command);
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(
        native.status.code(),
        node.status.code(),
        "native {} {}\nNode {} {}",
        native.stdout,
        native.stderr,
        node.stdout,
        node.stderr,
    );
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let expected = config::read_jsonc(&oracle.join(".bitmap"));
    let hash = bitmap["bar/foo"]["version"].as_str().unwrap();
    let reference = expected["bar/foo"]["version"].as_str().unwrap();
    assert_eq!(
        super::checkout_callbacks::stable_output(&native.stdout.replace(hash, "HASH")),
        super::checkout_callbacks::stable_output(&node.stdout.replace(reference, "HASH")),
    );
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        bitmap.to_string().replace(hash, "HASH"),
        expected.to_string().replace(reference, "HASH"),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("bar/foo.js")).unwrap(),
        fs::read(oracle.join("bar/foo.js")).unwrap(),
    );
    assert_eq!(version(&helper.scopes.local_path), version(&oracle));
}

fn version(root: &std::path::Path) -> serde_json::Value {
    let mut value = super::snapshot_environments::version(root);
    if let Some(logs) = value["modified"].as_array_mut() {
        for log in logs {
            log.as_object_mut()
                .unwrap()
                .remove("date");
        }
    }
    value
}

fn divergent_component() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo("module.exports = 'base';");
    helper.add_component_bar_foo();
    node(&helper, "tag bar/foo -m base");
    crate::helper::remote::publish(&helper);
    let base = helper.clone_workspace();
    helper.output_file("bar/foo.js", "module.exports = 'remote';");
    node(&helper, "snap bar/foo -m remote");
    crate::helper::remote::publish(&helper);
    helper.get_cloned_workspace(&base);
    helper.output_file("bar/foo.js", "module.exports = 'local';");
    node(&helper, "snap bar/foo -m local");
    node(&helper, "import -o");
    helper
}

#[test]
fn component_merge_globs_and_state_predicates_match_node() {
    for pattern in ["**/bar/*", "**,!missing/*", "$snappedOnMain AND **/bar/*"] {
        let helper = divergent_component();
        compare(&helper, &format!(r#"merge "{pattern}" --auto-merge-resolve theirs -m merged -x"#));
    }
}
