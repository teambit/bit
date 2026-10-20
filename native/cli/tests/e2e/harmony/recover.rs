//! `e2e/harmony/recover.e2e.ts`.

use crate::helper::{Helper, config, parse, remote};

/// bit recover command › recover before snapping
#[test]
fn recover_before_snapping() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);

    helper.native("delete comp2 --silent");
    helper.native("recover comp2");
    helper.run("link");

    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["locallySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 2);
}

/// bit recover command › recover after snapping
/// bit recover command › remove after recovering
#[test]
fn recover_after_snapping_and_remove_after_recovering() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);

    helper.native("delete comp2 --silent");
    helper.output_file("comp1/index.js", "");
    helper.run("tag --message second");
    helper.native(&format!("recover {}/comp2", helper.scopes.remote));

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(!bitmap["comp2"].is_null());
    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["remotelySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id
                .as_str()
                .is_some_and(|s| s.contains("comp2"))),
    );
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 2);

    helper.run("tag --message third");
    remote::publish(&helper);
    helper.native("delete comp2 --silent");
    let show = helper.run("show comp2");
    assert!(show.contains("removed") || show.contains("true"));
}

/// bit recover command › export the soft-remove component, start a new workspace and recover from there
/// bit recover command › import soft-removed component
#[test]
fn export_soft_removed_and_recover_or_import() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);

    helper.native("delete comp2 --silent");
    helper.output_file("comp1/index.js", "");
    helper.run("tag --message second");
    remote::publish(&helper);

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("recover {}/comp2", helper.scopes.remote));
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 1);
    let status = parse(&helper.run("status --json"));
    assert!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id
                .as_str()
                .is_some_and(|s| s.contains("comp2"))),
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("import {}/comp2 -x", helper.scopes.remote));
    let status_imported = parse(&helper.run("status --json"));
    assert_eq!(
        status_imported["remotelySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        status_imported["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    helper.native("recover comp2");
    let status_recovered = parse(&helper.run("status --json"));
    assert_eq!(
        status_recovered["remotelySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status_recovered["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

/// bit recover command › recover on a lane
#[test]
fn recover_on_a_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create dev");
    helper.populate_components(2, true, "");
    helper.run("snap --message s1");
    remote::publish(&helper);

    helper.native("delete comp2 --lane --silent");
    helper.native("recover comp2");
    helper.run("link");
    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["locallySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 2);

    helper.native("delete comp2 --lane --silent");
    helper.output_file("comp1/index.js", "");
    helper.run("snap --message s2");
    helper.native(&format!("recover {}/comp2", helper.scopes.remote));
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(!bitmap["comp2"].is_null());
    let status_after = parse(&helper.run("status --json"));
    assert_eq!(
        status_after["remotelySoftRemoved"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert!(
        status_after["modifiedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|id| id
                .as_str()
                .is_some_and(|s| s.contains("comp2"))),
    );

    helper.native("delete comp2 --lane --silent");
    helper.run("snap --message s3");
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    helper.native(&format!("recover {}/comp2", helper.scopes.remote));
    let list_imported = parse(&helper.run("list --json"));
    assert_eq!(list_imported.as_array().unwrap().len(), 2);
}

/// bit recover command › remove in one lane, recover in other lane, then merged to the first lane
/// bit recover command › remove in one lane, recover in an empty lane
#[test]
fn recover_across_lanes_and_empty_lane_error() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.run("lane create lane-a");
    helper.populate_components(2, true, "");
    helper.run("snap --message s1");
    remote::publish(&helper);

    helper.run("lane create lane-b");
    helper.run("snap --unmodified --message s2");
    remote::publish(&helper);

    helper.run("switch lane-a -x");
    helper.native("delete comp1 --lane --silent");
    helper.run("snap --message s3");
    remote::publish(&helper);

    helper.run("switch lane-b -x");
    helper.run("lane merge lane-a -x --message m1");
    helper.native(&format!("recover {}/comp1", helper.scopes.remote));
    helper.run("snap --message s4");
    remote::publish(&helper);
    helper.run("switch lane-a -x");
    helper.run("lane merge lane-b --message m2");
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 2);

    helper.native("delete comp1 --lane --silent");
    helper.run("snap --message s5");
    remote::publish(&helper);
    helper.run("lane create lane-empty");
    let err = helper.cmd(&format!("recover {}/comp1", helper.scopes.remote));
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("unable to find the component"), "{combined}");
}

/// bit recover command › recover diverged component before snapping
/// bit recover command › recover multiple components using pattern
#[test]
fn recover_diverged_and_pattern_matching() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.run("tag --message first");
    remote::publish(&helper);

    helper.native("delete comp1 --silent");
    helper.native("delete comp2 --silent");
    helper.native("delete comp3 --silent");
    let out = helper.native(r#"recover "**""#);
    assert!(out.contains("successfully recovered"));
    assert!(out.contains("comp1") && out.contains("comp2") && out.contains("comp3"));

    helper.native("delete comp1 --silent");
    helper.native("delete comp2 --silent");
    helper.output_file("comp3/index.js", "");
    helper.run("tag --message second");
    helper.native(&format!("recover {}/*", helper.scopes.remote));
    let list = parse(&helper.run("list --json"));
    assert_eq!(list.as_array().unwrap().len(), 3);

    let err = helper.cmd("recover nonexistent*");
    assert!(!err.status.success());
    let combined = format!("{}{}", err.stdout, err.stderr);
    assert!(combined.contains("no soft-deleted components found"), "{combined}");
}
