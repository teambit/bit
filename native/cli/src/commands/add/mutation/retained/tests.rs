use super::Retained;
use serde_json::json;

#[test]
fn acknowledged_bitmap_changes_preserve_all_other_read_receipts() {
    let before = json!({"path":"/workspace/.bitmap","hash":"before"});
    let after = json!({"path":"/workspace/.bitmap","hash":"after"});
    let source = json!({"path":"/workspace/comp/index.js","hash":"source"});
    let mut retained = Retained {
        read_set: vec![before.clone(), source.clone(), before.clone()],
        ..Default::default()
    };
    retained.controls.insert("/workspace/.bitmap".into(), before.clone());
    retained.advance_bitmap(&before, &after).unwrap();
    assert_eq!(retained.read_set, vec![after.clone(), source, after.clone()]);
    assert_eq!(retained.controls["/workspace/.bitmap"], after);
}

#[test]
fn a_conflicting_bitmap_receipt_rejects_the_whole_advance() {
    let before = json!({"path":"/workspace/.bitmap","hash":"before"});
    let conflicting = json!({"path":"/workspace/.bitmap","hash":"unexpected"});
    let after = json!({"path":"/workspace/.bitmap","hash":"after"});
    let mut retained =
        Retained { read_set: vec![before.clone(), conflicting], ..Default::default() };
    let original = retained.read_set.clone();
    assert!(retained.advance_bitmap(&before, &after).is_err());
    assert_eq!(retained.read_set, original);
}
