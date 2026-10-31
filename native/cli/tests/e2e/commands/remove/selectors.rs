//! Workspace state filters retain loader phases and cached classes through removal.
use crate::commands::move_paths::support::{self, bitmap, setup, successful};
use std::fs;

#[test]
fn new_selector_preserves_tagged_components() {
    let helper = support::workspace(2, false);
    setup(&helper, "tag comp1 --ignore-issues * --message first");
    successful(&helper, "remove $new --silent --keep-files");
    assert!(bitmap(&helper).get("comp1").is_some());
    assert!(bitmap(&helper).get("comp2").is_none());
}
#[test]
fn modified_and_file_only_selectors_remove_only_the_changed_member() {
    for state in ["$modified", "$codeModified"] {
        let helper = support::workspace(2, true);
        helper.output_file("comp1/index.js", "module.exports='changed';\n");
        successful(&helper, &format!("remove {state} --silent --force --keep-files"));
        assert!(bitmap(&helper).get("comp1").is_none());
        assert!(bitmap(&helper).get("comp2").is_some());
    }
}
#[test]
fn ordered_env_intersections_and_repeated_unions_preserve_cache_hits() {
    let helper = support::workspace(2, true);
    successful(
        &helper,
        r#"remove "**/comp1,$env:teambit.harmony/node AND comp2,$env:teambit.harmony/node AND comp2" --silent --force --keep-files"#,
    );
    assert!(bitmap(&helper).get("comp1").is_none());
    assert!(bitmap(&helper).get("comp2").is_none());
}
#[test]
fn local_only_and_soft_tagged_selection_preserve_other_rows() {
    for state in ["$localOnly", "$softTagged"] {
        let helper = support::workspace(2, false);
        if state == "$softTagged" {
            setup(&helper, "tag comp1 --soft --message pending");
        } else {
            let mut map = bitmap(&helper);
            map["comp1"]["localOnly"] = true.into();
            fs::write(
                helper.scopes.local_path.join(".bitmap"),
                serde_json::to_vec_pretty(&map).unwrap(),
            )
            .unwrap();
        }
        successful(&helper, &format!("remove {state} --silent --force --keep-files"));
        assert!(bitmap(&helper).get("comp1").is_none());
        assert!(bitmap(&helper).get("comp2").is_some());
    }
}
#[test]
fn state_errors_and_missing_main_failures_preserve_the_workspace() {
    for state in ["$notAState", "$env:not/an-env", "$modified"] {
        let helper = support::workspace(1, true);
        if state == "$modified" {
            fs::remove_file(helper.scopes.local_path.join("comp1/index.js")).unwrap();
        }
        let result = support::compare(&helper, &format!("remove {state} --silent --force"));
        assert!(!result.status.success());
        assert!(bitmap(&helper).get("comp1").is_some());
    }
}
#[test]
fn configured_selector_and_later_status_reuse_the_same_loaded_class() {
    let helper = super::completion::configured(true);
    let result = successful(&helper, r#"remove "$env:teambit.harmony/node AND comp1" --silent"#);
    assert_eq!(result.stdout.matches("identity provider mutation").count(), 1);
    assert!(bitmap(&helper).get("comp1").is_some());
}
