use super::format;
use crate::commands::color::Chalk;
use serde_json::json;

const ONE: &str = "s/a@0123456789abcdef0123456789abcdef01234567";
const TWO: &str = "s/b@1123456789abcdef0123456789abcdef01234567";

#[test]
fn nothing_to_snap() {
    assert_eq!(format(&json!(null), Chalk::new(false)).unwrap().data, "nothing to snap");
}

#[test]
fn changed_components_without_dependents() {
    let result = json!({ "snappedComponents": [ONE], "autoSnappedResults": [], "newComponents": [], "laneName": null, "totalComponentsCount": 1 });
    let report = format(&result, Chalk::new(false)).unwrap();
    assert_eq!(
        report.data,
        format!(
            "changed components (1)\n  components that got a version bump\n   › {ONE}\n\n✔ 1 component(s) snapped\n(use \"bit export\" to push these components to a remote)\n(use \"bit reset\" to unstage all local versions, or \"bit reset --head\" to only unstage the latest local snap)"
        ),
    );
    assert!(report.details.is_none());
}

#[test]
fn auto_snapped_dependents_are_counted_and_detailed() {
    let result = json!({
        "snappedComponents": [ONE],
        "autoSnappedResults": [{ "id": TWO, "triggeredBy": [ONE] }],
        "newComponents": [ONE],
        "laneName": null,
        "totalComponentsCount": 2,
    });
    let report = format(&result, Chalk::new(false)).unwrap();
    assert!(report.data.starts_with(&format!("new components (1)\n  first version for components\n   › {ONE}\n\nauto-snapped dependents (1)\n   s (1)\n(run \"bit details\" to see full list of auto-snapped dependents)\n\n✔ 2 component(s) snapped")));
    let details = report.details.unwrap();
    assert!(details.contains(&format!(
        "   › {ONE}\n     auto-snapped dependents (1 total):\n       {TWO}\n\n✔ 2"
    )));
}

#[test]
fn inconsistent_results_decline() {
    let wrong_total = json!({ "snappedComponents": [ONE], "autoSnappedResults": [], "newComponents": [], "laneName": null, "totalComponentsCount": 2 });
    assert!(format(&wrong_total, Chalk::new(false)).is_err());
    let foreign_trigger = json!({ "snappedComponents": [ONE], "autoSnappedResults": [{ "id": TWO, "triggeredBy": ["s/c@1.0.0"] }], "newComponents": [], "laneName": null, "totalComponentsCount": 2 });
    assert!(format(&foreign_trigger, Chalk::new(false)).is_err());
}
