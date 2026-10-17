use super::merge;
use serde_json::json;
use std::collections::HashSet;

#[test]
fn callbacks_replace_existing_types_and_precede_later_native_checks() {
    let replacement = json!({"type":"ParseErrors","dataAsString":"callback parser details","data":{"a.js":"error"}});
    let custom =
        json!({"type":"CustomPluginIssue","dataAsString":"plugin details","isTagBlocker":false});
    let ignored = json!({"type":"IgnoredPluginIssue","dataAsString":"ignored"});
    let raw = json!([
        {"type":"ParseErrors","data":"{}"},
        {"callbackObject":custom},
        {"callbackObject":replacement},
        {"callbackObject":ignored}
    ]);
    let later = json!({"type":"MissingDists","data":true});
    let mut issues = vec![json!({"type":"ParseErrors","data":{}}), later.clone()];
    merge(&mut issues, &raw, &HashSet::from(["IgnoredPluginIssue"])).unwrap();
    assert_eq!(issues, vec![replacement, custom, later]);
}
