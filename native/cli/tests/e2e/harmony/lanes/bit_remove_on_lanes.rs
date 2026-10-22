//! `e2e/harmony/lanes/bit-remove-on-lanes.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, len, parse};

fn remove_flag_in_show(helper: &Helper, id: &str, key: &str) -> bool {
    let show = parse(&helper.run(&format!("show {id} --json")));
    show.as_array()
        .and_then(|arr| {
            arr.iter()
                .find(|item| item["title"] == "configuration")
        })
        .map_or_else(|| show["extensions"].as_array(), |item| item["json"].as_array())
        .unwrap()
        .iter()
        .find(|ext| {
            ext["id"].as_str() == Some("teambit.component/remove")
                || ext["name"].as_str() == Some("teambit.component/remove")
        })
        .and_then(|ext| ext["config"][key].as_bool())
        .unwrap_or(false)
}

fn is_removed_in_show(helper: &Helper, id: &str) -> bool {
    remove_flag_in_show(helper, id, "removed")
}

fn is_remove_on_main_in_show(helper: &Helper, id: &str) -> bool {
    remove_flag_in_show(helper, id, "removeOnMain")
}

/// bit lane command › remove components when on a lane
/// bit lane command › remove a new component on a lane
/// bit lane command › exporting a lane after snapping and then removing a component
#[test]
fn remove_components_when_on_lane_and_export_after_removing() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("snap -m s1");
    helper.native("export");

    helper.native("lane create dev");
    helper.populate_components(3, true, " v2");
    helper.native("snap -m s2");
    let lane = parse(&helper.native("lane show dev --json"));
    assert_eq!(len(&lane["components"]), 3);

    helper.native("remove comp1 --silent");
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(bitmap.get("comp1").is_none());
    assert!(!helper.scopes.local_path.join("comp1").exists());

    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("remove comp1 --silent");
    let lane_new = parse(&helper.native("lane show dev --json"));
    assert_eq!(len(&lane_new["components"]), 1);
    helper.native("export");

    helper.native("snap --unmodified -m s2");
    helper.native("remove comp2 --silent");
    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
}

/// bit lane command › soft remove on lane
/// bit lane command › soft remove on lane-a, then re-creating the component on lane-b
#[test]
fn soft_remove_on_lane_merge_import_and_fork() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");

    helper.native("delete comp2 --silent --lane");
    helper.output_file("comp1/index.js", "");
    helper.run("snap -m s2");
    helper.native("export");
    assert!(helper.native("status").contains("nothing to tag or export"));

    let lane_b_check = helper.clone_workspace();
    helper.native("lane create lane-b");
    let cat_lane_b = parse(&helper.native("cat-lane lane-b"));
    assert_eq!(len(&cat_lane_b["components"]), 1);

    helper.get_cloned_workspace(&lane_b_check);
    helper.run("switch main -x");
    let merge_out = helper.run("lane merge dev --verbose -x");
    assert!(merge_out.contains("soft-removed"), "{merge_out}");
    let list_main = parse(&helper.native("list --json"));
    assert_eq!(len(&list_main), 1);
    assert!(
        !list_main[0]["id"]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.run(&format!("lane import {}/dev -x", helper.scopes.remote));
    let list_imported = parse(&helper.native("list --json"));
    assert_eq!(len(&list_imported), 1);

    helper.native("lane create dev2");
    helper.native("snap --unmodified -m s3");
    let export_out = helper.native("export");
    assert!(!export_out.contains("comp2") && export_out.contains("comp1"), "{export_out}");
}

/// bit lane command › delete main component when on a lane
/// bit lane command › soft remove on lane when another user of the same lane is checking out head
#[test]
fn delete_main_component_on_lane_and_checkout_head_after_soft_remove() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create dev");
    helper.native("snap comp1 --unmodified -m s1");
    helper.native("export");

    let err = helper.cmd("delete comp2 --silent --lane");
    assert!(!err.status.success());
    assert!(format!("{}{}", err.stdout, err.stderr).contains("unable to delete"));

    helper.native("delete comp2 --update-main --silent");
    let list = parse(&helper.native("list --json"));
    assert_eq!(len(&list), 1);
    assert!(
        !list[0]["id"]
            .as_str()
            .unwrap()
            .contains("comp2"),
    );

    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    let before_remove = helper.clone_workspace();
    helper.native("delete comp2 --silent --lane");
    helper.output_file("comp1/index.js", "");
    helper.run("snap -m s2");
    helper.native("export");

    helper.get_cloned_workspace(&before_remove);
    helper.run("import -x");
    let co_out = helper.run("checkout head -x");
    assert!(co_out.contains("removed components (1)"), "{co_out}");
    assert!(!helper.native("list").contains("comp2"));
    assert!(!helper.scopes.local_path.join("comp2").exists());
}

/// bit lane command › soft remove on lane when a forked lane is merging this lane
/// bit lane command › soft remove on lane when a forked lane does not have this comp and is merging this lane
#[test]
fn soft_remove_on_lane_when_forked_lane_merges_and_abort() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create lane-a");
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");
    let before_remove = helper.clone_workspace();

    helper.run("switch lane-a -x");
    helper.output_file("only-a/index.js", "module.exports = () => 'only-a';");
    helper.native("add only-a -i bar/only-a");
    helper.native("snap -m s2");
    helper.native("export");
    helper.native("delete comp2 --silent --lane");
    helper.native("delete bar/only-a --silent --lane");
    helper.output_file("comp1/index.js", "");
    helper.run("snap -m s3");
    helper.native("export");

    helper.get_cloned_workspace(&before_remove);
    let status_lanes = parse(&helper.native("status --lanes --json"));
    assert!(len(&status_lanes["updatesFromForked"]) >= 2);
    helper.native("fetch --lanes");
    let merge_out = helper.native("lane merge lane-a -x --verbose");
    assert!(merge_out.contains("removed components (1)"), "{merge_out}");
    assert!(merge_out.contains("soft-removed"), "{merge_out}");
    assert!(!helper.native("list").contains("comp2"));
    assert!(!helper.scopes.local_path.join("comp2").exists());

    let lane_b = parse(&helper.native("cat-lane lane-b"));
    let has_comp = |name: &str| {
        lane_b["components"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"]["name"].as_str() == Some(name))
    };
    assert!(has_comp("comp2") && !has_comp("bar/only-a"));
    assert!(is_removed_in_show(&helper, "comp2"));
    let status = parse(&helper.native("status --json"));
    let expected = format!("{}/comp2", helper.scopes.remote);
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"].as_str() == Some(expected.as_str())),
    );

    let abort_out = helper.run("lane merge-abort --silent -x");
    assert!(abort_out.contains("added components (1)"), "{abort_out}");
    assert!(helper.scopes.local_path.join("comp2").is_dir());
}

/// bit lane command › soft remove on lane when a forked lane changed it (diverged) and is now merging this lane
#[test]
fn soft_remove_on_lane_when_forked_lane_diverged_and_merges() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("lane create lane-a");
    helper.native("snap -m s1");
    helper.native("export");
    helper.native("lane create lane-b");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    helper.native("export");
    let before_remove = helper.clone_workspace();

    helper.run("switch lane-a -x");
    helper.native("delete comp2 --silent --lane");
    helper.output_file("comp1/index.js", "");
    helper.run("snap -m s2");
    helper.native("export");

    helper.get_cloned_workspace(&before_remove);
    helper.native("snap comp2 --unmodified -m s2-b");
    helper.native("fetch --lanes");
    let before_merge = helper.clone_workspace();

    let out = helper.run("lane merge lane-a -x");
    assert!(out.contains("removed components (1)"), "{out}");
    assert!(!helper.native("list").contains("comp2"));
    assert!(!helper.scopes.local_path.join("comp2").exists());
    assert!(is_removed_in_show(&helper, "comp2"));

    helper.get_cloned_workspace(&before_merge);
    helper.run("lane merge lane-a -x --no-auto-snap");
    let status_no_snap = parse(&helper.native("status --json"));
    assert_eq!(len(&status_no_snap["remotelySoftRemoved"]), 0);
    assert!(helper.scopes.local_path.join("comp2").is_dir());

    let snap_out = helper.run("snap -m snapped-after-merge");
    assert!(snap_out.contains("removed components"), "{snap_out}");
    assert!(!helper.native("list").contains("comp2"));
    assert!(!helper.scopes.local_path.join("comp2").exists());
    assert!(is_removed_in_show(&helper, "comp2"));
}

/// bit lane command › remove on lane with --update-main then merge to main
/// bit lane command › remove on lane with --update-main then merge to another lane
#[test]
fn remove_on_lane_with_update_main_then_merge_to_main_or_another_lane() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    helper.native("lane create lane-a");
    helper.native("snap --unmodified -m s1");
    helper.native("delete comp1 --update-main --silent");
    helper.run("snap -m s2");
    helper.native("export");
    let after_lane_a_export = helper.clone_workspace();

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create lane-b");
    helper.run(&format!("lane merge {}/lane-a -x", helper.scopes.remote));
    let lane_b = parse(&helper.native("cat-lane lane-b"));
    assert!(
        lane_b["components"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["id"]["name"].as_str() == Some("comp1")),
    );
    assert!(is_remove_on_main_in_show(&helper, &format!("{}/comp1", helper.scopes.remote)));

    helper.get_cloned_workspace(&after_lane_a_export);
    helper.run("switch main -x");
    helper.native("lane merge lane-a -x");
    assert!(is_removed_in_show(&helper, "comp1"));
    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    assert!(bitmap.get("comp1").is_none());

    helper.run("export");
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("import {}/comp1 -x", helper.scopes.remote));
    assert!(is_removed_in_show(&helper, "comp1"));
}

/// bit lane command › delete on a lane then merging the deleted component from main
/// bit lane command › delete on a lane with --update-main then merging the deleted component from main when main is ahead
/// bit lane command › delete on a lane, re-import the deleted component, then merge from main
#[test]
fn delete_on_lane_then_merge_from_main_and_recover() {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(2, true, "");
    helper.native("tag -m v1");
    helper.native("export");
    let on_main = helper.clone_workspace();
    helper.native("lane create dev");
    helper.native("snap --unmodified -m s1");
    helper.native("export");
    let (before_delete, remote_before_delete) =
        (helper.clone_workspace(), helper.clone_remote_scope());

    helper.native("delete comp1 --silent --lane");
    helper.run("snap -m s2");
    helper.native("export");
    let (on_lane_deleted, remote_on_lane_deleted) =
        (helper.clone_workspace(), helper.clone_remote_scope());

    helper.get_cloned_workspace(&before_delete);
    helper.restore_remote_scope(&remote_before_delete);
    helper.native("delete comp1 --update-main --silent");
    helper.run("snap -m s2-um");
    helper.native("export");
    let on_lane_update_main = helper.clone_workspace();

    helper.get_cloned_workspace(&on_main);
    helper.native("tag --unmodified -m v2");
    helper.native("export");

    helper.get_cloned_workspace(&on_lane_update_main);
    helper.run("lane merge main -x");
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 2);
    assert!(is_removed_in_show(&helper, "comp1") && is_remove_on_main_in_show(&helper, "comp1"));

    helper.restore_remote_scope(&remote_on_lane_deleted);
    helper.get_cloned_workspace(&on_main);
    helper.native("tag --unmodified -m v2");
    helper.native("export");

    helper.get_cloned_workspace(&on_lane_deleted);
    helper.native("lane merge main -x");
    assert_eq!(len(&parse(&helper.native("status --json"))["stagedComponents"]), 1);

    helper.restore_remote_scope(&remote_on_lane_deleted);
    helper.get_cloned_workspace(&on_main);
    helper.populate_components(1, true, " v3");
    helper.native("tag -m v2");
    helper.native("export");

    helper.get_cloned_workspace(&on_lane_deleted);
    let import_out = helper.native(&format!("import {}/comp1 -x", helper.scopes.remote));
    assert!(
        import_out.contains("marked as deleted") && import_out.contains("bit recover"),
        "{import_out}",
    );
    let merge_out = helper.native("lane merge main -x");
    assert!(merge_out.contains("soft-removed") && merge_out.contains("bit recover"), "{merge_out}");
    helper.native(&format!("recover {}/comp1 -x", helper.scopes.remote));
    let merge_after = helper.run("lane merge main -x --ignore-config-changes");
    assert!(merge_after.contains("Total Merged: 1"), "{merge_after}");
}
