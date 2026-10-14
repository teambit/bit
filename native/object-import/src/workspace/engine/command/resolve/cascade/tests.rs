use super::visible;
use serde_json::json;

#[test]
fn transitive_cycle_preserves_candidate_order_and_excludes_selected() {
    let rows = vec![
        json!({"identity":"s/a","version":"snap-a","current":{"dependencies":[{"id":{"scope":"s","name":"b","version":"snap-b"}}]}}),
        json!({"identity":"s/b","version":"snap-b","current":{"devDependencies":[{"id":{"scope":"s","name":"c","version":"snap-c"}}]}}),
        json!({"identity":"s/c","version":"snap-c","current":{"dependencies":[{"id":{"scope":"s","name":"a","version":"snap-a"}}]}}),
    ];
    assert_eq!(visible(&rows, &["s/c".into()], &json!({})).unwrap(), ["s/a", "s/b"]);
}
