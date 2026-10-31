//! Multi-component `JUnit` comparisons preserve suite contents and write effects.
use super::{
    add::support, move_paths, tester_multi::summary_order, tester_multi_detail::detail_order,
};
use crate::helper::{Helper, Run};
use serde_json::Value;
use std::collections::BTreeMap;

fn compare(helper: &Helper, command: &str, summary: bool) -> Run {
    let remote = move_paths::support::tree(&helper.scopes.remote_path);
    let normalize = if summary { summary_order } else { detail_order };
    let result = support::compare_with_artifacts(helper, command, normalize, &project);
    assert_eq!(remote, move_paths::support::tree(&helper.scopes.remote_path));
    result
}
pub(super) fn compare_file_order(helper: &Helper, command: &str, summary: bool) -> Run {
    let remote = move_paths::support::tree(&helper.scopes.remote_path);
    let normalize: fn(&str) -> String =
        if summary { str::to_owned } else { super::tester::timings };
    let result = support::compare_with_artifacts(helper, command, normalize, &project_file_order);
    assert_eq!(remote, move_paths::support::tree(&helper.scopes.remote_path));
    result
}

fn detail_error_order(output: &str) -> String {
    let mut data: Value = serde_json::from_str(&detail_order(output)).unwrap();
    let errors = data[0]["data"]["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 1);
    assert!(errors[0] == serde_json::json!({}) || errors[0] == serde_json::json!({"type":"Error"}));
    let expected = errors[0].clone();
    let components = data[0]["data"]["components"].as_array_mut().unwrap();
    let failed = components
        .iter_mut()
        .find(|component| {
            component["componentId"]
                .as_str()
                .unwrap()
                .contains("/comp1@")
        })
        .unwrap();
    assert_eq!(failed["errors"], serde_json::json!([expected]));
    failed["errors"] = serde_json::json!([{}]);
    data[0]["data"]["errors"] = serde_json::json!([{}]);
    serde_json::to_string_pretty(&data).unwrap()
}
fn compare_error(helper: &Helper, command: &str) -> Run {
    let remote = move_paths::support::tree(&helper.scopes.remote_path);
    let result = support::compare_with_artifacts(helper, command, detail_error_order, &project);
    assert_eq!(remote, move_paths::support::tree(&helper.scopes.remote_path));
    result
}

fn project(files: &mut BTreeMap<String, Vec<u8>>, run: &Run, started: i64, ended: i64) {
    project_with_order(files, run, started, ended, true);
}
fn project_file_order(files: &mut BTreeMap<String, Vec<u8>>, run: &Run, started: i64, ended: i64) {
    project_with_order(files, run, started, ended, false);
}
fn project_with_order(
    files: &mut BTreeMap<String, Vec<u8>>,
    run: &Run,
    started: i64,
    ended: i64,
    reorder: bool,
) {
    let Some(bytes) = files.get_mut("reports/test.xml") else {
        return;
    };
    let text = String::from_utf8(bytes.clone()).unwrap();
    let timestamp = regex::Regex::new(r#" timestamp="([^"]+)""#).unwrap();
    let data: Value = serde_json::from_str(&run.stdout).unwrap();
    for captures in timestamp.captures_iter(&text) {
        let time = chrono::DateTime::parse_from_rfc3339(&captures[1]).unwrap().timestamp_millis();
        assert!((started..=ended).contains(&time));
        if let Some(start) = data[0]["data"]["components"][0]["results"]["start"].as_i64() {
            assert_eq!(time, start);
        }
    }
    let text = timestamp.replace_all(&text, r#" timestamp="clock""#);
    let durations = regex::Regex::new(r#" time="([0-9.]+)""#).unwrap();
    for captures in durations.captures_iter(&text) {
        let duration: f64 = captures[1].parse().unwrap();
        assert!(duration > 0.0 && duration * 1000.0 <= (ended - started + 1) as f64);
    }
    let text = durations.replace_all(&text, r#" time="duration""#).into_owned();
    *bytes = if reorder { suite_order(&text) } else { text }.into_bytes();
}
fn suite_order(text: &str) -> String {
    let suites = regex::Regex::new(r"(?s)  <testsuite .*?\n  </testsuite>\n").unwrap();
    let matches: Vec<_> = suites.find_iter(text).collect();
    if matches.len() != 2 {
        return text.to_owned();
    }
    let mut values: Vec<_> = matches
        .iter()
        .map(regex::Match::as_str)
        .collect();
    assert_eq!(
        values
            .iter()
            .filter(|suite| suite.contains("/comp1@"))
            .count(),
        1,
    );
    assert_eq!(
        values
            .iter()
            .filter(|suite| suite.contains("/comp2@"))
            .count(),
        1,
    );
    values.sort_unstable();
    let mut output = text.to_owned();
    output.replace_range(matches[0].start()..matches[1].end(), &values.concat());
    output
}

#[test]
fn multi_junit_preserves_both_suites_and_summary() {
    for summary in [false, true] {
        let helper = move_paths::support::workspace(2, true);
        helper.output_file("comp1/index.spec.js", "it('first',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n");
        helper.output_file("comp2/index.spec.js", "it('second',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n");
        let command = if summary {
            "test --unmodified --json --summary --junit reports/test.xml"
        } else {
            "test --unmodified --json --junit reports/test.xml"
        };
        let result = compare(&helper, command, summary);
        assert!(result.status.success());
    }
}

#[test]
fn multi_junit_assigns_suite_errors_to_the_correct_component() {
    let helper = move_paths::support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "throw new Error('bad & <error>');\n");
    helper.output_file(
        "comp2/index.spec.js",
        "it('second',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n",
    );
    let result = compare_error(&helper, "test --unmodified --json --junit reports/test.xml");
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn multi_junit_without_test_files_writes_an_empty_report() {
    let helper = move_paths::support::workspace(2, true);
    let result =
        compare(&helper, "test --unmodified --json --summary --junit reports/test.xml", true);
    assert!(result.status.success());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("reports/test.xml")).unwrap(),
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<testsuites/>",
    );
}

#[test]
fn multi_junit_write_failure_does_not_replay_tests() {
    let helper = move_paths::support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    std::fs::create_dir(helper.scopes.local_path.join("report.xml")).unwrap();
    let result = move_paths::support::compare(
        &helper,
        "test --unmodified --json --summary --junit report.xml",
    );
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn multi_junit_combines_coverage_and_explicit_environment_selection() {
    let helper = move_paths::support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), &format!("const example=require('./index');it('{name}',()=>{{const end=Date.now()+20;while(Date.now()<end){{}}expect(example()).toBe('{name}');}});\n"));
    }
    let result =
        compare(&helper, "test --unmodified --json --coverage --junit reports/test.xml", false);
    assert!(result.status.success());
    assert!(!helper.scopes.local_path.join("coverage").exists());
    let helper = move_paths::support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), &format!("const example=require('./index');it('{name}',()=>expect(example()).toBe('{name}'));\n"));
    }
    let result = move_paths::support::compare_with_stdout(
        &helper,
        "test --unmodified --json --env teambit.harmony/node --junit reports/test.xml",
        detail_order,
    );
    assert!(result.status.success());
    assert!(!helper.scopes.local_path.join("reports/test.xml").exists());
}

#[test]
fn multi_junit_preserves_in_band_exit_and_direct_termination() {
    let helper = move_paths::support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "afterAll(()=>{process.exitCode=7;});it('first',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n");
    let result = compare(&helper, "test --unmodified --json --junit reports/test.xml", false);
    assert_eq!(result.status.code(), Some(7));
    let helper = move_paths::support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('exit',()=>{fs.appendFileSync('test-side-effect','x');process.exit(7);});\n");
    let result =
        move_paths::support::compare(&helper, "test --unmodified --json --junit reports/test.xml");
    assert_eq!(result.status.code(), Some(7));
    assert!(!helper.scopes.local_path.join("reports/test.xml").exists());
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[cfg(unix)]
#[test]
fn multi_junit_permission_failure_does_not_replay_tests() {
    use std::os::unix::fs::PermissionsExt;
    let helper = move_paths::support::workspace(2, true);
    for name in ["comp1", "comp2"] {
        helper.output_file(&format!("{name}/index.spec.js"), "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    }
    let directory = helper.scopes.local_path.join("reports");
    std::fs::create_dir(&directory).unwrap();
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = move_paths::support::compare(
        &helper,
        "test --unmodified --json --summary --junit reports/test.xml",
    );
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "xx",
    );
}

#[test]
fn multi_junit_does_not_import_bit_runtime_modules() {
    use std::{ffi::OsStr, fs};
    let helper = move_paths::support::workspace(2, true);
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
        "test --unmodified --json --summary --junit reports/test.xml",
        &[("NODE_OPTIONS", OsStr::new(&options))],
    );
    assert!(result.native && result.status.success(), "{result:?}");
    assert!(!result.trace.contains("starting the JavaScript host"));
    assert!(helper.scopes.local_path.join("reports/test.xml").is_file());
}

#[test]
fn multi_junit_keeps_distinct_suite_error_messages_with_their_components() {
    let helper = move_paths::support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "throw new Error('first & <error>');\n");
    helper.output_file("comp2/index.spec.js", "throw new Error('second & <error>');\n");
    let result = compare(&helper, "test --unmodified --json --junit reports/test.xml", false);
    assert_eq!(result.status.code(), Some(1));
    let xml = std::fs::read_to_string(helper.scopes.local_path.join("reports/test.xml")).unwrap();
    assert!(xml.contains("first &amp; &lt;error>"));
    assert!(xml.contains("second &amp; &lt;error>"));
}
