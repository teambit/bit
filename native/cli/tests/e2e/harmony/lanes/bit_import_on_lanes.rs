//! `e2e/harmony/lanes/bit-import-on-lanes.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse};
use serde_json::json;

/// bit lane command › importing a component when checked out to a lane
/// bit lane command › import a non-lane component that has dependencies into a lane
#[test]
fn importing_component_when_checked_out_to_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.populate_components(3, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create dev");
    let before_import = helper.clone_workspace();
    helper.run(&format!("import {}/bar/foo -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("lane show dev --json"))["components"]), 0);
    assert_eq!(len(&parse(&helper.native("list --json"))), 1);
    helper.native("switch main -x");
    assert_eq!(len(&parse(&helper.native("list --json"))), 1);
    helper.get_cloned_workspace(&before_import);
    helper.run(&format!("import {}/bar/foo --save-in-lane -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("lane show dev --json"))["components"]), 1);
    helper.native("switch main -x");
    assert_eq!(len(&parse(&helper.native("list --json"))), 1);
    helper.get_cloned_workspace(&before_import);
    helper.run(&format!("import {}/comp1 --save-in-lane -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("lane show dev --json"))["components"]), 1);
}

/// bit lane command › importing a (non-lane) component from another scope when checked out to a lane
#[test]
fn importing_non_lane_component_from_another_scope_when_on_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    let (another_remote, another_remote_path) = helper.new_bare_scope_connected();
    helper.output_file("bar1/foo1.js", r#"console.log("v1");"#);
    helper.native("add bar1");
    helper.run("compile");
    helper.native("tag -m v1");
    helper.native("export");

    helper.output_file("bar2/foo2.js", r#"console.log("v1");"#);
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({ "bar2": { "defaultScope": &another_remote } }),
    );
    helper.native("add bar2");
    helper.run("compile");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.add_remote(&another_remote_path);
    helper.run(&format!("switch {}/dev -x", helper.scopes.remote));
    helper.native(&format!("import {}/bar1 -x", helper.scopes.remote));

    let list = parse(&helper.native("list --local-scope --json"));
    let expected = format!("{}/bar1", helper.scopes.remote);
    assert!(
        list.as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"].as_str() == Some(expected.as_str())),
    );
}

/// bit lane command › bit-import with no params when checked out to a lane
#[test]
fn bit_import_with_no_params_when_checked_out_to_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, true, "");
    helper.native("snap -m s1");
    let out_new = helper.run("import -x");
    assert!(out_new.contains("nothing to import"), "{out_new}");
    helper.set_workspace_with_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(3, true, "");
    helper.native("snap -m s1");
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev -x", helper.scopes.remote));
    let out_exported = helper.run("import -x");
    assert!(out_exported.contains("successfully imported 3 components"), "{out_exported}");
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap --unmodified -m s1");
    helper.native("export");
    helper.native("switch main -x");
    helper.native("tag --unmodified -m v2");
    helper.native("tag --unmodified -m v3");
    helper.native("export");
    helper.native("switch dev -x");
    helper.delete_path(".bit");
    helper.native("init");
    helper.add_remote_scope();
    helper.run("import -x");
    let local_scope = helper.clone_workspace();
    let comp =
        parse(&helper.native(&format!("cat-component {}/comp1 --json", helper.scopes.remote)));
    let v1_hash = comp["versions"]["0.0.1"]
        .as_str()
        .unwrap()
        .to_owned();
    let v2_hash = comp["versions"]["0.0.2"]
        .as_str()
        .unwrap()
        .to_owned();
    for version in ["0.0.1", "0.0.2", "0.0.3"] {
        let hash = comp["versions"][version].as_str().unwrap();
        assert!(
            !helper
                .cmd(&format!("cat-object {hash}"))
                .status
                .success(),
        );
    }
    helper.native("fetch --lanes --all-history");
    helper.native(&format!("cat-object {v2_hash}"));
    helper.get_cloned_workspace(&local_scope);
    helper.run(&format!("log {}/comp1", helper.scopes.remote));
    helper.native(&format!("cat-object {v1_hash}"));
}

/// bit lane command › import objects for multiple lanes
/// bit lane command › import previous version from main when on a lane
#[test]
fn fetch_multiple_lanes_and_import_previous_or_wildcards_on_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(1, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create lane-a");
    helper.native("snap --unmodified -m s1");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.native("snap --unmodified -m s1");
    helper.native("export");
    let after_first = helper.clone_workspace();
    helper.native("snap --unmodified -m s2");
    helper.native("export");
    let second_b = helper.head_of_lane("lane-b", "comp1");
    helper.native("switch lane-a -x");
    helper.native("snap --unmodified -m s2");
    helper.native("export");
    let second_a = helper.head_of_lane("lane-a", "comp1");
    helper.native("switch main -x");
    helper.native("snap --unmodified -m s2");
    helper.native("export");
    let second_main = helper.head("comp1");
    helper.get_cloned_workspace(&after_first);
    helper.native("fetch --lanes");
    assert_eq!(helper.head_of_lane("lane-a", "comp1"), second_a);
    assert_eq!(helper.head_of_lane("lane-b", "comp1"), second_b);
    assert_eq!(helper.head("comp1"), second_main);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create dev");
    helper.run(&format!("import {}/comp1@0.0.1 -x", helper.scopes.remote));
    helper.run("snap --unmodified -m s1");
    assert_eq!(len(&parse(&helper.native("status --json"))["outdatedComponents"]), 0);
}

/// bit lane command › import with wildcards when a component exists on both, main and lane
/// bit lane command › import with wildcard when a component is on main and user is checked out to a lane
#[test]
fn import_with_wildcards_on_lane_and_lane_only_flag() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("tag -m v1");
    helper.native("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create dev");
    helper.populate_components(1, true, "");
    helper.native("snap -m s1");
    let head_on_lane = helper.head_of_lane("dev", "comp1");
    helper.native("export");
    let before_import = helper.clone_workspace();
    helper.native(&format!("import {}/bar/* -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("list --json"))), 2);
    helper.get_cloned_workspace(&before_import);
    helper.native(&format!("import {}/** -x", helper.scopes.remote));
    assert_eq!(len(&parse(&helper.native("list --json"))), 2);
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert_eq!(bitmap["comp1"]["version"].as_str(), Some(head_on_lane.as_str()));
    helper.get_cloned_workspace(&before_import);
    helper.native(&format!("import {}/** --lane-only -x", helper.scopes.remote));
    let list_lane_only = parse(&helper.native("list --json"));
    assert_eq!(len(&list_lane_only), 1);
    assert_eq!(
        list_lane_only[0]["id"].as_str(),
        Some(format!("{}/comp1", helper.scopes.remote).as_str()),
    );
}
