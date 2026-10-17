use super::{Kind, parse_component, parse_lane, report::format_component};
use crate::commands::color::Chalk;
use serde_json::json;

#[test]
fn abort_grammars_select_only_explicit_noninteractive_operations() {
    assert!(parse_component(&["--abort"]).is_some());
    assert!(parse_component(&["scope/name", "--abort", "-x"]).unwrap().skip_install);
    assert!(parse_component(&["--resolve", "--abort"]).is_none());
    assert!(parse_component(&["--abort", "--abort"]).is_none());
    assert!(parse_lane(&["--silent"]).is_some());
    assert_eq!(parse_lane(&["-s", "-x"]).unwrap().kind, Kind::Lane);
    assert!(!parse_lane(&[]).unwrap().silent);
    assert!(parse_lane(&["--silent", "component"]).is_none());
}

#[test]
fn component_abort_reports_unversioned_ids() {
    let report = format_component(
        &json!({"abortedComponents":[{"id":"scope/name@abc"}]}),
        Chalk::new(false),
    )
    .unwrap();
    assert!(report.data.contains("merge aborted"));
    assert!(report.data.contains("scope/name"));
    assert!(!report.data.contains("@abc"));
}
