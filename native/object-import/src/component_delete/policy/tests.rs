use super::{DependencyComponent, latest, validate_graph};
use serde_json::json;

#[test]
fn only_active_main_tags_participate_in_pinning() {
    let model = json!({"versions":{"0.0.1":"a","1.0.0-beta.1":"b","0.2.0":"c"},"orphanedVersions":{"9.0.0":"d"}});
    assert_eq!(latest(&model).unwrap().as_deref(), Some("1.0.0-beta.1"));
    assert_eq!(latest(&json!({"versions":{}})).unwrap(), None);
}

#[test]
fn capture_must_cover_every_workspace_component_and_dependency() {
    let bitmap =
        json!({"foo":{"scope":"test","name":"foo","version":"0.0.1"},"$schema-version":"17.0.0"});
    let mut components = vec![DependencyComponent {
        identity: "test/foo@0.0.1".into(),
        package_name: "@test/foo".into(),
        dependencies: vec![],
    }];
    assert!(validate_graph(&bitmap, &components).is_ok());
    components[0].dependencies.push("test/external@0.0.1".into());
    assert!(validate_graph(&bitmap, &components).is_err());
    components[0].dependencies.clear();
    components[0].identity = "test/foo@0.0.2".into();
    assert!(validate_graph(&bitmap, &components).is_err());
}
