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
