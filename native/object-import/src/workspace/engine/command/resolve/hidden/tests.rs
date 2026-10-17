use super::{depends_on, enrich_packages};
use serde_json::json;

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
fn hidden_aspect_dependency_uses_exact_version_and_excludes_core_names() {
    let version = json!({"dependencies":[],"devDependencies":[],"extensions":[
        {"extensionId":{"scope":"scope","name":"aspect","version":"1.0.0"}},
        {"name":"scope/core","config":{}}
    ]});
    assert!(depends_on(&version, "scope/aspect", "1.0.0"));
    assert!(!depends_on(&version, "scope/aspect", "2.0.0"));
    assert!(!depends_on(&version, "scope/core", "1.0.0"));
}
