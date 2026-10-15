use super::{row, tags};
use serde_json::json;

#[test]
fn normal_tags_take_precedence_over_orphaned_labels() {
    let hash = "a".repeat(40);
    let model = json!({
        "versions": { "1.0.0": hash },
        "orphanedVersions": { "0.9.0": hash },
    });
    assert_eq!(
        tags(&model)
            .unwrap()
            .get(&hash)
            .unwrap(),
        "1.0.0",
    );
}

#[test]
fn removal_and_deprecation_metadata_decline_before_a_history_report() {
    let hash = "a".repeat(40);
    let tags = tags(&json!({"versions": {"1.0.0": hash}})).unwrap();
    let version = json!({
        "log":{"message":"first"},
        "parents":[],
        "extensions":[{"name":"teambit.component/remove","config":{"range":"*"}}],
    });
    assert!(row(&hash, &version, &tags).is_err());
    let ordinary = json!({"log":{"message":"first"},"parents":[],"extensions":[]});
    assert_eq!(row(&hash, &ordinary, &tags).unwrap().0["tag"], "1.0.0");
}
