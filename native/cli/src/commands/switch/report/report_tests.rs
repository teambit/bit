use super::{Chalk, Options, format};
use crate::commands::workspace_command::format::expected_success_symbols;
use serde_json::json;

#[test]
fn reports_an_empty_switch() {
    let report = format(
        &json!({"components":[],"failedComponents":[]}),
        &Options {
            lane: "main".into(),
            skip_fetch: true,
            verbose: false,
            force_ours: false,
            force_theirs: false,
            skip_install: true,
        },
        Chalk::new(false),
    )
    .unwrap();
    assert_eq!(
        report.data,
        expected_success_symbols(
            "No components have been changed.\n✔ successfully set \"main\" as the active lane"
        ),
    );
}

#[test]
fn reports_fetched_head() {
    let report = format(
        &json!({
            "components": [{"id":"s/alpha@abc","filesStatus":{"index.js":"updated"}}],
            "failedComponents": [],
        }),
        &Options {
            lane: "s/dev".into(),
            skip_fetch: false,
            verbose: false,
            force_ours: false,
            force_theirs: false,
            skip_install: true,
        },
        Chalk::new(false),
    )
    .unwrap();
    assert!(report.data.contains("to the head of lane s/dev"));
    assert!(!report.data.contains("local head"));
}
