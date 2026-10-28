//! Multi-component summary comparisons preserve all fields and workspace effects.
use super::move_paths::support;
use serde_json::Value;

fn summary_order(output: &str) -> String {
    let mut data: Value = serde_json::from_str(output).unwrap();
    sort_component_pair(&mut data["componentsWithTests"], true);
    sort_component_pair(&mut data["componentsWithoutTests"], false);
    sort_component_pair(&mut data["componentsAffectedByEnvError"], false);
    serde_json::to_string_pretty(&data).unwrap()
}

fn sort_component_pair(value: &mut Value, objects: bool) {
    let rows = value.as_array_mut().unwrap();
    if rows.len() != 2 {
        return;
    }
    let name = |row: &Value| {
        if objects { row["id"].as_str().unwrap() } else { row.as_str().unwrap() }.to_owned()
    };
    let mut ids: Vec<_> = rows.iter().map(name).collect();
    ids.sort_unstable();
    assert!(ids[0].ends_with("/comp1") && ids[1].ends_with("/comp2"));
    rows.sort_by_key(name);
}

#[test]
fn builtin_test_multi_summary_aggregates_passing_and_failing_components() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/index.spec.js", "it('second',()=>expect(2+2).toBe(5));\n");
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_test_multi_summary_accounts_for_a_component_without_tests() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    assert!(result.status.success());
}

#[test]
fn builtin_test_multi_summary_coverage_executes_each_test_once() {
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    let result = support::compare_with_stdout(
        &helper,
        "test --unmodified --json --summary --coverage",
        summary_order,
    );
    assert!(result.status.success());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn builtin_test_multi_summary_runs_matching_untracked_files_in_other_components() {
    let helper = support::workspace(2, true);
    helper.output_file(".bitignore", "comp2/ignored.spec.js\n");
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/ignored.spec.js", "const fs=require('fs');it('ignored',()=>{fs.appendFileSync('ignored-effect','x');expect(2+2).toBe(4);});\n");
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    assert!(result.status.success());
    let report: Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(report["totals"]["tested"], 2);
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("ignored-effect")).unwrap(),
        "x",
    );
}

#[test]
fn builtin_test_multi_summary_without_any_test_files_has_no_tested_components() {
    let helper = support::workspace(2, true);
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    let report: Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(report["totals"]["withoutTests"], 2);
}

#[cfg(unix)]
#[test]
fn builtin_test_multi_summary_reports_coverage_cleanup_failure_once() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[cfg(unix)]
#[test]
fn builtin_test_multi_summary_symlinked_tree_declines_before_tests() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    helper.output_file("comp2/index.spec.js", "it('works',()=>expect(2+2).toBe(4));\n");
    std::os::unix::fs::symlink("index.js", helper.scopes.local_path.join("comp2/alias.js"))
        .unwrap();
    let result =
        support::compare_declined(&helper, "test --unmodified --json --summary", summary_order);
    assert!(result.status.success());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[test]
fn builtin_test_multi_summary_negative_patterns_decline_before_tests() {
    let helper = support::workspace(2, true);
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.defender/tester",
        serde_json::json!({"patterns":["**/*.spec.js", "!**/skip.spec.js"]}),
    );
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    let result =
        support::compare_declined(&helper, "test --unmodified --json --summary", summary_order);
    assert!(result.status.success());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn builtin_test_multi_summary_unconfined_patterns_decline_before_tests() {
    let helper = support::workspace(2, true);
    crate::helper::config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.defender/tester",
        serde_json::json!({"patterns":["**/*.spec.js", "../comp2/*.spec.js"]}),
    );
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    let result =
        support::compare_declined(&helper, "test --unmodified --json --summary", summary_order);
    assert!(result.status.success());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn builtin_test_multi_summary_does_not_import_the_bit_runtime() {
    use std::{ffi::OsStr, fs};
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(
            &format!("{name}/index.spec.js"),
            "it('works',()=>expect(2+2).toBe(4));\n",
        );
    }
    let guard = helper.scopes.e2e_dir.join("reject-bit-modules.cjs");
    fs::write(&guard,r"const Module=require('node:module');const load=Module._load;
Module._load=function(name,...args){if(name.includes('@teambit/')||name.includes('@teambit\\'))throw new Error('Bit module load forbidden');return load.call(this,name,...args);};").unwrap();
    let options = format!(r#"--require "{}""#, guard.to_string_lossy().replace('\\', "/"));
    let result = crate::helper::Helper::cmd_in_with(
        &helper.scopes.local_path,
        "test --unmodified --json --summary",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(result.native && result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
    let summary: Value = serde_json::from_str(&result.stdout).unwrap();
    assert_eq!(summary["totals"]["tested"], 2);
}

#[test]
fn builtin_test_multi_summary_preserves_in_band_process_exit_code() {
    let helper = support::workspace(2, true);
    helper.output_file(
        "comp1/index.spec.js",
        "afterAll(()=>{process.exitCode=7;});it('first',()=>expect(2+2).toBe(4));\n",
    );
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --summary", summary_order);
    assert_eq!(result.status.code(), Some(7));
}
