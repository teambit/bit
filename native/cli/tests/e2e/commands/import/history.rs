//! Remote lane refresh retains advanced lane metadata during historical checkout.
use crate::helper::{Helper, config::read_jsonc};
use std::{ffi::OsStr, fs};

#[test]
fn historical_checkout_refreshes_an_advanced_remote_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    helper.tag_without_build("", "--message base");
    crate::helper::remote::publish(&helper);
    helper.run("lane create dev");
    helper.append_file("comp1/index.js", "\n// first lane snap");
    helper.run("snap --message first");
    crate::helper::remote::publish(&helper);
    let old = helper.clone_workspace();
    helper.append_file("comp1/index.js", "\n// second lane snap");
    helper.run("snap --message second");
    crate::helper::remote::publish(&helper);
    helper.get_cloned_workspace(&old);
    let oracle = helper.clone_workspace();
    let command = "checkout 0.0.1 comp1 --force-theirs -x";
    let node = Helper::cmd_in_with(&oracle, command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(node.status.success(), "{}{}", node.stdout, node.stderr);
    let native = helper.native_run(command);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(super::policy::stable(&native.stdout), super::policy::stable(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    assert_eq!(
        read_jsonc(&helper.scopes.local_path.join(".bitmap")),
        read_jsonc(&oracle.join(".bitmap")),
    );
    assert_eq!(
        fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(),
        fs::read(oracle.join("comp1/index.js")).unwrap(),
    );
    let lane = "cat-lane dev";
    let native_lane =
        Helper::cmd_in_with(&helper.scopes.local_path, lane, &[("BIT_NATIVE", OsStr::new("off"))]);
    let node_lane = Helper::cmd_in_with(&oracle, lane, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert_eq!(native_lane.stdout, node_lane.stdout);
}

fn history_fixture() -> (Helper, Vec<String>) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, false, "");
    for index in 1..=3 {
        helper.append_file("comp1/index.js", &format!("\n// version {index}"));
        helper.tag_without_build("", "--message version");
    }
    crate::helper::remote::seed_after_node_export(&helper);
    let model = Helper::cmd_in_with(
        &helper.scopes.local_path,
        "cat-component comp1",
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(model.status.success(), "{}{}", model.stdout, model.stderr);
    let model = metadata(&model.stdout);
    let hashes = model["versions"]
        .as_object()
        .unwrap()
        .values()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    assert_eq!(hashes.len(), 3);
    (helper, hashes)
}

#[test]
fn fetch_all_history_retains_parent_versions_and_sources() {
    let (helper, hashes) = history_fixture();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let oracle = helper.clone_workspace();
    let command = format!("fetch -c {}/comp1 --all-history", helper.scopes.remote);
    let node = Helper::cmd_in_with(
        &oracle,
        &command,
        &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
    );
    assert!(node.status.success(), "{}{}", node.stdout, node.stderr);
    let native =
        Helper::cmd_in_with(&helper.scopes.local_path, &command, &[("CI", OsStr::new("1"))]);
    assert!(native.native, "{}", native.trace);
    assert_eq!(native.status.code(), node.status.code());
    assert_eq!(super::policy::stable(&native.stdout), super::policy::stable(&node.stdout));
    assert_eq!(native.stderr, node.stderr);
    compare_versions(&helper.scopes.local_path, &oracle, &hashes);
}

pub(super) fn compare_versions(
    actual_root: &std::path::Path,
    oracle: &std::path::Path,
    hashes: &[String],
) {
    for hash in hashes {
        let command = format!("cat-object {hash}");
        let expected = Helper::cmd_in_with(
            oracle,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        let actual = Helper::cmd_in_with(
            actual_root,
            &command,
            &[("BIT_NATIVE", OsStr::new("off")), ("CI", OsStr::new("1"))],
        );
        assert!(expected.status.success(), "{}", expected.stderr);
        assert_eq!(actual.status.code(), expected.status.code());
        assert_eq!(actual.stdout, expected.stdout);
        let version = metadata(&actual.stdout);
        for file in version["files"].as_array().unwrap() {
            let hash = file["file"].as_str().unwrap();
            let path = format!(".bit/objects/{}/{}", &hash[..2], &hash[2..]);
            assert_eq!(
                fs::read(actual_root.join(&path)).unwrap(),
                fs::read(oracle.join(&path)).unwrap(),
            );
        }
    }
}

pub(super) fn metadata(text: &str) -> serde_json::Value {
    let start = text.find('{').expect("published JSON object");
    crate::helper::parse(&text[start..])
}

#[test]
fn active_lane_import_renders_dependency_fetch_progress() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.tag_without_build("", "--message base");
    crate::helper::remote::seed_after_node_export(&helper);
    helper.run("lane create dev");
    helper.append_file("comp1/index.js", "\n// lane version");
    helper.run("snap --message lane");
    crate::helper::remote::seed_after_node_export(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run("lane create other");
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let oracle = helper.clone_workspace();
    let command = format!("lane import {}/dev -x", helper.scopes.remote);
    let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(expected.status.success(), "{}{}", expected.stdout, expected.stderr);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(fs::read(oracle.join(".bitmap")).unwrap(), bitmap);
}
