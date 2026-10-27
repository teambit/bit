//! Upstream hidden cascades also follow visible merge snapshots.
mod cascade;
use crate::helper::{Helper, config, parse};
use std::{ffi::OsStr, fs, path::Path};

fn workspace() -> Helper {
    let (helper, main) = super::hidden_workspace();
    let hidden = hidden_head(&helper);
    helper.get_cloned_workspace(&main);
    helper.run("lane create hidden-descendant");
    helper.run(&format!(
        "lane merge {}/hidden-policy --no-auto-snap --no-squash -x",
        helper.scopes.remote,
    ));
    helper.run("snap --unmodified --message descendant");
    let version = parse(&helper.run("cat-component comp1@latest --json"));
    let previous = hidden.rsplit_once('@').unwrap().1;
    assert!(
        version["parents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|parent| parent == previous),
    );
    assert!(bit_object_import::scope_path(&helper.scopes.local_path).join("last-merged").is_dir());
    crate::helper::remote::publish(&helper);
    assert!(!bit_object_import::scope_path(&helper.scopes.local_path).join("last-merged").exists());
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/hidden-policy -x", helper.scopes.remote));
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    helper.append_file(
        &format!("{}/index.js", directory(&helper.scopes.local_path)),
        "\n// local visible branch\n",
    );
    helper.run("snap comp2 --skip-auto-snap --message visible-branch");
    helper.run(&format!("fetch -c {}/comp1", helper.scopes.remote));
    helper.run(&format!("fetch -c {}/comp2", helper.scopes.remote));
    helper
}

fn hidden_head(helper: &Helper) -> String {
    let lane = Helper::cmd_in_with(
        &helper.scopes.remote_path,
        "cat-lane hidden-policy",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(lane.status.success(), "{} {}", lane.stdout, lane.stderr);
    let lane = parse(&lane.stdout);
    lane["updateDependents"]
        .as_array()
        .unwrap()
        .first()
        .unwrap()
        .as_str()
        .unwrap()
        .to_owned()
}

#[test]
fn hidden_fast_forward_cascades_when_the_visible_merge_changes_its_older_dependency() {
    let helper = workspace();
    let oracle = helper.clone_workspace();
    let command = format!(
        "lane merge {}/hidden-descendant --no-squash --message merged -x",
        helper.scopes.remote,
    );
    let node = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    let native = helper.native_run(&command);
    assert_eq!(native.status.code(), node.status.code(), "{} {}", native.stderr, node.stderr);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    assert_eq!(native.stderr, node.stderr);
    let actual = hash(&helper.scopes.local_path);
    let expected = hash(&oracle);
    assert_eq!(
        super::stable(&native.stdout.replace(&actual, "NEW_SNAP")),
        super::stable(&node.stdout.replace(&expected, "NEW_SNAP")),
    );
    compare(&helper, &oracle, &actual, &expected);
    cascade::compare(&helper, &oracle, &actual);
    compare_lane(&helper, &oracle, &actual, &expected);
}

fn hash(root: &Path) -> String {
    config::read_jsonc(&root.join(".bitmap"))["comp2"]["version"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn compare(helper: &Helper, oracle: &Path, actual: &str, expected: &str) {
    assert_eq!(
        config::read_jsonc(&helper.scopes.local_path.join(".bitmap"))
            .to_string()
            .replace(actual, "NEW_SNAP"),
        config::read_jsonc(&oracle.join(".bitmap")).to_string().replace(expected, "NEW_SNAP"),
    );
    let id = format!("{}/comp2", helper.scopes.remote);
    assert_eq!(
        super::cascade::version(&helper.scopes.local_path, &id)
            .to_string()
            .replace(actual, "NEW_SNAP"),
        super::cascade::version(oracle, &id).to_string().replace(expected, "NEW_SNAP"),
    );
    assert_eq!(
        fs::read(
            helper.scopes.local_path
                .join(directory(&helper.scopes.local_path))
                .join("index.js")
        )
        .unwrap(),
        fs::read(
            oracle
                .join(directory(oracle))
                .join("index.js")
        )
        .unwrap(),
    );
    assert!(!helper.scopes.local_path.join("comp1").exists());
    assert!(!oracle.join("comp1").exists());
}

fn directory(root: &Path) -> String {
    config::read_jsonc(&root.join(".bitmap"))["comp2"]["rootDir"]
        .as_str()
        .unwrap()
        .to_owned()
}

fn compare_lane(helper: &Helper, oracle: &Path, actual: &str, expected: &str) {
    let command = "cat-lane hidden-policy";
    let native = Helper::cmd_in_with(
        &helper.scopes.local_path,
        command,
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    let node = Helper::cmd_in_with(oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(native.status.success(), "{} {}", native.stdout, native.stderr);
    assert!(node.status.success(), "{} {}", node.stdout, node.stderr);
    let actual_lane = parse(&native.stdout.replace(actual, "NEW_SNAP"));
    let mut expected_lane = parse(&node.stdout.replace(expected, "NEW_SNAP"));
    let actual_hidden = actual_lane["updateDependents"].as_array().unwrap();
    assert_eq!(actual_hidden.len(), 1);
    assert_eq!(
        expected_lane["updateDependents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    expected_lane["updateDependents"] = actual_lane["updateDependents"].clone();
    assert_eq!(actual_lane, expected_lane);
}
