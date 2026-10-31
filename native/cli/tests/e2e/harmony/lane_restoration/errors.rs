use super::fixture;
use crate::commands::move_paths::support;

#[test]
fn missing_history_id_reports_the_current_lane_and_preserves_every_control() {
    let fixture = fixture::initial();
    let before = support::bitmap(&fixture.helper);
    for action in ["checkout", "revert"] {
        let output =
            support::compare(&fixture.helper, &format!("lane {action} missing-history -x"));
        assert!(!output.status.success());
        let diagnostic = format!("{}{}", output.stdout, output.stderr);
        assert!(diagnostic.contains("unable to find history"));
        assert!(diagnostic.contains("missing-history"));
        assert_eq!(support::bitmap(&fixture.helper), before);
    }
}

#[test]
fn main_lane_error_precedes_history_resolution_and_preserves_the_workspace() {
    let helper = support::workspace(1, false);
    let before = support::bitmap(&helper);
    for action in ["checkout", "revert"] {
        let output = support::compare(&helper, &format!("lane {action} missing-history -x"));
        assert!(!output.status.success());
        assert!(format!("{}{}", output.stdout, output.stderr).contains("while on main"));
        assert_eq!(support::bitmap(&helper), before);
    }
}

#[test]
fn checkout_json_remains_an_explicit_pre_effect_unsupported_option() {
    let fixture = fixture::initial();
    let before = support::bitmap(&fixture.helper);
    let output = support::compare_declined(
        &fixture.helper,
        &format!("lane checkout {} --json -x", fixture.history),
        str::to_owned,
    );
    assert!(!output.status.success());
    assert_eq!(support::bitmap(&fixture.helper), before);
}

#[test]
fn ci_missing_history_errors_preserve_the_published_stack_before_any_native_effect() {
    let fixture = fixture::initial();
    let before = support::bitmap(&fixture.helper);
    for action in ["checkout", "revert"] {
        let output = support::compare_ci(
            &fixture.helper,
            &format!("lane {action} missing-history -x"),
            false,
        );
        assert!(!output.status.success());
        assert!(output.trace.contains("CI lane history diagnostics require the published stack"));
        assert!(output.stderr.contains("unable to find history"));
        assert!(output.stderr.contains("missing-history"));
        assert!(output.stderr.contains("    at "));
        assert_eq!(support::bitmap(&fixture.helper), before);
    }
}

#[test]
fn ci_main_lane_errors_preserve_the_published_stack_before_history_resolution() {
    let helper = support::workspace(1, false);
    let before = support::bitmap(&helper);
    for action in ["checkout", "revert"] {
        let output =
            support::compare_ci(&helper, &format!("lane {action} missing-history -x"), false);
        assert!(!output.status.success());
        assert!(output.trace.contains("CI lane history diagnostics require the published stack"));
        assert!(output.stderr.contains("while on main"));
        assert!(output.stderr.contains("    at "));
        assert_eq!(support::bitmap(&helper), before);
    }
}

#[test]
fn ci_cached_revert_remains_native_and_restores_file_bytes_without_changing_bitmap() {
    let fixture = fixture::deleted(true);
    let before = support::bitmap(&fixture.helper);
    let output =
        support::compare_ci(&fixture.helper, &format!("lane revert {} -x", fixture.history), true);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert_eq!(support::bitmap(&fixture.helper), before);
    assert_eq!(
        std::fs::read_to_string(fixture.helper.scopes.local_path.join("comp3/index.js")).unwrap(),
        fixture::written_source("module.exports=()=> 'comp3';\n"),
    );
}
