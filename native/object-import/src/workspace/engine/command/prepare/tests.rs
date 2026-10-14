use super::{Prepare, json, selected};

fn request(pattern: &str) -> Prepare {
    serde_json::from_value(json!({
        "root":"/workspace", "home":"/home", "globalRemotesFile":"/remotes",
        "operation":"merge", "options":{"pattern":pattern,"skipDependencyInstallation":true},
    }))
    .unwrap()
}

#[test]
fn explicit_all_merge_preserves_bitmap_order_and_scoped_nested_names() {
    let context = json!({"targets":[
        {"identity":"scope/zeta", "directory":"zeta"},
        {"identity":"scope/nested/alpha", "directory":"alpha"},
    ]});
    assert_eq!(json!(selected(&request("**"), &context).unwrap()), context["targets"]);
    assert!(selected(&request("*"), &context).is_err());
    assert!(selected(&request("scope/*"), &context).is_err());
    assert!(selected(&request("**"), &json!({"targets":[]})).is_err());
}

#[test]
fn explicit_all_still_rejects_overlapping_roots_before_selection() {
    let context = json!({"targets":[
        {"identity":"scope/parent", "directory":"parent"},
        {"identity":"scope/child", "directory":"parent/child"},
    ]});
    assert!(selected(&request("**"), &context).is_err());
}

#[test]
fn lane_selected_inactive_capture_does_not_expand_active_context() {
    let mut input = request("**");
    input.options.lane = Some(serde_json::from_value(json!({"name":"incoming"})).unwrap());
    let context = json!({"targets":[{"identity":"scope/active","directory":"active"}],
    "lane":{"targets":[{"identity":"scope/inactive"}],"inactiveTargets":[
        {"identity":"scope/inactive","directory":"inactive"}
    ]}});
    let original = context.clone();
    assert_eq!(json!(selected(&input, &context).unwrap()), context["lane"]["inactiveTargets"]);
    assert_eq!(context, original);
    let mut overlapping = context;
    overlapping["lane"]["inactiveTargets"][0]["directory"] = json!("active/child");
    assert!(selected(&input, &overlapping).is_err());
}
