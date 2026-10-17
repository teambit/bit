use super::prove_changed;
use serde_json::json;

#[test]
fn only_different_content_or_inventory_proves_reset_without_dependencies() {
    let hash = "a".repeat(40);
    let current = json!([{"relativePath":"a.js","file":hash,"name":"a.js","test":false}]);
    let stored = json!({"files":[{"relativePath":"a.js","file":hash,"name":"legacy","test":true}]});
    assert!(prove_changed(&current, &stored).is_err());
    let different = json!([{"relativePath":"a.js","file":"b".repeat(40)}]);
    assert!(prove_changed(&different, &stored).is_ok());
    let renamed = json!([{"relativePath":"b.js","file":hash}]);
    assert!(prove_changed(&renamed, &stored).is_ok());
    assert!(prove_changed(&json!([]), &stored).is_ok());
    let with_bitmap =
        json!({"files":[{"relativePath":".bitmap","file":"c".repeat(40)},current[0]]});
    assert!(prove_changed(&current, &with_bitmap).is_err());
    assert!(prove_changed(&json!([current[0], current[0]]), &stored).is_err());
}
