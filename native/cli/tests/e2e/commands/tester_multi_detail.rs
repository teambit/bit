//! Detailed reports retain each component's files, errors and coverage.
use super::{move_paths::support, tester::timings};
use serde_json::Value;

pub(super) fn detail_order(output: &str) -> String {
    let mut data: Value = serde_json::from_str(&timings(output)).unwrap();
    for environment in data.as_array_mut().unwrap() {
        let components = environment["data"]["components"].as_array_mut().unwrap();
        if components.len() == 2 {
            let mut ids: Vec<_> = components
                .iter()
                .map(|component| {
                    component["componentId"]
                        .as_str()
                        .unwrap()
                        .split('@')
                        .next()
                        .unwrap()
                        .to_owned()
                })
                .collect();
            ids.sort_unstable();
            assert!(ids[0].ends_with("/comp1") && ids[1].ends_with("/comp2"));
            components.sort_by(|left, right| {
                left["componentId"]
                    .as_str()
                    .cmp(&right["componentId"].as_str())
            });
        }
    }
    serde_json::to_string_pretty(&data).unwrap()
}

#[test]
fn builtin_test_multi_details_group_pass_and_failure_by_component() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/index.spec.js", "it('second',()=>expect(2+2).toBe(5));\n");
    let result = support::compare_with_stdout(&helper, "test --unmodified --json", detail_order);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn builtin_test_multi_details_collect_coverage_per_component() {
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), &format!("const example=require('./index');it('works',()=>expect(example()).toBe('{name}'));\n"));
    }
    let result =
        support::compare_with_stdout(&helper, "test --unmodified --json --coverage", detail_order);
    assert!(result.status.success());
    assert!(!helper.scopes.local_path.join("coverage").exists());
}

#[test]
fn builtin_test_multi_details_consume_stale_coverage_for_each_component() {
    let helper = support::workspace(2, true);
    let mut metrics = serde_json::json!({});
    for name in ["lines", "functions", "statements", "branches"] {
        metrics[name] = serde_json::json!({"total":3,"covered":2,"skipped":0,"pct":66.67});
    }
    let mut coverage = serde_json::json!({});
    for name in ["comp1", "comp2"] {
        helper.output_file(
            &format!("{name}/index.spec.js"),
            "it('works',()=>expect(2+2).toBe(4));\n",
        );
        coverage[helper.scopes.local_path
            .join(name)
            .join("index.js")
            .to_str()
            .unwrap()] = metrics.clone();
    }
    coverage[helper.scopes.local_path
        .join("comp1-other/extra.js")
        .to_str()
        .unwrap()] = metrics.clone();
    helper.output_file("coverage/coverage-summary.json", &coverage.to_string());
    let result = support::compare_with_stdout(&helper, "test --unmodified --json", detail_order);
    assert!(result.status.success());
    assert!(!helper.scopes.local_path.join("coverage").exists());
    let data: Value = serde_json::from_str(&result.stdout).unwrap();
    let components = data[0]["data"]["components"].as_array().unwrap();
    let first = components
        .iter()
        .find(|component| {
            component["componentId"]
                .as_str()
                .unwrap()
                .contains("/comp1@")
        })
        .unwrap();
    let second = components
        .iter()
        .find(|component| {
            component["componentId"]
                .as_str()
                .unwrap()
                .contains("/comp2@")
        })
        .unwrap();
    assert_eq!(
        first["results"]["coverage"]["files"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        second["results"]["coverage"]["files"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
}

#[test]
fn builtin_test_multi_details_omit_a_component_without_test_files() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_stdout(&helper, "test --unmodified --json", detail_order);
    assert!(result.status.success());
}

#[cfg(unix)]
#[test]
fn builtin_test_multi_details_preserve_coverage_cleanup_errors_and_effects() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = support::compare(&helper, "test --unmodified --json");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn builtin_test_multi_details_preserve_in_band_process_exit_code() {
    let helper = support::workspace(2, true);
    helper.output_file(
        "comp1/index.spec.js",
        "afterAll(()=>{process.exitCode=7;});it('first',()=>expect(2+2).toBe(4));\n",
    );
    let result = support::compare_with_stdout(&helper, "test --unmodified --json", detail_order);
    assert_eq!(result.status.code(), Some(7));
}

#[test]
fn builtin_test_multi_details_discard_malformed_coverage() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("coverage/coverage-summary.json", "not-json");
    helper.output_file("coverage/artifact", "artifact");
    let result = support::compare_with_stdout(&helper, "test --unmodified --json", detail_order);
    assert!(result.status.success());
    assert!(!helper.scopes.local_path.join("coverage").exists());
}
