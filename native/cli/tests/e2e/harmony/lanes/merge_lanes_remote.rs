//! `e2e/harmony/lanes/merge-lanes-remote.e2e.ts`.

use crate::helper::{FOO_FIXTURE, Helper, config, parse};
use std::path::PathBuf;

fn setup_exported_dev_lane() -> (Helper, PathBuf) {
    let helper = Helper::new();
    helper.set_workspace_with_remote_scope();
    helper.populate_components(3, true, "");
    helper.native("lane create dev");
    helper.native("snap -m s1");
    helper.native("export");
    let author_scope = helper.clone_workspace();
    (helper, author_scope)
}

/// merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main
#[test]
fn merging_remote_lane_into_main_and_exporting() {
    let (helper, _) = setup_exported_dev_lane();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("lane merge {}/dev -x", helper.scopes.remote));

    let comp1_path = helper.scopes.local_path.join(&helper.scopes.remote).join("comp1/index.js");
    assert!(comp1_path.exists());

    let status = parse(&helper.native("status --json"));
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    let lanes = parse(&helper.native("lane list --json"));
    let main_lane = lanes["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lane_row| lane_row["name"].as_str() == Some("main"))
        .unwrap();
    assert_eq!(
        main_lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    let export_out = helper.run("export");
    assert!(!export_out.contains("nothing to export"));

    let comp1_id = format!("{}/comp1", helper.scopes.remote);
    let local_comp1 = parse(&helper.native(&format!("cat-component {comp1_id} --json")));
    let remote_run =
        Helper::cmd_in(&helper.scopes.remote_path, &format!("cat-component {comp1_id} --json"));
    assert!(remote_run.status.success(), "{remote_run:?}");
    let remote_comp1 = parse(&remote_run.stdout);
    assert_eq!(remote_comp1["head"], local_comp1["head"]);
}

/// merge lanes - remote lane operations › export a local lane into a remote scope › merging remote lane into main when components are not in workspace using --workspace flag
#[test]
fn merging_remote_lane_into_main_with_workspace_flag_skips_non_workspace_components() {
    let (helper, _) = setup_exported_dev_lane();
    helper.re_init_workspace();
    helper.add_remote_scope();
    let merge_out =
        helper.native(&format!("lane merge {}/dev --workspace --verbose -x", helper.scopes.remote));
    assert!(merge_out.contains("merge skipped"), "{merge_out}");
    assert!(merge_out.contains("not in the workspace"), "{merge_out}");

    let bitmap = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let comp_count = bitmap
        .as_object()
        .unwrap()
        .iter()
        .filter(|(k, v)| !k.starts_with('_') && v.is_object())
        .count();
    assert_eq!(comp_count, 0);

    let status_out = helper.native("status");
    assert!(status_out.contains("nothing to tag or export"));

    let lanes = parse(&helper.native("lane list --json"));
    let main_lane = lanes["lanes"]
        .as_array()
        .unwrap()
        .iter()
        .find(|lane_row| lane_row["name"].as_str() == Some("main"))
        .unwrap();
    assert_eq!(
        main_lane["components"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
}

/// merge lanes - remote lane operations › export a local lane into a remote scope › importing a remote lane which is ahead of the local lane
#[test]
fn importing_remote_lane_ahead_of_local_lane_and_creating_same_name_lane() {
    let (helper, author_scope) = setup_exported_dev_lane();
    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native(&format!("switch {}/dev -x", helper.scopes.remote));
    let imported_scope = helper.clone_workspace();

    helper.get_cloned_workspace(&author_scope);
    helper.populate_components(3, true, " v2");
    helper.native("snap -m s2");
    helper.native("export");

    helper.get_cloned_workspace(&imported_scope);
    helper.native(&format!("fetch {}/dev --lanes", helper.scopes.remote));
    let status = parse(&helper.run("status --json"));
    assert_eq!(
        status["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    helper.native("checkout head -x");
    helper.native("link");
    let comp1_file = std::fs::read_to_string(
        helper.scopes.local_path.join(&helper.scopes.remote).join("comp1/index.js"),
    )
    .unwrap();
    assert!(comp1_file.contains("comp1 v2"));
    let status_after = parse(&helper.native("status --json"));
    assert_eq!(
        status_after["outdatedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status_after["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );
    assert_eq!(
        status_after["modifiedComponents"]
            .as_array()
            .unwrap()
            .len(),
        0,
    );

    let lane = parse(&helper.native("lane show dev --json"));
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        3,
    );

    let merged = helper.native("lane list --merged");
    assert!(!merged.contains("dev"));
    assert!(merged.contains("none of the lanes is merged"));

    let unmerged = helper.native("lane list --not-merged");
    assert!(unmerged.contains("dev"));
    assert!(!unmerged.contains("all lanes are merged"));

    helper.re_init_workspace();
    helper.add_remote_scope();
    helper.native("lane create dev");
    helper.create_component_bar_foo(FOO_FIXTURE);
    helper.add_component_bar_foo();
    helper.native("snap -m s1");
    let run = helper.native_run("export");
    assert!(!run.status.success());
    let combined = format!("{}{}", run.stdout, run.stderr);
    assert!(combined.contains("unable to merge"), "{combined}");
}
