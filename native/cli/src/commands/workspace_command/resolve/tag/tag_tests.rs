use super::{entered_versions, planned_versions, selections};
use serde_json::json;

#[test]
fn literal_patterns_select_one_component_with_its_version() {
    let context = json!({ "targets": [{ "identity": "s/ui/one" }, { "identity": "s/two" }] });
    assert_eq!(selections(&context, &[]).unwrap(), None);
    let patterns = ["one@2.0.0".to_string(), "s/two@minor".to_string()];
    let rows = selections(&context, &patterns).unwrap().unwrap();
    assert_eq!(
        rows,
        json!([
            { "identity": "s/ui/one", "version": "2.0.0", "patternIndex": 0 },
            { "identity": "s/two", "version": "minor", "patternIndex": 1 },
        ]),
    );
    assert_eq!(entered_versions(Some(&rows)), ["2.0.0", "minor"]);
    let globbed = selections(&context, &["s/*@minor".to_string()]).unwrap().unwrap();
    assert_eq!(globbed, json!([{ "identity": "s/two", "version": "minor", "patternIndex": 0 }]));
    let listed = selections(&context, &["s/two, s/ui/one".to_string()]).unwrap().unwrap();
    assert_eq!(listed.as_array().map(Vec::len), Some(2));
    for pattern in ["s/{a,b}", "s/two@bad", "s/two@1@2", "s/three"] {
        assert!(selections(&context, &[pattern.to_string()]).is_err(), "{pattern}");
    }
}

#[test]
fn planned_versions_come_from_tagged_and_auto_tagged_ids() {
    let result = json!({ "taggedComponents": ["s/two@0.0.2"], "autoTaggedResults": [{ "id": "s/one@0.0.2", "triggeredBy": ["s/two@0.0.2"] }] });
    let identities = ["s/two".to_string(), "s/one".to_string()];
    assert_eq!(planned_versions(&result, &identities).unwrap(), ["0.0.2", "0.0.2"]);
    assert!(planned_versions(&result, &["s/three".to_string()]).is_err());
}
