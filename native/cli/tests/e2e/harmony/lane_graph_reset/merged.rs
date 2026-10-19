use super::fixture;
use crate::{
    commands::{add::support::history_oracle, move_paths::support},
    helper::{Helper, remote},
};

fn diverged(no_snap: bool) -> (Helper, String, String) {
    let helper = fixture::workspace(1, true);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    helper.output_file("comp1/index.js", "module.exports='lane-version';\n");
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    let before = fixture::head(&helper, "dev", "comp1");
    support::setup(&helper, "switch main -x");
    helper.output_file("comp1/index.js", "module.exports='main-version';\n");
    support::tag(&helper);
    remote::publish(&helper);
    support::setup(&helper, "switch dev -x");
    let option = if no_snap { " --no-snap" } else { "" };
    support::setup(&helper, &format!("lane merge main --auto-merge-resolve theirs -x{option}"));
    let merged = fixture::head(&helper, "dev", "comp1");
    (helper, before, merged)
}

#[test]
fn all_reset_removes_a_two_parent_merge_and_preserves_merged_bytes_and_objects() {
    let (helper, before, merged) = diverged(false);
    assert_ne!(before, merged);
    let version = fixture::version(&helper, "comp1", &merged);
    let parents = version["parents"].as_array().unwrap();
    assert_eq!(parents.len(), 2);
    let mut refs = parents
        .iter()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    refs.push(merged);
    let objects = fixture::objects(&helper, &refs);
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    assert_eq!(fixture::head(&helper, "dev", "comp1"), before);
    fixture::unchanged(&files);
    fixture::unchanged(&objects);
    fixture::modified_only(&helper, 1);
    fixture::snap(&helper, "comp1");
    let next = fixture::head(&helper, "dev", "comp1");
    assert_eq!(fixture::version(&helper, "comp1", &next)["parents"], serde_json::json!([before]));
    remote::publish(&helper);
    fixture::modified_only(&helper, 0);
}

#[test]
fn head_only_reset_keeps_the_released_multiple_parent_failure() {
    let (helper, _, merged) = diverged(false);
    let files = fixture::sentinels(&helper);
    let result = support::compare(&helper, "reset --head --silent");
    assert!(!result.status.success());
    assert!(result.stderr.contains(&format!(
        "removeComponentVersions found multiple parents for a local (un-exported) version {merged}"
    )));
    assert_eq!(fixture::head(&helper, "dev", "comp1"), merged);
    fixture::unchanged(&files);
}

#[test]
fn ci_all_reset_of_a_two_parent_merge_remains_native_and_preserves_merged_sources_and_objects() {
    let (helper, exported, merged) = diverged(false);
    let version = fixture::version(&helper, "comp1", &merged);
    let parents = version["parents"].as_array().unwrap();
    assert_eq!(parents.len(), 2);
    let mut refs = parents
        .iter()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    refs.push(merged);
    let objects = fixture::objects(&helper, &refs);
    let files = fixture::sentinels(&helper);
    let result =
        history_oracle::compare_ci(&helper, "reset --silent", str::to_owned, ["reset"], false);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(result.native);
    assert_eq!(fixture::head(&helper, "dev", "comp1"), exported);
    fixture::unchanged(&files);
    fixture::unchanged(&objects);
    fixture::modified_only(&helper, 1);
}

#[test]
fn ci_head_only_merge_reset_delegates_the_exact_published_error_and_stack() {
    let (helper, _, merged) = diverged(false);
    let bitmap = support::bitmap(&helper);
    let files = fixture::sentinels(&helper);
    let result = support::compare_ci(&helper, "reset --head --silent", false);
    assert!(!result.status.success());
    assert!(result.trace.contains("CI lane reset diagnostics require the published stack"));
    assert!(result.stderr.contains(&format!(
        "removeComponentVersions found multiple parents for a local (un-exported) version {merged}",
    )));
    assert!(result.stderr.contains("    at "));
    assert_eq!(support::bitmap(&helper), bitmap);
    assert_eq!(fixture::head(&helper, "dev", "comp1"), merged);
    fixture::unchanged(&files);
}

#[test]
fn no_snap_merge_has_no_reset_target_and_retains_the_working_tree() {
    let (helper, before, merged) = diverged(true);
    assert_eq!(before, merged);
    let files = fixture::sentinels(&helper);
    let result = support::compare(&helper, "reset --silent");
    assert!(!result.status.success());
    assert!(result.stderr.contains("no components found to reset"));
    assert_eq!(fixture::head(&helper, "dev", "comp1"), before);
    fixture::unchanged(&files);
    fixture::modified_only(&helper, 1);
}

#[test]
fn ci_stateful_head_only_reset_delegates_before_selection_and_preserves_the_published_stack() {
    let (helper, _, merged) = diverged(false);
    helper.output_file("comp1/index.js", "module.exports='modified-after-two-parent-merge';\n");
    let bitmap = support::bitmap(&helper);
    let files = fixture::sentinels(&helper);
    let result = support::compare_ci(&helper, "reset $modified --head --silent", false);
    assert!(!result.status.success());
    assert!(result.trace.contains("CI lane reset diagnostics require the published stack"));
    assert!(result.stderr.contains(&format!(
        "removeComponentVersions found multiple parents for a local (un-exported) version {merged}",
    )));
    assert!(result.stderr.contains("    at "));
    assert_eq!(support::bitmap(&helper), bitmap);
    assert_eq!(fixture::head(&helper, "dev", "comp1"), merged);
    fixture::unchanged(&files);
}

#[test]
fn fast_forward_reset_returns_to_exported_lane_without_materializing_old_files() {
    let helper = fixture::workspace(1, false);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    let before = fixture::head(&helper, "dev", "comp1");
    support::setup(&helper, "switch main -x");
    support::setup(&helper, &format!("lane merge {}/dev -x", helper.scopes.remote));
    support::tag(&helper);
    remote::publish(&helper);
    helper.output_file("comp1/index.js", "module.exports='main-advanced';\n");
    support::tag(&helper);
    remote::publish(&helper);
    support::setup(&helper, "switch dev -x");
    support::setup(&helper, "lane merge main -x");
    let merged = fixture::head(&helper, "dev", "comp1");
    assert_eq!(
        fixture::version(&helper, "comp1", &merged)["parents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let objects = fixture::objects(&helper, &[before.clone(), merged]);
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    assert_eq!(fixture::head(&helper, "dev", "comp1"), before);
    fixture::unchanged(&files);
    fixture::unchanged(&objects);
    fixture::modified_only(&helper, 1);
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    fixture::modified_only(&helper, 0);
}
