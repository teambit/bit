//! Unit tests for authored `.bitmap` row property serialization order via [`reorder_bitmap`] in `bit-object-import`.
//!
//! Verifies that `.bitmap` component entries follow canonical `ComponentMap` key order when serialized.

use super::reorder_bitmap;
use serde_json::Value;

/// Verifies that [`reorder_bitmap`] reorders authored `.bitmap` component fields into canonical `ComponentMap` key order.
#[test]
fn authored_rows_use_component_map_serialization_order() {
    let mut row: Value = serde_json::from_str(
        r#"{"name":"bar/foo","scope":"scope","version":"0.0.1","rootDir":"bar","mainFile":"foo.js"}"#,
    )
    .unwrap();
    reorder_bitmap(&mut row).unwrap();
    assert_eq!(
        serde_json::to_string(&row).unwrap(),
        r#"{"name":"bar/foo","scope":"scope","version":"0.0.1","mainFile":"foo.js","rootDir":"bar"}"#,
    );
}
