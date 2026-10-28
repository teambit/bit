//! Ordinary tester output preserves Jest's separate stdout and stderr.
use super::{move_paths::support, tester_text_summary::without_duration};

fn jest_times(output: &str) -> String {
    let time =
        regex::Regex::new(r"(?m)^Time:        ([0-9]+(?:\.[0-9]+)?) s(?:, estimated ([0-9]+) s)?$")
            .unwrap();
    let matches = time.captures_iter(output).collect::<Vec<_>>();
    assert_eq!(matches.len(), 1, "Jest timing: {output:?}");
    assert!(matches[0][1].parse::<f64>().unwrap() >= 0.0);
    let output = time.replace(output, "Time:        <duration> s");
    let test = regex::Regex::new(r"(?m)^  ([✓√✕×]) first(?: \(([0-9]+) ms\))?$").unwrap();
    assert_eq!(test.find_iter(&output).count(), 1, "Jest assertion: {output:?}");
    test.replace(&output, "  $1 first <duration>").into_owned()
}

#[test]
fn text_single_explicit_test_preserves_failure_and_direct_stream_writes() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>{process.stdout.write('user stdout\\n');process.stderr.write('user stderr\\n');expect(2+2).toBe(5);});\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js",
        without_duration,
        jest_times,
    );
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_single_explicit_test_streams_jest_report() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js",
        without_duration,
        jest_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_single_test_preserves_inherited_subprocess_output() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const cp=require('child_process');it('first',()=>{cp.execFileSync(process.execPath,['-e',\"process.stdout.write('child stdout\\\\n');process.stderr.write('child stderr\\\\n');\"],{stdio:'inherit'});expect(2+2).toBe(4);});\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js",
        without_duration,
        jest_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_single_test_preserves_direct_exit() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "process.stdout.write('before exit\\n');process.stderr.write('exit error\\n');process.exit(7);\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js",
        str::to_owned,
        str::to_owned,
    );
    assert_eq!(result.status.code(), Some(7));
}

#[test]
fn text_single_test_with_verbose() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js --verbose",
        without_duration,
        jest_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_selected_component_streams_jest_report() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_streams(&helper, "test comp1", without_duration, jest_times);
    assert!(result.status.success());
}

#[test]
fn text_selected_component_runs_multiple_discovered_files() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/other.spec.js", "it('second',()=>expect(3+3).toBe(6));\n");
    let result =
        support::compare_with_streams(&helper, "test comp1", without_duration, multiple_jest_times);
    assert!(result.status.success());
}

#[test]
fn text_selected_component_runs_multiple_explicit_files() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp1/other.spec.js", "it('second',()=>expect(3+3).toBe(6));\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp1/index.spec.js comp1/other.spec.js",
        without_duration,
        multiple_jest_times,
    );
    assert!(result.status.success());
}
fn multiple_jest_times(output: &str) -> String {
    let time =
        regex::Regex::new(r"(?m)^Time:        ([0-9]+(?:\.[0-9]+)?) s(?:, estimated ([0-9]+) s)?$")
            .unwrap();
    assert_eq!(time.find_iter(output).count(), 1, "Jest timing: {output:?}");
    let output = time.replace(output, "Time:        <duration> s");
    let (reports, rest) = output.split_once("\n\n").unwrap();
    let mut lines = reports.lines().collect::<Vec<_>>();
    lines.sort_unstable();
    assert_eq!(lines, ["PASS comp1/index.spec.js", "PASS comp1/other.spec.js"]);
    format!("{}\n\n{rest}", lines.join("\n"))
}

#[test]
fn text_multiple_components_stream_jest_report() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/index.spec.js", "it('second',()=>expect(3+3).toBe(6));\n");
    let result = support::compare_with_streams(
        &helper,
        "test --unmodified",
        without_duration,
        multi_component_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_multiple_components_with_one_without_tests() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    let result = support::compare_with_streams(
        &helper,
        "test --unmodified --verbose",
        without_duration,
        jest_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_multiple_explicit_files_sort_component_report() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(4));\n");
    helper.output_file("comp2/index.spec.js", "it('second',()=>expect(3+3).toBe(6));\n");
    let result = support::compare_with_streams(
        &helper,
        "test comp2/index.spec.js comp1/index.spec.js",
        without_duration,
        multi_component_times,
    );
    assert!(result.status.success());
}

#[test]
fn text_multiple_components_preserve_failure() {
    let helper = support::workspace(2, true);
    helper.output_file("comp1/index.spec.js", "it('first',()=>expect(2+2).toBe(5));\n");
    let result =
        support::compare_with_streams(&helper, "test --unmodified", without_duration, jest_times);
    assert_eq!(result.status.code(), Some(1));
}

#[test]
fn text_stream_preserves_junit_and_coverage() {
    let helper = support::workspace(1, true);
    helper.output_file(
        "comp1/index.spec.js",
        "it('first',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n",
    );
    let remote = support::tree(&helper.scopes.remote_path);
    let result = super::add::support::compare_stream_artifacts(
        &helper,
        "test comp1 --coverage --junit reports/test.xml",
        without_duration,
        jest_times,
        &super::tester_junit::project,
    );
    assert_eq!(remote, support::tree(&helper.scopes.remote_path));
    assert!(result.status.success());
}

#[test]
fn text_stream_junit_failure_does_not_repeat_test() {
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('first',()=>{fs.appendFileSync('test-effect','x');expect(2+2).toBe(4);});\n");
    std::fs::create_dir(helper.scopes.local_path.join("report.xml")).unwrap();
    let result = support::compare_with_streams(
        &helper,
        "test comp1 --junit report.xml",
        str::to_owned,
        jest_times,
    );
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(std::fs::read_to_string(helper.scopes.local_path.join("test-effect")).unwrap(), "x");
}

#[cfg(unix)]
#[test]
fn text_stream_reports_coverage_cleanup_error_without_replay() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('first',()=>{fs.appendFileSync('test-effect','x');expect(2+2).toBe(4);});\n");
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = support::compare_with_streams(&helper, "test comp1", without_duration, jest_times);
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(std::fs::read_to_string(helper.scopes.local_path.join("test-effect")).unwrap(), "x");
}

#[cfg(unix)]
#[test]
fn text_summary_reports_coverage_cleanup_error_without_replay() {
    use std::os::unix::fs::PermissionsExt;
    let helper = support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('first',()=>{fs.appendFileSync('test-effect','x');expect(2+2).toBe(4);});\n");
    helper.output_file("coverage/coverage-summary.json", "{}");
    let directory = helper.scopes.local_path.join("coverage");
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = support::compare_with_stdout(&helper, "test comp1 --summary", without_duration);
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(std::fs::read_to_string(helper.scopes.local_path.join("test-effect")).unwrap(), "x");
}
fn multi_component_times(output: &str) -> String {
    let time =
        regex::Regex::new(r"(?m)^Time:        ([0-9]+(?:\.[0-9]+)?) s(?:, estimated ([0-9]+) s)?$")
            .unwrap();
    assert_eq!(time.find_iter(output).count(), 1, "Jest timing: {output:?}");
    let output = time.replace(output, "Time:        <duration> s");
    let (reports, rest) = output.split_once("\n\n").unwrap();
    let mut lines = reports.lines().collect::<Vec<_>>();
    lines.sort_unstable();
    assert_eq!(lines, ["PASS comp1/index.spec.js", "PASS comp2/index.spec.js"]);
    format!("{}\n\n{rest}", lines.join("\n"))
}
