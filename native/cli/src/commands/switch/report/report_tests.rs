//! Unit tests for `bit switch` empty-workspace and fetched-head [`Options`] terminal report formatting ([`format`]).
//!
//! Verifies [`expected_success_symbols`] and [`Chalk`] styling for empty and populated switch reports.

use super::{Chalk, Options, format};
use crate::commands::test_support::expected_success_symbols;
use serde_json::json;

/// Verifies [`format`] renders an empty-workspace switch report with [`expected_success_symbols`].
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
            adoption: crate::commands::switch::options::Adoption::default(),
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

/// Verifies that [`format`] describes switching to the remote head when `skip_fetch` is `false`.
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
            adoption: crate::commands::switch::options::Adoption::default(),
        },
        Chalk::new(false),
    )
    .unwrap();
    assert!(report.data.contains("to the head of lane s/dev"));
    assert!(!report.data.contains("local head"));
}

/// Verifies that [`format`] describes switching to the `local head` of the lane when `skip_fetch` is `true`.
///
/// Ensures `--skip-fetch` switches report `local head` rather than remote head phrasing.
#[test]
fn skip_fetch_reports_local_head_of_lane() {
    let report = format(
        &json!({
            "components": [{"id":"s/alpha@abc","filesStatus":{"index.js":"updated"}}],
            "failedComponents": [],
        }),
        &Options {
            lane: "s/dev".into(),
            skip_fetch: true,
            verbose: false,
            force_ours: false,
            force_theirs: false,
            skip_install: true,
            adoption: crate::commands::switch::options::Adoption::default(),
        },
        Chalk::new(false),
    )
    .unwrap();
    assert!(report.data.contains("local head"));
}
