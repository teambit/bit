use super::{row, tags};
use serde_json::json;

#[test]
fn normal_tags_take_precedence_over_orphaned_labels() {
    let hash = "a".repeat(40);
    let model = json!({
        "versions": { "0.9.9": hash, "1.0.0": hash },
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
fn removal_metadata_is_projected_from_head_over_historical_tags() {
    let hash = "a".repeat(40);
    let tags = tags(&json!({"versions": {"1.0.0": hash}})).unwrap();
    let version = json!({
        "log":{"message":"first"},
        "parents":[],
        "extensions":[{"name":"teambit.component/remove","config":{"range":"*"}}],
    });
    let mut rows = vec![row(&hash, &version, &tags).unwrap().0];
    super::control::Control::read(&version).apply(&mut rows);
    assert_eq!(rows[0]["deleted"], true);
    let ordinary = json!({"log":{"message":"first"},"parents":[],"extensions":[]});
    assert_eq!(row(&hash, &ordinary, &tags).unwrap().0["tag"], "1.0.0");
}

#[test]
fn head_ranges_and_snap_removals_apply_to_history_and_staged_undeprecation() {
    let version = json!({"extensions":[
        {"name":"teambit.component/remove","config":{"range":"<2","snaps":["snap"]}},
        {"name":"teambit.component/deprecation","config":{"range":">=2"}},
    ]});
    let mut rows = vec![
        json!({"tag":"1.0.0","hash":"old"}),
        json!({"tag":"2.0.0","hash":"new"}),
        json!({"hash":"snap"}),
    ];
    super::control::Control::read(&version).apply(&mut rows);
    assert_eq!(rows[0]["deleted"], true);
    assert_eq!(rows[1]["deleted"], false);
    assert_eq!(rows[2]["deleted"], true);
    assert_eq!(rows[0]["deprecated"], false);
    assert_eq!(rows[1]["deprecated"], true);
    assert!(rows[2].get("deprecated").is_none());
    super::control::staged(&mut rows, &json!({"deprecate":false}));
    assert!(
        rows.iter()
            .all(|row| row["deprecated"] == false),
    );
    assert_eq!(rows[2]["deleted"], true);
}
