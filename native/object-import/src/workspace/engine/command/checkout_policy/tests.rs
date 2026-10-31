use super::receipt_versions;
use serde_json::json;

#[test]
fn checkout_receipt_only_contains_auto_dependencies_overlapping_workspace_policy() {
    let context = json!({"workspace":{"teambit.dependencies/dependency-resolver":{"policy":{
        "dependencies":{"pkg":"^1.0.0","same":"2.0.0"},
        "peerDependencies":{"peer":{"version":"1.0.0"}}
    }}}});
    let incoming = json!({"extensions":[{"name":"teambit.dependencies/dependency-resolver",
    "data":{"dependencies":[
        {"__type":"package","id":"pkg","version":"^1.1.0","source":"auto"},
        {"__type":"package","id":"same","version":"2.0.0","source":"auto"},
        {"__type":"package","id":"peer","version":"2.0.0","source":"auto"},
        {"__type":"package","id":"manual","version":"3.0.0","source":"config"},
        {"__type":"package","id":"hidden","version":"3.0.0","source":"auto","hidden":true}
    ]}}]});
    let receipt = receipt_versions(&context, [(&incoming, false)], None).unwrap().unwrap();
    assert_eq!(
        receipt["componentDeps"],
        json!([
            {"name":"pkg","versions":["^1.1.0"]},
            {"name":"peer","versions":["2.0.0"]}
        ]),
    );
    assert_eq!(receipt["workspaceEntries"][0]["dependencyId"], "pkg");
    assert_eq!(receipt["workspaceEntries"][2]["lifecycleType"], "peer");
    assert!(receipt_versions(&context, [(&incoming, true)], None).unwrap().is_none());
    assert!(receipt_versions(&context, [(&incoming, false)], Some("ours")).unwrap().is_none());
}
