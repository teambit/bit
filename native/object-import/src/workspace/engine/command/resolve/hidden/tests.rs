use super::{enrich_packages, reports};
use crate::command_import::lane::Entry;
use serde_json::{Value, json};

#[test]
fn scope_consumer_package_names_match_exact_resolver_identity() {
    let mut version = json!({"dependencies":[{"id":{"scope":"scope","name":"a","version":"1.0.0"},"relativePaths":[]},{"id":{"scope":"scope","name":"a","version":"2.0.0"},"relativePaths":[]}],"devDependencies":[{"id":{"scope":"scope","name":"a","version":"1.0.0"},"packageName":"preserved"}],"extensions":[{"name":"teambit.dependencies/dependency-resolver","data":{"dependencies":[{"id":"scope/a@1.0.0","packageName":"@scope/a"}]}}]});
    version["peerDependencies"] = json!([{"id":{"scope":"scope","name":"a","version":"1.0.0"}}]);
    enrich_packages(&mut version).unwrap();
    assert_eq!(version["dependencies"][0]["packageName"], "@scope/a");
    assert!(version["dependencies"][1].get("packageName").is_none());
    assert!(version["peerDependencies"][0].get("packageName").is_none());
    assert_eq!(version["devDependencies"][0]["packageName"], "preserved");
}

#[test]
fn older_snapshot_and_transitive_dependents_keep_lane_order_and_original_triggers() {
    let candidates = [
        candidate("first", json!({"dependencies":[{"id":id("second", "older-second")}]})),
        candidate("second", json!({"dependencies":[{"id":id("changed", "older-head")}]})),
    ];
    assert_eq!(
        json!(
            reports(
                &candidates,
                &[current("changed", "newer-head")],
                &["fixture.scope/changed".into()],
                &json!({})
            )
            .unwrap()
        ),
        json!([
            {"id":"fixture.scope/first","triggeredBy":["fixture.scope/changed@older-head"]},
            {"id":"fixture.scope/second","triggeredBy":["fixture.scope/changed@older-head"]},
        ]),
    );
}

#[test]
fn peer_and_aspect_dependencies_participate_but_core_names_and_changed_edges_do_not() {
    let candidates = [
        candidate("peer", json!({"peerDependencies":[{"id":id("changed", "old")}]})),
        candidate("aspect", json!({"extensions":[{"extensionId":id("changed", "old")}]})),
        candidate("core", json!({"extensions":[{"name":"fixture.scope/changed"}]})),
        candidate("unrelated", json!({"dependencies":[]})),
    ];
    let mut changed = current("changed", "new");
    changed["current"] = json!({"dependencies":[{"id":id("unrelated", "old")}]});
    let result =
        reports(&candidates, &[changed], &["fixture.scope/changed".into()], &json!({})).unwrap();
    assert_eq!(
        result
            .iter()
            .map(|row| row["id"].as_str().unwrap())
            .collect::<Vec<_>>(),
        ["fixture.scope/peer", "fixture.scope/aspect"],
    );
}

#[test]
fn hidden_dependency_does_not_cascade_to_an_older_semantic_tag() {
    let semver = json!({"1.0.0":{"version":{"major":1,"minor":0,"patch":0,"prerelease":[]}},"2.0.0":{"version":{"major":2,"minor":0,"patch":0,"prerelease":[]}}});
    let candidates =
        [candidate("dependent", json!({"dependencies":[{"id":id("changed", "2.0.0")}]}))];
    let result = reports(
        &candidates,
        &[current("changed", "1.0.0")],
        &["fixture.scope/changed".into()],
        &semver,
    )
    .unwrap();
    assert!(result.is_empty());
}

fn candidate(name: &str, version: Value) -> (Entry, Value) {
    (
        Entry {
            identity: format!("fixture.scope/{name}"),
            head: format!("{name}-head"),
            hidden: true,
        },
        version,
    )
}

fn id(name: &str, version: &str) -> Value {
    json!({"scope":"fixture.scope","name":name,"version":version})
}

fn current(name: &str, version: &str) -> Value {
    json!({"identity":format!("fixture.scope/{name}"),"version":version})
}
