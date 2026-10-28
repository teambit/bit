//! Released `JUnit` files preserve test details and observable writes.
use super::{add::support, move_paths, tester::timings};
use crate::helper::{Helper, Run};
use std::collections::BTreeMap;

fn compare(helper: &Helper, command: &str) -> Run {
    let remote = move_paths::support::tree(&helper.scopes.remote_path);
    let result = support::compare_with_artifacts(helper, command, timings, &project);
    assert_eq!(remote, move_paths::support::tree(&helper.scopes.remote_path));
    result
}
fn project(files: &mut BTreeMap<String, Vec<u8>>, run: &Run, started: i64, ended: i64) {
    let Some(bytes) = files.get_mut("reports/test.xml") else {
        return;
    };
    let text = String::from_utf8(bytes.clone()).unwrap();
    let timestamp = regex::Regex::new(r#" timestamp="([^"]+)""#).unwrap();
    for captures in timestamp.captures_iter(&text) {
        let time = chrono::DateTime::parse_from_rfc3339(&captures[1]).unwrap().timestamp_millis();
        assert!((started..=ended).contains(&time), "JUnit timestamp outside command window");
        if let Ok(data) = serde_json::from_str::<serde_json::Value>(&run.stdout)
            && let Some(start) = data[0]["data"]["components"][0]["results"]["start"].as_i64()
        {
            assert_eq!(time, start);
        }
    }
    let text = timestamp.replace_all(&text, r#" timestamp="clock""#);
    let durations = regex::Regex::new(r#" time="([0-9.]+)""#).unwrap();
    for captures in durations.captures_iter(&text) {
        let duration: f64 = captures[1].parse().unwrap();
        assert!(duration > 0.0 && duration * 1000.0 <= (ended - started + 1) as f64);
    }
    *bytes = durations
        .replace_all(&text, r#" time="duration""#)
        .into_owned()
        .into_bytes();
}

#[test]
fn junit_reports_pass_fail_skip_todo_and_suite_errors() {
    let helper = move_paths::support::workspace(1, true);
    for source in [
        "it('a & < b',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});it.skip('later',()=>{});it.todo('future');\n",
        "it('fails',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(5);});\n",
        "throw new Error('example & <error>');\n",
        "const value=42;\n",
    ] {
        helper.output_file("comp1/index.spec.js", source);
        compare(&helper, "test comp1 --json --junit reports/test.xml");
    }
}

#[test]
fn junit_empty_tests_and_exit_code_preserve_output() {
    let helper = move_paths::support::workspace(1, true);
    compare(&helper, "test comp1 --json --junit reports/test.xml");
    helper.output_file(
        "comp1/index.spec.js",
        "afterAll(()=>{process.exitCode=7;});it('works',()=>{const end=Date.now()+20;while(Date.now()<end){}expect(2+2).toBe(4);});\n",
    );
    let result = compare(&helper, "test comp1 --json --junit=reports/test.xml");
    assert_eq!(result.status.code(), Some(7));
}

#[test]
fn junit_write_failure_does_not_replay_test_effects() {
    let helper = move_paths::support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    std::fs::create_dir(helper.scopes.local_path.join("report.xml")).unwrap();
    let result = move_paths::support::compare(&helper, "test comp1 --json --junit report.xml");
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}

#[cfg(unix)]
#[test]
fn junit_permission_failure_keeps_released_error_and_runs_test_once() {
    use std::os::unix::fs::PermissionsExt;
    let helper = move_paths::support::workspace(1, true);
    helper.output_file("comp1/index.spec.js", "const fs=require('fs');it('works',()=>{fs.appendFileSync('test-side-effect','x');expect(2+2).toBe(4);});\n");
    let directory = helper.scopes.local_path.join("reports");
    std::fs::create_dir(&directory).unwrap();
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o555)).unwrap();
    let result = move_paths::support::compare(
        &helper,
        "test comp1 --json --summary --junit reports/test.xml",
    );
    std::fs::set_permissions(&directory, std::fs::Permissions::from_mode(0o755)).unwrap();
    assert_eq!(result.status.code(), Some(1));
    assert_eq!(
        std::fs::read_to_string(helper.scopes.local_path.join("test-side-effect")).unwrap(),
        "x",
    );
}
