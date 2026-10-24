use super::equivalent;
use serde_json::json;

#[test]
fn persisted_extension_edge_must_match_before_hidden_selection() {
    let root = json!({"scope":"scope","name":"hidden","version":"head"});
    let aspect = json!({"scope":"scope","name":"aspect","version":"selected"});
    let version = json!({"dependencies":[],"devDependencies":[],"flattenedDependencies":[aspect],
        "extensions":[{"extensionId":aspect}]});
    let edges = json!([{"source":root,"target":aspect,"type":"ext"}]);
    equivalent("scope/hidden", "head", &version, &edges).unwrap();
    let mut stale = edges.clone();
    stale[0]["target"]["version"] = json!("stale");
    assert!(equivalent("scope/hidden", "head", &version, &stale).is_err());
    stale = edges;
    stale[0]["source"]["version"] = json!("different-root");
    assert!(equivalent("scope/hidden", "head", &version, &stale).is_err());
}
