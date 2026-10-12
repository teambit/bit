use super::error_path_for_platform;
#[test]
fn canonical_error_paths_preserve_nested_platform_separators() {
    assert_eq!(error_path_for_platform("nested/deep/file.ts", true), r"nested\deep\file.ts");
    assert_eq!(error_path_for_platform("nested/deep/file.ts", false), "nested/deep/file.ts");
}

use super::{File, effects};
use crate::checkout_transition::plan;
use serde_json::{Map, json};
use std::path::PathBuf;
fn alias_plan(row: serde_json::Value) -> plan::Plan {
    plan::Plan {
        bodies: vec![plan::Body::new(b"same".to_vec())],
        target: vec![],
        target_indices: vec![],
        current: vec![plan::Current {
            relative_path: "index.ts".into(),
            path: PathBuf::new(),
            protected: false,
            plan_index: 0,
            shares_buffer: true,
            raw_hash: "1".repeat(40),
        }],
        merge_rows: vec![row],
        has_conflicts: true,
        statuses: vec![],
        other: None,
    }
}
#[test]
fn equal_byte_binary_and_updated_assignments_keep_causal_buffer_aliases() {
    for (row, alias) in [
        (json!({"kind":"modifiedFiles","current":0,"isBinaryConflict":true}), "current"),
        (json!({"kind":"updatedFiles","current":0,"other":7,"bodyPlanIndex":0}), "other"),
        (json!({"kind":"modifiedFiles","current":0,"outputPlanIndex":0}), "new"),
    ] {
        let plan = alias_plan(row);
        let mut files = vec![File {
            kind: "target",
            index: 3,
            plan_index: 0,
            path: "index.ts".into(),
            alias_kind: "target",
            alias_index: 3,
        }];
        assert!(effects::apply(&plan, &mut files, &mut Map::new()).expect("effect").is_none());
        assert_eq!(files[0].kind, "target");
        assert_eq!(files[0].index, 3);
        assert_eq!(files[0].plan_index, 0);
        assert_eq!(files[0].alias_kind, alias);
        if alias == "other" {
            assert_eq!(files[0].alias_index, 7);
        }
    }
}
