use crate::{
    commands::move_paths::support,
    helper::{Helper, remote},
};
use std::fs;

fn fixture() -> Helper {
    let helper = support::workspace(1, false);
    support::setup(&helper, "lane create lane-a");
    helper.output_file("comp1/index.js", "module.exports='lane-a';\n");
    support::setup(&helper, "snap --ignore-issues * --message a");
    remote::publish(&helper);
    support::setup(&helper, "lane create lane-b");
    helper.output_file("comp1/index.js", "module.exports='lane-b';\n");
    support::setup(&helper, "snap --ignore-issues * --message b");
    remote::publish(&helper);
    support::setup(&helper, "switch lane-a -x");
    helper.output_file("comp1/index.js", "// uncommitted local edit on lane-a\n");
    helper
}

#[test]
fn automatic_conflict_preserves_local_bytes_and_current_lane() {
    let helper = fixture();
    let bitmap = support::bitmap(&helper);
    let path = helper.scopes.local_path.join("comp1/index.js");
    let source = fs::read(&path).unwrap();
    let output = support::compare(&helper, "switch lane-b -x");
    assert!(!output.status.success());
    let diagnostic = format!("{}{}", output.stdout, output.stderr);
    assert!(diagnostic.contains("automatic merge has failed"), "{diagnostic}");
    assert!(diagnostic.contains("--auto-merge-resolve"), "{diagnostic}");
    assert_eq!(fs::read(path).unwrap(), source);
    assert_eq!(support::bitmap(&helper), bitmap);
}

#[test]
fn explicit_merge_strategies_preserve_canonical_conflict_materialization() {
    for strategy in ["ours", "theirs", "manual"] {
        let helper = fixture();
        let command = format!("switch lane-b -r {strategy} -x");
        let result = if strategy == "ours" {
            crate::commands::add::support::history_oracle::compare(
                &helper,
                &command,
                str::to_owned,
                ["lane-switch"],
                false,
            )
        } else {
            super::selection::two_write_success(&helper, &command)
        };
        assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    }
}
