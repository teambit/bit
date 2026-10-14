use super::validate;
use crate::commands::color::Chalk;
use serde_json::json;

fn receipt(details: &serde_json::Value) -> serde_json::Value {
    json!({ "token": "t", "owner": "rust", "importedIds": ["s/a@0.0.1"], "progress": [], "importDetails": [details] })
}

#[test]
fn imported_components_are_listed_with_their_versions() {
    let added = receipt(
        &json!({ "id": "s/a", "versions": ["0.0.1"], "latestVersion": "0.0.1", "status": "added", "filesStatus": null, "missingDeps": [], "deprecated": false }),
    );
    let report = validate(&added)
        .unwrap()
        .import_report(Chalk::new(false))
        .unwrap();
    assert_eq!(
        report,
        "imported components (1)\n   › added s/a currently used version 0.0.1 (latest)\n\n✔ successfully imported one component",
    );
    let fetched = validate(&added)
        .unwrap()
        .fetch_report(Chalk::new(false))
        .unwrap();
    assert_eq!(
        fetched,
        "✔ fetched 1 component(s)\n- added s/a new versions: 0.0.1, currently used version 0.0.1  ",
    );
}

#[test]
fn up_to_date_components_are_counted() {
    let current = receipt(
        &json!({ "id": "s/a", "versions": [], "latestVersion": null, "status": "up to date", "filesStatus": null, "missingDeps": [], "deprecated": false }),
    );
    let report = validate(&current)
        .unwrap()
        .import_report(Chalk::new(false))
        .unwrap();
    assert_eq!(report, "✔ successfully imported one component, 1 components are up to date");
}

#[test]
fn unexpected_receipts_decline() {
    let missing = receipt(
        &json!({ "id": "s/a", "versions": [], "latestVersion": null, "status": "added", "filesStatus": null, "missingDeps": ["s/b"], "deprecated": false }),
    );
    assert!(validate(&missing).is_err());
    let foreign = receipt(
        &json!({ "id": "s/b", "versions": [], "latestVersion": null, "status": "added", "filesStatus": null, "missingDeps": [], "deprecated": false }),
    );
    assert!(validate(&foreign).is_err());
}
