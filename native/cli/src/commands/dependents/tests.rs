use super::{Options, is_unscoped_bitmap_row, parse_options};
use serde_json::json;

#[test]
fn parses_dependents_options_and_checks_bitmap_scope() {
    assert_eq!(parse_options(&["comp1"]), Some(Options { id: "comp1".into(), json: false }));
    assert_eq!(
        parse_options(&["my-scope/comp1", "-j", "--no-color"]),
        Some(Options { id: "my-scope/comp1".into(), json: true }),
    );
    assert_eq!(parse_options(&[]), None);
    assert!(is_unscoped_bitmap_row(&json!({ "scope": "", "version": "" })));
    assert!(is_unscoped_bitmap_row(&json!({ "rootDir": "comp1" })));
    assert!(!is_unscoped_bitmap_row(&json!({ "scope": "my-scope", "version": "0.0.1" })));
}
