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
