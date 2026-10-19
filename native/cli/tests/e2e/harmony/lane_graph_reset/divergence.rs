use super::fixture;
use crate::{
    commands::move_paths::support,
    helper::{Helper, remote},
};

fn exported_ahead() -> (Helper, std::path::PathBuf, String, String) {
    let helper = fixture::workspace(1, false);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    let previous = fixture::head(&helper, "dev", "comp1");
    let reader = helper.clone_workspace();
    fixture::snap(&helper, "--unmodified comp1");
    remote::publish(&helper);
    let remote_head = fixture::head(&helper, "dev", "comp1");
    (helper, reader, previous, remote_head)
}

#[test]
fn reset_a_diverged_exported_lane_uses_its_remote_boundary_and_preserves_disk_bytes() {
    let (helper, reader, _, _) = exported_ahead();
    helper.get_cloned_workspace(&reader);
    helper.output_file("comp1/index.js", "module.exports='local divergence';\n");
    fixture::snap(&helper, "comp1");
    support::setup(&helper, "import -x");
    let status = support::json(&helper, "status --json");
    assert_eq!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&files);
    let status = support::json(&helper, "status --json");
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        status["mergePendingComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
}

#[test]
fn sparse_fork_history_reset_preserves_remote_ancestor_objects() {
    let (helper, remote_head, absent) = sparse_fork();
    absent_versions(&absent);
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&files);
    absent_versions(&absent);
    fixture::version(&helper, "comp1", &remote_head);
    fixture::unstaged(&helper);
    let row = fixture::bitmap_row(&support::bitmap(&helper), "comp1");
    helper.output_file(
        &format!("{}/index.js", row["rootDir"].as_str().unwrap()),
        "module.exports='continued-after-sparse-reset';\n",
    );
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    fixture::modified_only(&helper, 0);
}

fn sparse_fork() -> (Helper, String, Vec<std::path::PathBuf>) {
    let helper = fixture::workspace(1, false);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    support::setup(&helper, "lane create forked");
    fixture::snap(&helper, "--unmodified comp1");
    remote::publish(&helper);
    support::setup(&helper, "switch dev -x");
    let mut intermediate = Vec::new();
    for _ in 0..3 {
        fixture::snap(&helper, "--unmodified comp1");
        intermediate.push(fixture::head(&helper, "dev", "comp1"));
    }
    remote::publish(&helper);
    let remote_head = fixture::head(&helper, "dev", "comp1");
    helper.re_init_workspace();
    helper.add_remote_scope();
    support::setup(&helper, &format!("lane import {}/forked -x", helper.scopes.remote));
    support::setup(&helper, &format!("lane merge {}/dev -x", helper.scopes.remote));
    // The imported head has a body; retain only the two intermediate parent refs.
    intermediate.truncate(2);
    let objects = bit_object_import::scope_path(&helper.scopes.local_path).join("objects");
    let absent = intermediate
        .iter()
        .map(|hash| {
            objects
                .join(&hash[..2])
                .join(&hash[2..])
        })
        .collect();
    (helper, remote_head, absent)
}

fn absent_versions(paths: &[std::path::PathBuf]) {
    assert_eq!(paths.len(), 2);
    for path in paths {
        assert!(!path.try_exists().unwrap(), "intermediate Version exists: {}", path.display());
    }
}

#[test]
fn import_before_local_snap_keeps_the_local_parent_and_reset_uses_the_lane_boundary() {
    let (helper, reader, previous, remote_head) = exported_ahead();
    helper.get_cloned_workspace(&reader);
    support::setup(&helper, "import -x");
    fixture::snap(&helper, "--unmodified comp1");
    let local = fixture::head(&helper, "dev", "comp1");
    assert_ne!(previous, remote_head);
    assert_eq!(
        fixture::version(&helper, "comp1", &local)["parents"],
        serde_json::json!([previous]),
    );
    assert_eq!(
        support::json(&helper, "status --json")["mergePendingComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&files);
    fixture::unstaged(&helper);
}
