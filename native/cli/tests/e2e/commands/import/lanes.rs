//! Main and implicit lane fetches preserve fetch ordering and lane-first result ordering.
use crate::helper::{Helper, config::read_jsonc};
use std::{ffi::OsStr, fs};

fn fixture() -> Helper {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, false, "");
    helper.output_file("comp1/index.js", "module.exports = 'one';");
    helper.tag_without_build("", "--message main");
    crate::helper::remote::seed_after_node_export(&helper);
    for (name, file) in [("dev", "comp1/index.js"), ("zeta", "comp2/index.js")] {
        helper.run(&format!("lane create {name}"));
        helper.append_file(file, &format!("\n// {name} version"));
        helper.run("snap --message lane");
        crate::helper::remote::seed_after_node_export(&helper);
        helper.run("switch main --skip-fetch -x");
    }
    let old = helper.clone_workspace();
    helper.append_file("comp2/index.js", "\n// new main version");
    helper.tag_without_build("comp2", "--message update");
    crate::helper::remote::seed_after_node_export(&helper);
    helper.get_cloned_workspace(&old);
    helper
}

#[test]
fn fetch_main_and_tracked_lanes_matches_canonical_groups() {
    let helper = fixture();
    let old = helper.clone_workspace();
    for ids in [
        "main".to_owned(),
        String::new(),
        format!("main {}/dev", helper.scopes.remote),
        "dev".to_owned(),
    ] {
        helper.get_cloned_workspace(&old);
        let oracle = helper.clone_workspace();
        let command = format!("fetch {ids} --lanes");
        let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
        assert!(expected.status.success(), "{command}: {}{}", expected.stdout, expected.stderr);
        let actual = helper.native_run(&command);
        assert_eq!(actual.status.code(), expected.status.code(), "{command}");
        assert_eq!(
            super::policy::stable(&actual.stdout),
            super::policy::stable(&expected.stdout),
            "{command}",
        );
        assert_eq!(actual.stderr, expected.stderr, "{command}");
        assert_eq!(
            read_jsonc(&helper.scopes.local_path.join(".bitmap")),
            read_jsonc(&oracle.join(".bitmap")),
        );
        for file in ["comp1/index.js", "comp2/index.js"] {
            assert_eq!(
                fs::read(helper.scopes.local_path.join(file)).unwrap(),
                fs::read(oracle.join(file)).unwrap(),
            );
        }
    }
}

#[test]
fn lane_all_history_retains_parent_versions_and_sources() {
    let helper = fixture();
    let lane = Helper::cmd_in_with(
        &helper.scopes.remote_path,
        "cat-lane dev",
        &[("BIT_NATIVE", OsStr::new("off"))],
    );
    assert!(lane.status.success(), "{}{}", lane.stdout, lane.stderr);
    let lane = super::history::metadata(&lane.stdout);
    let mut current = lane["components"][0]["head"]
        .as_str()
        .unwrap()
        .to_owned();
    let mut hashes = Vec::new();
    loop {
        let object = Helper::cmd_in_with(
            &helper.scopes.remote_path,
            &format!("cat-object {current}"),
            &[("BIT_NATIVE", OsStr::new("off"))],
        );
        assert!(object.status.success(), "{}{}", object.stdout, object.stderr);
        hashes.push(current);
        let version = super::history::metadata(&object.stdout);
        let Some(parent) = version["parents"]
            .as_array()
            .and_then(|rows| rows.first())
            .and_then(serde_json::Value::as_str)
        else {
            break;
        };
        current = parent.to_owned();
    }
    assert!(hashes.len() >= 2);
    helper.re_init_workspace();
    helper.add_remote_scope();
    let oracle = helper.clone_workspace();
    let command = format!("fetch {}/dev --lanes --all-history", helper.scopes.remote);
    let expected = Helper::cmd_in_with(&oracle, &command, &[("BIT_NATIVE", OsStr::new("off"))]);
    assert!(expected.status.success(), "{}{}", expected.stdout, expected.stderr);
    let actual = helper.native_run(&command);
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(super::policy::stable(&actual.stdout), super::policy::stable(&expected.stdout));
    assert_eq!(actual.stderr, expected.stderr);
    super::history::compare_versions(&helper.scopes.local_path, &oracle, &hashes);
}
