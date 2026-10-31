use super::{Prepare, select};
use serde_json::json;
fn request(pattern: Option<&str>) -> Prepare {
    serde_json::from_value(json!({"root":"/workspace","home":"/home/test","globalRemotesFile":"/remotes","operation":"componentAbort","options":{"pattern":pattern,"skipDependencyInstallation":true}})).unwrap()
}
#[test]
fn abort_selection_preserves_unselected_pending_records() {
    let context = json!({"targets":[{"identity":"scope/first","directory":"first"},{"identity":"scope/second","directory":"second"}]});
    let pending = json!([{"id":{"scope":"scope","name":"first"},"head":"a"},{"id":{"scope":"scope","name":"second"},"head":"b"}]);
    let (selected, remaining) = select(&context, &pending, &request(Some("first"))).unwrap();
    assert_eq!(selected, vec![context["targets"][0].clone()]);
    assert_eq!(remaining, json!([pending[1].clone()]));
}
#[test]
fn explicit_nonpending_and_empty_abort_decline() {
    let context = json!({"targets":[{"identity":"scope/first","directory":"first"}]});
    assert!(select(&context, &json!([]), &request(Some("first"))).is_err());
    assert!(select(&context, &json!([]), &request(None)).is_err());
}

#[test]
fn all_abort_follows_pending_insertion_order() {
    let context = json!({"targets":[{"identity":"scope/first","directory":"first"},{"identity":"scope/second","directory":"second"}]});
    let pending =
        json!([{"id":{"scope":"scope","name":"second"}},{"id":{"scope":"scope","name":"first"}}]);
    let (selected, remaining) = select(&context, &pending, &request(None)).unwrap();
    assert_eq!(selected, vec![context["targets"][1].clone(), context["targets"][0].clone()]);
    assert_eq!(remaining, json!([]));
    assert!(select(&context, &json!([pending[0], pending[0]]), &request(None)).is_err());
}

#[test]
fn ambiguous_plain_pattern_declines_before_selection() {
    let context = json!({"targets":[{"identity":"one/name","directory":"one"},{"identity":"two/name","directory":"two"}]});
    let pending =
        json!([{"id":{"scope":"one","name":"name"}},{"id":{"scope":"two","name":"name"}}]);
    assert!(select(&context, &pending, &request(Some("name"))).is_err());
    assert!(select(&context, &pending, &request(Some("one/name"))).is_ok());
}

#[test]
fn duplicate_historical_extensions_decline_before_capture() {
    let single = serde_json::json!({"versions":[["head",{"extensions":[{"name":"teambit.pkg/pkg","config":{}}]}]]});
    super::guards::extensions(&single).unwrap();
    let mut duplicate = single;
    duplicate["versions"][0][1]["extensions"]
        .as_array_mut()
        .unwrap()
        .push(serde_json::json!({"name":"teambit.pkg/pkg","config":{"__specific":true}}));
    assert!(super::guards::extensions(&duplicate).is_err());
}
