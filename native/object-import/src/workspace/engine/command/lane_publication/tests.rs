use super::objects;
use serde_json::json;

#[test]
fn updating_hidden_lane_head_moves_it_to_tail_without_promoting_component() {
    let mut lane = json!({"components":[{"id":{"scope":"scope","name":"visible"},"head":"a".repeat(40)}],"updateDependents":[format!("scope/first@{}","b".repeat(40)),format!("scope/second@{}","c".repeat(40))]});
    objects::update(&mut lane, "scope/first", &"d".repeat(40), true, false).unwrap();
    assert_eq!(
        lane["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(
        lane["updateDependents"],
        json!([
            format!("scope/second@{}", "c".repeat(40)),
            format!("scope/first@{}", "d".repeat(40))
        ]),
    );
    assert!(lane.get("overrideUpdateDependents").is_none());
}

#[test]
fn lane_history_keeps_deleted_and_hidden_buckets_separate_and_preserves_previous_entries() {
    let lane = json!({"scope":"scope","name":"feature","components":[{"id":{"scope":"scope","name":"deleted"},"head":"a".repeat(40),"isDeleted":true}],"updateDependents":[format!("scope/hidden@{}","b".repeat(40))]});
    let previous = json!({"scope":"scope","name":"feature","laneHash":"c".repeat(40),"history":{"old":{"log":{"date":"1"},"components":[]}}});
    let receipt = json!({"historyKey":"new","log":{"date":"2","username":"user","message":""}});
    let actual = objects::history(
        &lane,
        &"c".repeat(40),
        previous.clone(),
        &receipt,
        r#"merge from "scope/main""#,
    )
    .unwrap();
    assert_eq!(actual["history"]["old"], previous["history"]["old"]);
    assert_eq!(actual["history"]["new"]["components"], actual["history"]["new"]["deleted"]);
    assert_eq!(actual["history"]["new"]["updateDependents"], lane["updateDependents"]);
    assert_eq!(actual["history"]["new"]["log"]["message"], r#"merge from "scope/main""#);
}

#[test]
fn snapshot_promotes_bitmap_component_without_leaving_a_hidden_duplicate() {
    let mut lane =
        json!({"components":[],"updateDependents":[format!("scope/alpha@{}","a".repeat(40))]});
    objects::snapshot_update(&mut lane, "scope/alpha", &"b".repeat(40), false, false).unwrap();
    assert!(lane.get("updateDependents").is_none());
    assert_eq!(lane["components"][0]["head"], "b".repeat(40));
    assert!(lane.get("overrideUpdateDependents").is_none());
}

#[test]
fn removed_snapshot_marks_the_lane_component_deleted() {
    let mut lane =
        json!({"components":[{"id":{"scope":"scope","name":"alpha"},"head":"a".repeat(40)}]});
    objects::snapshot_update(&mut lane, "scope/alpha", &"b".repeat(40), false, true).unwrap();
    assert_eq!(lane["components"][0]["head"], "b".repeat(40));
    assert_eq!(lane["components"][0]["isDeleted"], true);
}

#[test]
fn lane_snapshot_stages_separately_from_existing_component_objects() {
    let directory = super::super::scratch::Directory::create().unwrap();
    let root = &directory.0;
    std::fs::write(root.join(".bitmap"), "{}").unwrap();
    std::fs::write(root.join("workspace.jsonc"), "{}").unwrap();
    let recovery = super::recovery::Recovery::prepare(root, &json!({"current":null})).unwrap();
    let hash = "a".repeat(40);
    let mut prepared = super::Prepared {
        context: json!({"current":{"hash":hash},"targets":[{"identity":"scope/alpha","bitmapPresent":true}]}),
        current: json!({"scope":"scope","name":"feature","components":[{"id":{"scope":"scope","name":"alpha"},"head":"b".repeat(40)}]}),
        history: serde_json::Value::Null,
        recovery,
        first: None,
        second: None,
        finalized: true,
        squashes: Vec::new(),
    };
    let staging = root.join("staging");
    std::fs::create_dir(&staging).unwrap();
    std::fs::write(staging.join("existing-component-object"), b"retained").unwrap();
    prepared
        .finalize_snap(
            &staging,
            &[json!({"identity":"scope/alpha","hash":"c".repeat(40)})],
            &json!({"batchId":"snapshot-batch","laneLog":{"date":"1"}}),
            "",
        )
        .unwrap();
    assert!(prepared.second.is_some());
    assert!(staging.join("lane-snapshot").is_dir());
    assert_eq!(std::fs::read(staging.join("existing-component-object")).unwrap(), b"retained");
    assert_eq!(prepared.current["components"][0]["head"], "c".repeat(40));
}
