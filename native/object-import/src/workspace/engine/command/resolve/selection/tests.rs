use super::select;
use serde_json::json;

#[test]
fn pending_order_and_explicit_workspace_order_are_distinct() {
    let targets = vec![json!({"identity":"s/a"}), json!({"identity":"s/b"})];
    let pending =
        vec![json!({"id":{"scope":"s","name":"b"}}), json!({"id":{"scope":"s","name":"a"}})];
    assert_eq!(select(&targets, &pending, None).unwrap(), ["s/b", "s/a"]);
    assert_eq!(
        select(&targets, &pending, Some(&["s/a".into(), "s/b".into()])).unwrap(),
        ["s/a", "s/b"],
    );
}

#[test]
fn missing_and_duplicate_pending_selections_decline() {
    let targets = vec![json!({"identity":"s/a"})];
    let row = json!({"id":{"scope":"s","name":"a"}});
    assert!(select(&targets, &[row.clone(), row.clone()], None).is_err());
    assert!(select(&targets, &[row], Some(&["s/b".into()])).is_err());
    assert!(select(&targets, &[], None).is_err());
}
