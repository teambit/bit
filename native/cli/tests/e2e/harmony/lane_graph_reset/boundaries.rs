use super::fixture;
use crate::{commands::move_paths::support, helper::remote};

#[test]
fn resetting_a_new_lane_preserves_its_exported_main_base() {
    let helper = fixture::workspace(1, true);
    remote::publish(&helper);
    let base = support::bitmap(&helper);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "--unmodified comp1");
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&files);
    assert_eq!(
        fixture::bitmap_row(&support::bitmap(&helper), "comp1")["version"],
        fixture::bitmap_row(&base, "comp1")["version"],
    );
    let status = support::json(&helper, "status --json");
    assert!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    fixture::version(&helper, "comp1", "0.0.1");
}

#[test]
fn a_forked_exported_lane_resets_only_its_single_local_snap() {
    let helper = fixture::workspace(1, false);
    support::setup(&helper, "lane create dev");
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    let exported = fixture::head(&helper, "dev", "comp1");
    let objects = fixture::objects(&helper, std::slice::from_ref(&exported));
    support::setup(&helper, "lane create forked");
    fixture::snap(&helper, "--unmodified comp1");
    let staged = support::json(&helper, "status --json");
    assert_eq!(
        staged["stagedComponents"][0]["versions"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    let files = fixture::sentinels(&helper);
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&files);
    fixture::unchanged(&objects);
    assert_eq!(fixture::head(&helper, "dev", "comp1"), exported);
    fixture::unstaged(&helper);
}

#[test]
fn a_new_lane_merged_without_a_known_boundary_preserves_the_exact_fatal_error() {
    let helper = fixture::unknown_inherited();
    let staged = support::json(&helper, "status --json");
    assert_eq!(
        staged["stagedComponents"][0]["versions"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    let files = fixture::sentinels(&helper);
    let result = support::compare(&helper, "reset --silent");
    assert!(!result.status.success());
    assert!(result.stderr.contains("fatal:"));
    fixture::colored_error(&helper, "reset --silent");
    fixture::unchanged(&files);
}

#[test]
fn ci_unknown_inherited_boundary_delegates_the_exact_published_fatal_error_and_stack() {
    let helper = fixture::unknown_inherited();
    let bitmap = support::bitmap(&helper);
    let head = fixture::head(&helper, "unrelated", "comp1");
    let files = fixture::sentinels(&helper);
    let result = support::compare_ci(&helper, "reset --silent", false);
    assert!(!result.status.success());
    assert!(result.trace.contains("CI lane reset diagnostics require the published stack"));
    assert!(result.stderr.contains("fatal: unable to find a new head"));
    assert!(result.stderr.contains("    at "));
    assert_eq!(support::bitmap(&helper), bitmap);
    assert_eq!(fixture::head(&helper, "unrelated", "comp1"), head);
    fixture::unchanged(&files);
}

#[test]
fn resetting_main_does_not_delete_a_foreign_lanes_immutable_snap() {
    let helper = fixture::workspace(1, false);
    fixture::snap(&helper, "comp1");
    remote::publish(&helper);
    fixture::snap(&helper, "--unmodified comp1");
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    helper.output_file("comp1/index.js", "module.exports='foreign-lane';\n");
    fixture::snap(&helper, "comp1");
    let foreign = fixture::head(&helper, "dev", "comp1");
    let objects = fixture::objects(&helper, std::slice::from_ref(&foreign));
    support::setup(&helper, "switch main -x");
    support::setup(&helper, "lane merge dev -x");
    fixture::successful(&helper, "reset --silent");
    fixture::unchanged(&objects);
    support::setup(&helper, "switch dev -x");
    assert_eq!(fixture::head(&helper, "dev", "comp1"), foreign);
    let status = support::json(&helper, "status --json");
    assert!(
        status["modifiedComponents"]
            .as_array()
            .unwrap()
            .is_empty(),
    );
    assert_eq!(
        status["stagedComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(status["stagedComponents"][0]["versions"], serde_json::json!([foreign]));
}
