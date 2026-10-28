//! Built-in tester modes retain complete reports and command filesystem effects.
use super::{move_paths::support, tester::timings};

#[test]
fn builtin_test_summary_counts_statuses_and_preserves_exit_codes() {
    let helper = support::workspace(1, true);
    for (source, code) in [
        ("it('works',()=>expect(2+2).toBe(4));it.skip('later',()=>{});it.todo('future');\n", 0),
        ("it('fails',()=>expect(2+2).toBe(5));\n", 1),
        ("const value=42;\n", 1),
        ("afterAll(()=>{process.exitCode=7;});it('works',()=>expect(2+2).toBe(4));\n", 7),
    ] {
        helper.output_file("comp1/index.spec.js", source);
        let result = support::compare(&helper, "test comp1 --json --summary --verbose");
        assert_eq!(result.status.code(), Some(code));
    }
}

#[test]
fn builtin_test_summary_without_test_files_and_without_selected_components_match_node() {
    let helper = support::workspace(1, true);
    support::compare(&helper, "test comp1 --json --summary");
    support::compare(&helper, "test --json --summary");
    support::compare(&helper, "test --unmodified --json --summary");
}

#[test]
fn builtin_test_coverage_collection_reports_metrics_and_removes_artifacts() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "const example=require('./index');it('coverage',()=>expect(example()).toBe('comp1'));\n",
    );
    let result = support::compare_with_stdout(&helper, "test comp1 --json --coverage", timings);
    assert!(result.status.success(), "{result:?}");
    assert!(!helper.scopes.local_path.join("coverage").exists());
    support::compare(&helper, "test comp1 --json --coverage --summary");
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
}

#[test]
fn builtin_test_snapshot_update_changes_the_exact_snapshot_then_reuses_it() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "it('snapshot',()=>expect({value:42}).toMatchSnapshot());\n",
    );
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
    helper.output_file(
        "comp1/index.spec.js",
        "it('snapshot',()=>expect({value:43}).toMatchSnapshot());\n",
    );
    let result =
        support::compare_with_stdout(&helper, "test comp1 --json --update-snapshot", timings);
    assert!(result.status.success(), "{result:?}");
    support::compare_with_stdout(&helper, "test comp1 --json", timings);
}

#[cfg(unix)]
#[test]
fn builtin_test_summary_preserves_environment_failure_details_and_test_side_effects() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = support::compare(&helper, "test comp1 --json --summary");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[test]
fn builtin_test_explicit_file_selection_excludes_other_tests_and_deduplicates_paths() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('selected',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/excluded.spec.js", "const fs=require('fs');it('excluded',()=>{fs.writeFileSync('excluded-side-effect','x');expect(2+2).toBe(5);});\n");
    for command in [
        "test comp1/index.spec.js --json",
        "test ./comp1/index.spec.js comp1/index.spec.js --json --summary",
        "test comp1/index.spec.js --json -- comp1/excluded.spec.js",
    ] {
        let result = if command.contains("--summary") {
            support::compare(&helper, command)
        } else {
            support::compare_with_stdout(&helper, command, timings)
        };
        assert!(result.status.success(), "{result:?}");
        assert!(!helper.scopes.local_path.join("excluded-side-effect").exists());
    }
    let command = format!(
        "test '{}' --json --coverage",
        helper.scopes.local_path.join("comp1/index.spec.js").display(),
    );
    support::compare_with_stdout(&helper, &command, timings);
}

#[test]
fn builtin_test_explicit_non_test_files_keep_released_validation_and_loader_effects() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('selected',()=>expect(2+2).toBe(4));\n");
    support::compare_declined(&helper, "test comp1/index.js --json", str::to_owned);
    support::compare(&helper, "test comp1/index.spec.js comp1 --json");
}

#[test]
fn builtin_test_separator_arguments_do_not_select_files_or_enable_options() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('selected',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/excluded.spec.js", "it('excluded',()=>expect(2+2).toBe(5));\n");
    let result =
        support::compare(&helper, "test --json --summary -- comp1/index.spec.js --coverage");
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_test_react_coverage_failure_owns_effects_once() {
    let helper = support::workspace(1, true);
    let mut bitmap = helper.read_bit_map();
    bitmap["comp1"]["config"] = serde_json::json!({"teambit.react/react":{},"teambit.envs/envs":{"env":"teambit.react/react"}});
    helper.restore_bit_map(&serde_json::to_string_pretty(&bitmap).unwrap());
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');const example=require('./index');it('coverage',()=>{fs.appendFileSync('test-side-effect','x');expect(example()).toBe('wrong');});\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --json --coverage", timings);
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
    assert!(!helper.scopes.local_path.join("coverage").exists());
}
