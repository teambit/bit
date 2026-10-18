use super::{command, exported, file, untrack};
use crate::{
    commands::{diff_completion::http, move_paths::support},
    helper::Helper,
};
use std::fs;
fn occupied() -> (Helper, serde_json::Value) {
    let helper = exported(1);
    support::setup(&helper, &command(&helper, "comp1", ""));
    let entry = untrack(&helper, "comp1");
    fs::write(file(&helper, &entry, "sentinel.txt"), "occupied directory remains\n").unwrap();
    (helper, entry)
}
#[test]
fn an_untracked_nonempty_destination_is_rejected_without_the_relocation_flag() {
    let (helper, _) = occupied();
    let result = support::compare_declined(
        &helper,
        &command(&helper, "comp1", ""),
        super::output::durations,
    );
    assert!(!result.status.success());
    assert!(result.stderr.contains("the directory is not empty"));
}
#[test]
fn write_to_empty_directory_rejects_override_and_explicit_path() {
    for (flag, message) in [
        ("--override", "--override and --write-to-empty-dir cannot be used together"),
        ("--path some-dir", "--path and --write-to-empty-dir cannot be used together"),
    ] {
        let (helper, _) = occupied();
        let result = super::compare(
            &helper,
            &command(&helper, "comp1", &format!("--write-to-empty-dir {flag}")),
        );
        assert!(!result.status.success());
        assert!(result.stderr.contains(message));
    }
}
#[test]
fn write_to_empty_directory_increments_the_destination_and_preserves_all_original_bytes() {
    let (helper, original) = occupied();
    relocate(&helper, &original, 1);
}
#[test]
fn http_write_to_empty_directory_skips_multiple_occupied_candidates() {
    let (helper, original) = occupied();
    let occupied = format!("{}_1", original["rootDir"].as_str().unwrap());
    helper.output_file(&format!("{occupied}/second-sentinel.txt"), "second occupied candidate\n");
    let _server = http::start(&helper);
    relocate(&helper, &original, 2);
    assert_eq!(
        fs::read(helper.scopes.local_path.join(occupied).join("second-sentinel.txt")).unwrap(),
        b"second occupied candidate\n",
    );
}
fn relocate(helper: &Helper, original: &serde_json::Value, increment: usize) {
    let bytes = fs::read(file(helper, original, "index.js")).unwrap();
    super::successful(helper, &command(helper, "comp1", "--write-to-empty-dir"));
    let after = support::bitmap(helper);
    assert_eq!(
        after["comp1"]["rootDir"],
        format!("{}_{increment}", original["rootDir"].as_str().unwrap()),
    );
    assert_eq!(fs::read(file(helper, original, "index.js")).unwrap(), bytes);
    assert_eq!(
        fs::read(file(helper, original, "sentinel.txt")).unwrap(),
        b"occupied directory remains\n",
    );
    assert_eq!(fs::read(file(helper, &after["comp1"], "index.js")).unwrap(), bytes);
}
