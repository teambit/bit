//! `e2e/harmony/lanes/lane-multiple-scopes.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse};
use serde_json::json;

/// bit lane multiple scopes › multiple scopes › exporting the lane to the remote
/// bit lane multiple scopes › multiple scopes › when artifacts from older versions are missing locally
/// bit lane multiple scopes › multiple scopes › importing the lane
#[test]
fn multiple_scopes_export_and_import_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope_connected();
    helper.output_file("bar1/foo1.js", r#"console.log("v1");"#);
    helper.output_file("bar2/foo2.js", r#"console.log("v1");"#);
    helper.native("add bar1");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({ "bar2": { "defaultScope": &another_remote } }),
    );
    helper.native("add bar2");
    helper.native("link --rewire");
    helper.native("compile");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.output_file("bar1/foo1.js", r#"console.log("v2");"#);
    helper.output_file("bar2/foo2.js", r#"console.log("v2");"#);
    helper.native("snap -m s1");
    helper.native("export");
    let staged_cfg = helper.scopes.local_path.join(format!(
        ".bit/staged-config/{}/dev.json",
        helper.scopes.remote,
    ));
    if staged_cfg.exists() {
        assert_eq!(len(&config::read_jsonc(&staged_cfg)), 0);
    }
    let remote_lane = Helper::cmd_in(&helper.scopes.remote_path, "cat-lane dev");
    assert!(remote_lane.status.success(), "{remote_lane:?}");
    let lane_json = parse(&remote_lane.stdout);
    let bar2 = lane_json["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"].as_str() == Some("bar2"))
        .unwrap();
    assert_eq!(bar2["id"]["scope"].as_str(), Some(another_remote.as_str()));
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.native(&format!("switch {}/dev -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 0);
}

/// bit lane multiple scopes › multiple scopes when the components are new
#[test]
fn multiple_scopes_when_components_are_new() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope();
    helper.add_remote(&another_remote_path);
    Helper::add_remote_to(&another_remote_path, &helper.scopes.remote_path);
    helper.output_file("bar1/index.js", r#"const bar2 = require("../bar2"); console.log(bar2);"#);
    helper.output_file("bar2/index.js", r#"console.log("v1");"#);
    helper.native("add bar1");
    helper.native(&format!("add bar2 --scope {another_remote}"));
    helper.native("link --rewire");
    helper.native("compile");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["bar2"]["scope"].as_str(), Some(another_remote.as_str()));
    let lane = parse(&helper.native("cat-lane dev"));
    let bar2 = lane["components"]
        .as_array()
        .unwrap()
        .iter()
        .find(|row| row["id"]["name"].as_str() == Some("bar2"))
        .unwrap();
    assert_eq!(bar2["id"]["scope"].as_str(), Some(another_remote.as_str()));
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.run(&format!("switch {}/dev -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 0);
}

/// bit lane multiple scopes › multiple scopes when main is ahead
#[test]
fn multiple_scopes_when_main_is_ahead() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope_connected();
    helper.output_file("bar1/foo1.js", r#"console.log("v1");"#);
    helper.output_file("bar2/foo2.js", r#"console.log("v1");"#);
    helper.native("add bar1");
    helper.native("add bar2");
    helper.native(&format!("scope set {another_remote} bar2"));
    helper.native("compile");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified -m s1");
    helper.native("export");
    let local_scope = helper.clone_workspace();

    helper.re_init_workspace();
    helper.add_remote(&another_remote_path);
    helper.native(&format!("import {another_remote}/bar2 -x"));
    helper.native("tag --unmodified -m v2");
    helper.native("export");

    helper.get_cloned_workspace(&local_scope);
    helper.run("import -x");
    helper.native("snap --unmodified -m s2");
    helper.native("export");
    helper.run("import -x");
}

/// bit lane multiple scopes › multiple scopes when a component in the origin is different than on the lane
/// bit lane multiple scopes › multiple scopes when a scope of the component does not exist
/// bit lane multiple scopes › multiple scopes when the origin-scope exits but does not have the component
#[test]
fn multiple_scopes_origin_conflict_and_non_existent_or_empty_origin_scope() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, _) = helper.new_bare_scope_connected();
    helper.populate_components(1, true, "");
    helper.native(&format!("scope set {another_remote} comp1"));
    let before_export = helper.clone_workspace();

    helper.native("tag -m v1");
    helper.native("export");

    helper.get_cloned_workspace(&before_export);
    helper.native("lane create dev");
    helper.native("snap -m s1");
    let err = helper.cmd("export");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("unable to export a lane with a new component"), "{combined}");

    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("scope set non-exist-scope comp1");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.run("export");

    helper.set_workspace_with_remote_scope();
    let (other_remote, _) = helper.new_bare_scope_connected();
    helper.populate_components(1, true, "");
    helper.native(&format!("scope set {other_remote} comp1"));
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.run("import -x");
}

/// bit lane multiple scopes › multiple scopes - lane-scope does not have main tags
#[test]
fn multiple_scopes_lane_scope_does_not_have_main_tags() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope_connected();
    helper.populate_components(1, false, "");
    helper.native(&format!("scope set {another_remote} comp1"));
    helper.native("tag -m v1");
    helper.native("tag --unmodified -m v2");
    helper.native("tag --unmodified -m v3");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");

    helper.native(&format!("import {another_remote}/comp1 -x"));
    helper.native("snap --unmodified -m s2");

    let status = parse(&helper.native("status --json"));
    for comp in status["stagedComponents"].as_array().unwrap() {
        assert_eq!(
            comp["versions"]
                .as_array()
                .unwrap()
                .len(),
            1,
        );
    }
    helper.native("export");
}
