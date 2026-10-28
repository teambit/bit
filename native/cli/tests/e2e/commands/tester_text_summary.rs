//! Text summary behavior against the released tester.
use super::move_paths::support;

fn without_duration(output: &str) -> String {
    let (prefix, tail) = output.rsplit_once("Finished. (").expect("finished timing");
    let (duration, suffix) = tail.split_once("s)").expect("seconds suffix");
    assert!(duration.parse::<f64>().is_ok(), "invalid timing: {duration}");
    assert!(suffix == "\n" || suffix == "\u{1b}[22m\n", "timing suffix: {suffix:?}");
    format!("{prefix}Finished. (<duration>s){suffix}")
}

#[test]
fn text_summary_pass_fail_pending_and_repeated_execution_match_node() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "it('pass',()=>expect(2+2).toBe(4));it.skip('pending',()=>{});\n",
    );
    let result = support::compare_with_stdout(&helper, "test comp1 --summary", without_duration);
    assert!(result.status.success());
    support::compare_with_stdout(&helper, "test comp1 --summary", without_duration);
    helper.output_file("comp1/index.spec.js", "it('fail',()=>expect(2+2).toBe(5));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --summary", without_duration);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_summary_no_tests_and_multiple_components_match_node() {
    let helper = support::workspace(2, true);
    support::compare_with_stdout(&helper, "test --unmodified --summary", without_duration);
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2+2).toBe(4));\n");
    support::compare_with_stdout(&helper, "test --unmodified --summary", without_duration);
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/index.spec.js", "it('fail',()=>expect(2+2).toBe(5));\n");
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --summary", without_duration);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_summary_preserves_nonzero_exit_and_test_effects() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');afterAll(()=>{fs.appendFileSync('effect','x');process.exitCode=7;});it('pass',()=>expect(2).toBe(2));\n");
    let result = support::compare_with_stdout(&helper, "test comp1 --summary", without_duration);
    assert_eq!(result.status.code(), Some(7));
    assert_eq!(std::fs::read_to_string(helper.scopes.local_path.join("effect")).unwrap(), "x");
}

#[test]
fn text_summary_direct_exit_does_not_print_a_final_report() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "process.exit(7);\n");
    let result = support::compare(&helper, "test comp1 --summary");
    assert_eq!(result.status.code(), Some(7));
    assert!(!result.stdout.contains("Finished."));
}

#[test]
fn text_summary_explicit_files_and_suite_errors_match_node() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "throw new Error('suite failure');\n");
    helper.output_file("comp2/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let result = support::compare_with_stdout(
        &helper,
        "test comp2/index.spec.js comp1/index.spec.js --summary",
        without_duration,
    );
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_summary_colored_ci_matches_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('fail',()=>expect(2).toBe(3));\n");
    let result = super::add::support::compare_service_output(
        &helper,
        "test comp1 --summary",
        without_duration,
        true,
        true,
    );
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_summary_writes_junit_and_collects_coverage() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "it('pass',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2).toBe(2);});\n",
    );
    let result = super::add::support::compare_with_artifacts(
        &helper,
        "test comp1 --summary --coverage --junit reports/test.xml",
        without_duration,
        &super::tester_junit::project,
    );
    assert!(result.status.success());
}

#[test]
fn text_summary_does_not_import_bit_runtime() {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let guard = helper.scopes.e2e_dir.join("reject-bit-modules.cjs");
    fs::write(&guard, r"const Module=require('node:module');const load=Module._load;
Module._load=function(name,...args){if(name.includes('@teambit/')||name.includes('@teambit\\'))throw new Error('Bit module load forbidden');return load.call(this,name,...args);};").unwrap();
    let options = format!(r#"--require "{}""#, guard.to_string_lossy().replace('\\', "/"));
    let result = crate::helper::Helper::cmd_in_with(
        &helper.scopes.local_path,
        "test comp1 --summary",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(result.native && result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
    assert!(result.stderr.is_empty(), "{result:?}");
}
#[test]
fn text_summary_all_warns_and_matches_unmodified_selection() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let result = support::compare_with_stdout(&helper, "test --all --summary", without_duration);
    assert!(result.status.success());
    assert!(result.stdout.contains("--all is deprecated"));
}

#[test]
fn text_summary_all_warns_with_explicit_file_in_ci() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let result = super::add::support::compare_service_output(
        &helper,
        "test comp1/index.spec.js -a --summary",
        without_duration,
        true,
        true,
    );
    assert!(result.status.success());
}

#[test]
fn text_summary_all_selects_unchanged_components() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    support::tag(&helper);
    let result = support::compare_with_stdout(&helper, "test --all --summary", without_duration);
    assert!(result.status.success());
    assert!(result.stdout.contains("1/1 tests passed across 1 components"));
}

#[test]
fn text_summary_scope_filters_components_and_warns() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    helper.output_file("comp2/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let command = format!("test comp1 --scope {} --summary", helper.scopes.remote);
    let result = support::compare_with_stdout(&helper, &command, without_duration);
    assert!(result.status.success());
    assert!(result.stdout.contains("--scope is deprecated"));
    assert!(result.stdout.contains("1/1 tests passed across 1 components"));
}

#[test]
fn text_summary_scope_does_not_filter_explicit_files() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let result = support::compare_with_stdout(
        &helper,
        "test comp1/index.spec.js --scope example.other --summary",
        without_duration,
    );
    assert!(result.status.success());
}

#[test]
fn text_summary_scope_without_pattern_selects_the_scope() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    let command = format!("test --scope {} --all --summary", helper.scopes.remote);
    let result = support::compare_with_stdout(&helper, &command, without_duration);
    assert!(result.status.success());
    assert!(result.stdout.contains("--scope is deprecated"));
    assert!(result.stdout.contains("--all is deprecated"));
}

#[test]
fn text_summary_unknown_scope_declines_before_test_effects() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "const fs=require('fs');it('pass',()=>{fs.writeFileSync('effect','x');});\n",
    );
    let result =
        support::compare_declined(&helper, "test --scope example.other --summary", str::to_owned);
    assert_eq!(result.status.code(), Some(1));
    assert!(!helper.scopes.local_path.join("effect").exists());
}
#[test]
fn text_summary_no_changed_components_preserves_loading_and_hint() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    support::tag(&helper);
    let result = support::compare(&helper, "test --summary");
    assert!(result.status.success());
    assert!(result.stdout.contains("no components found to test."));
}

#[test]
fn text_without_summary_and_no_changed_components_matches_node() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    support::tag(&helper);
    let result = support::compare(&helper, "test");
    assert!(result.status.success());
    assert!(result.stdout.contains("no components found to test."));
}

#[test]
fn text_without_summary_and_selected_component_still_declines() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "process.exit(7);\n");
    let result = support::compare_declined(&helper, "test comp1", str::to_owned);
    assert_eq!(result.status.code(), Some(7));
}

#[test]
fn text_summary_empty_selection_preserves_colored_ci_hint() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('pass',()=>expect(2).toBe(2));\n");
    support::tag(&helper);
    let result = super::add::support::compare_service_output(
        &helper,
        "test --summary",
        str::to_owned,
        true,
        true,
    );
    assert!(result.status.success());
}
#[test]
fn text_selected_components_without_tests_match_node() {
    let helper = support::workspace(2, true);
    let result = support::compare_with_stdout(&helper, "test --unmodified", without_duration);
    assert!(result.status.success());
    assert!(result.stdout.contains("2 components have no tests"));
}

#[test]
fn text_selected_components_without_tests_verbose_match_node() {
    let helper = support::workspace(2, true);
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --verbose", without_duration);
    assert!(result.status.success());
    let first = result.stdout.find("/comp1").unwrap();
    let second = result.stdout.find("/comp2").unwrap();
    assert!(first < second);
}

#[test]
fn text_selected_without_tests_preserves_ci_colors_and_scope_flags() {
    let helper = support::workspace(1, true);
    let command = format!("test --scope {} --all --verbose", helper.scopes.remote);
    let result = super::add::support::compare_service_output(
        &helper,
        &command,
        without_duration,
        true,
        true,
    );
    assert!(result.status.success());
}

#[test]
fn text_selected_without_tests_writes_empty_junit() {
    let helper = support::workspace(1, true);
    let result = super::add::support::compare_with_artifacts(
        &helper,
        "test comp1 --junit reports/test.xml",
        without_duration,
        &super::tester_junit::project,
    );
    assert!(result.status.success());
    assert!(
        std::fs::read_to_string(helper.scopes.local_path.join("reports/test.xml"))
            .unwrap()
            .contains("<testsuites/>"),
    );
}
