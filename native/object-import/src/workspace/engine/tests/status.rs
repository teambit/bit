use serde_json::json;

use super::response;

#[test]
fn file_status_preserves_first_matches_target_order_and_raw_content_identity() {
    let first = json!({"relativePath":"same.js","hash":"a".repeat(40)});
    let second = json!({"relativePath":"same.js","hash":"b".repeat(40)});
    let missing = json!({"relativePath":"λ.js","hash":"a".repeat(40)});
    let result = response(&json!({
        "kind":"fileStatus", "target":[second,missing,first,first], "current":[first,second],
    }));
    assert_eq!(result["completed"], 4);
    assert_eq!(result["data"]["unchanged"], json!([false, false, true, true]));
}

#[test]
fn file_status_rejects_invalid_hashes_and_oversized_batches_without_a_prefix() {
    let file = json!({"relativePath":"file.js","hash":"a".repeat(40)});
    for target in [json!([file,{"relativePath":"bad.js","hash":"bad"}]), json!(vec![file; 4097])] {
        let result = response(&json!({"kind":"fileStatus", "target":target,"current":[]}));
        assert_eq!(result["completed"], 0);
        assert_eq!(result["failed"], true);
    }
    let empty = response(&json!({"kind":"fileStatus", "target":[],"current":[]}));
    assert_eq!(empty["data"]["unchanged"], json!([]));
}
