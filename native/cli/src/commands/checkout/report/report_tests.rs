use super::format;
use crate::commands::{
    checkout::options::{parse, parse_revert},
    color::Chalk,
    test_support::expected_success_symbols,
};
use serde_json::json;

/// What `checkoutOutput` prints for one switched component, without colors.
#[test]
fn reports_one_switched_component() {
    let options = parse(&["0.0.1", "one", "-x"]).unwrap();
    let result = json!({
        "components": [{ "id": "my.scope/one@0.0.1", "filesStatus": { "index.ts": "updated", "a.ts": "unchanged" } }],
        "failedComponents": [],
        "version": "0.0.1",
    });
    let report = format(&result, &options, Chalk::new(false)).unwrap();
    assert_eq!(
        report.data,
        expected_success_symbols(
            "\u{2714} successfully switched my.scope/one to version 0.0.1\n\ncomponents with file changes\n\nupdated index.ts \n\nCheckout Summary\nTotal Changed: 1\nTotal Unchanged: 0"
        ),
    );
    assert!(report.details.is_none());
}

#[test]
fn reports_reverted_files_with_original_checkout_summary() {
    let options = parse_revert(&["my.scope/one", "0.0.1", "-x"]).unwrap();
    let result = json!({
        "components": [{"id":"my.scope/one@0.0.1","filesStatus":{"index.ts":"updated"}}],
        "failedComponents":[],"version":"0.0.1"
    });
    let report = format(&result, &options, Chalk::new(false)).unwrap();
    assert!(report.data.contains("successfully reverted my.scope/one to version 0.0.1"));
    assert!(report.data.contains("Checkout Summary"));
}

/// `--all` without `--verbose` hides the skipped list behind `bit details`.
#[test]
fn moves_skipped_components_to_details() {
    let options = parse(&["reset", "-x", "--all"]).unwrap();
    let result = json!({
        "components": [],
        "failedComponents": [{ "id": "my.scope/one", "unchangedMessage": "is up to date", "unchangedLegitimately": true }],
    });
    let report = format(&result, &options, Chalk::new(false)).unwrap();
    assert!(report.data.starts_with(
        r#"(run "bit details" to see full list of 1 skipped component(s))"#
    ));
    let details = report.details.unwrap();
    assert!(
        details.starts_with("checkout skipped (1)\n   \u{203A} my.scope/one - is up to date"),
        "{details}",
    );
}

#[test]
fn warns_for_deprecated_explicit_all_on_head_and_latest() {
    let result = json!({ "components": [], "failedComponents": [] });
    for target in ["head", "latest"] {
        let options = parse(&[target, "-x", "--all"]).unwrap();
        let report = format(&result, &options, Chalk::new(false)).unwrap();
        assert!(
            report.data.starts_with(&format!(
                "  \"--all\" is deprecated for \"bit checkout {target}\", please omit it.\n"
            )),
            "{}",
            report.data,
        );
    }
    let options = parse(&["head", "-x"]).unwrap();
    assert!(!format(&result, &options, Chalk::new(false)).unwrap().data.contains("deprecated"));
}

#[test]
fn declines_binary_conflicts_and_illegitimate_failures() {
    let options = parse(&["head", "-x"]).unwrap();
    let binary =
        json!({ "components": [{ "id": "s/a@1", "filesStatus": { "x.png": "binaryConflict" } }] });
    assert!(format(&binary, &options, Chalk::new(false)).is_err());
    let failed = json!({ "failedComponents": [{ "id": "s/a", "unchangedMessage": "x", "unchangedLegitimately": false }] });
    assert!(format(&failed, &options, Chalk::new(false)).is_err());
}
