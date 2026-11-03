//! End-to-end tests ([`successful`]) verifying soft deletion shares workspace state/env predicates without recovery's scope-pool semantics.
//!
//! Verifies `$modified`, `$codeModified`, and `$env` intersection/union selectors in [`bitmap`] via [`successful`].

use crate::commands::move_paths::support::{self, bitmap, successful};

/// Verifies `$modified` and `$codeModified` selectors soft-delete only the modified component via [`successful`] and [`bitmap`].
#[test]
fn modified_and_code_modified_delete_only_the_selected_component() {
    for state in ["$modified", "$codeModified"] {
        let helper = support::workspace(2, true);
        helper.output_file("comp1/index.js", "module.exports='changed';\n");
        successful(&helper, &format!("delete {state} --silent"));
        let map = bitmap(&helper);
        assert_eq!(map["comp1"]["config"]["teambit.component/remove"]["removed"], true);
        assert!(map["comp2"]["config"]["teambit.component/remove"].is_null());
    }
}
/// Verifies `$env` intersection and union patterns soft-delete each matching component once via [`successful`] and [`bitmap`].
#[test]
fn env_intersection_and_union_delete_each_member_once() {
    let helper = support::workspace(2, true);
    successful(&helper, r#"delete "$env:teambit.harmony/node AND comp1,**/comp2" --silent"#);
    let map = bitmap(&helper);
    for name in ["comp1", "comp2"] {
        assert_eq!(map[name]["config"]["teambit.component/remove"]["removed"], true);
    }
}
/// Verifies `$new` and `$unknown` selector errors fail via [`support::compare`] without modifying [`bitmap`].
#[test]
fn new_and_unknown_state_errors_do_not_publish_deletion() {
    for state in ["$new", "$unknown"] {
        let helper = support::workspace(1, false);
        let before = bitmap(&helper);
        let result = support::compare(&helper, &format!("delete {state} --silent"));
        assert!(!result.status.success());
        assert_eq!(bitmap(&helper), before);
    }
}
