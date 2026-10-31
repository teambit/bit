use super::discard_incomplete;
use serde_json::json;

#[test]
fn failed_import_omits_only_its_in_flight_row_and_keeps_completed_receipts() {
    let earlier = json!({"ids":["s/earlier@1"],"components":1,"objects":0});
    let partial = json!({"ids":["s/first@2"],"components":1,"objects":0});
    let later = json!({"ids":["s/later@3"],"components":1,"objects":0});
    let mut progress = json!({"imports":[earlier,partial,later]});
    let context =
        json!({"historyImportProgressStart":1,"historyCheckoutImport":{"completed":false}});
    discard_incomplete(&mut progress, &context);
    assert_eq!(progress["imports"], json!([earlier, later]));
}
#[test]
fn completed_import_is_retained_in_full_and_absent_row_does_not_remove_another() {
    let row = json!({"ids":["s/component@1"],"components":1,"objects":0});
    let mut progress = json!({"imports":[row]});
    let original = progress.clone();
    discard_incomplete(
        &mut progress,
        &json!({"historyImportProgressStart":0,"historyCheckoutImport":{"completed":true}}),
    );
    assert_eq!(progress, original);
    discard_incomplete(
        &mut progress,
        &json!({"historyImportProgressStart":1,"historyCheckoutImport":{"completed":false}}),
    );
    assert_eq!(progress, original);
}
