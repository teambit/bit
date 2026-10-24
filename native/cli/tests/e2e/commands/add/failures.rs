//! File/link failures retain the exact publication prefix before bitmap persistence.
use super::support::{compare, workspace};
use std::fs;
#[test]
fn package_link_failure_keeps_bitmap_and_source_bytes_unchanged() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(&format!("node_modules/@{}", helper.scopes.remote), "not a directory\n");
    let bitmap = fs::read(helper.scopes.local_path.join(".bitmap")).unwrap();
    let result = compare(&helper, "add bar -i bar/foo");
    assert!(!result.status.success());
    assert_eq!(fs::read(helper.scopes.local_path.join(".bitmap")).unwrap(), bitmap);
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("bar/index.js")).unwrap(),
        "module.exports=1;\n",
    );
}
#[test]
fn path_prefix_siblings_do_not_transfer_tracked_files() {
    let helper = workspace();
    helper.output_file("foo/index.js", "module.exports=1;\n");
    helper.output_file("foobar/index.js", "module.exports=2;\n");
    helper.run("add foo -i foo");
    compare(&helper, "add foobar -i foobar");
}
#[test]
fn add_before_init_reports_the_released_workspace_error() {
    let helper = crate::helper::Helper::new();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    let oracle = helper.clone_workspace();
    let expected = super::support::node(&oracle, "add bar -i bar/foo");
    let actual = helper.native_run("add bar -i bar/foo");
    assert_eq!(actual.status.code(), expected.status.code());
    assert_eq!(actual.stdout, expected.stdout);
    assert_eq!(actual.stderr, expected.stderr);
    assert!(!actual.status.success());
    assert!(!helper.scopes.local_path.join(".bitmap").exists());
}

#[test]
fn ci_success_stays_native_and_preserves_exact_released_output() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    let result = super::support::compare_ci(&helper, "add bar -i bar/foo", true);
    assert!(result.status.success());
}

#[test]
fn ci_fully_ignored_input_delegates_before_effects_with_exact_error_stack() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(".gitignore", "bar/\n");
    let result = super::support::compare_ci(&helper, "add bar -i bar/foo", false);
    assert!(!result.status.success());
}

#[test]
fn ci_blocked_link_parent_delegates_before_effects_with_exact_error_stack() {
    let helper = workspace();
    helper.output_file("bar/index.js", "module.exports=1;\n");
    helper.output_file(&format!("node_modules/@{}", helper.scopes.remote), "not a directory\n");
    let result = super::support::compare_ci(&helper, "add bar -i bar/foo", false);
    assert!(!result.status.success());
}
