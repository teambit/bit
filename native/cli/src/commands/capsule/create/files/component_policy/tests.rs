use super::{ComponentPolicy, parse};
use serde_json::json;

fn resolver(policy: &serde_json::Value) -> serde_json::Value {
    json!({ "extensions": { "teambit.dependencies/dependency-resolver": { "policy": policy } } })
}

#[test]
fn parses_peer_dependencies() {
    let parsed = parse(&resolver(&json!({ "peerDependencies": { "left-pad": "^1.0.0" } })))
        .map(|policy: ComponentPolicy| policy.peer_dependencies);
    assert_eq!(parsed.and_then(|peers| peers.get("left-pad").cloned()), Some(json!("^1.0.0")));
}

#[test]
fn declines_unsupported_content() {
    assert!(parse(&json!({ "extensions": { "teambit.envs/envs": {} } })).is_none());
    let nested = resolver(&json!({ "peerDependencies": { "a": { "version": "1" } } }));
    assert!(parse(&nested).is_none());
    let both = json!({ "dependencies": { "a": "1" }, "peerDependencies": { "a": "1" } });
    let duplicated = resolver(&both);
    assert!(parse(&duplicated).is_none());
}
