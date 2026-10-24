use super::{Entry, json, replace_entry, same_entries};

#[test]
fn lane_history_equality_ignores_order_but_preserves_soft_deletion() {
    let first = json!({"id":{"scope":"test.scope","name":"alpha"},"head":"1".repeat(40)});
    let second =
        json!({"id":{"scope":"test.scope","name":"beta"},"head":"2".repeat(40),"isDeleted":false});
    let left = json!({"scope":"test.scope","name":"dev","components":[first,second]});
    let mut right = json!({"scope":"test.scope","name":"dev","components":[second,first],"updateDependents":[]});
    assert!(same_entries(&left, &right).unwrap());
    right["components"][0]["isDeleted"] = json!(true);
    assert!(!same_entries(&left, &right).unwrap());
}

#[test]
fn updated_hidden_component_moves_to_end_like_canonical_lane() {
    let old = "1".repeat(40);
    let new = "2".repeat(40);
    let mut lane = json!({"components":[],"updateDependents":[format!("test.scope/alpha@{old}"),format!("test.scope/beta@{old}")]});
    replace_entry(
        &mut lane,
        &json!({}),
        &Entry { identity: "test.scope/alpha".into(), head: new.clone(), hidden: true },
    )
    .unwrap();
    assert_eq!(
        lane["updateDependents"],
        json!([format!("test.scope/beta@{old}"), format!("test.scope/alpha@{new}")]),
    );
}

#[test]
fn new_and_renamed_lane_index_rows_keep_canonical_serialized_member_order() {
    let mut index = json!({"components":[],"lanes":[]});
    let mut lane = super::Record {
        hash: "a".repeat(40),
        value: json!({"name":"incoming","scope":"scope"}),
        is_new: false,
    };
    assert!(super::index_entry(&mut index, &lane).unwrap());
    assert_eq!(
        serde_json::to_string(&index).unwrap(),
        r#"{"components":[],"lanes":[{"id":{"name":"incoming","scope":"scope"},"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}]}"#,
    );
    assert!(!super::index_entry(&mut index, &lane).unwrap());
    lane.value["name"] = json!("renamed");
    assert!(super::index_entry(&mut index, &lane).unwrap());
    assert_eq!(
        serde_json::to_string(&index["lanes"][0]).unwrap(),
        r#"{"id":{"name":"renamed","scope":"scope"},"hash":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}"#,
    );
}
