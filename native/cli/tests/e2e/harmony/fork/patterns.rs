//! Local selection precedes remote selection; the released handler does not deduplicate ([`local_pattern_forks_both_sources_in_the_selected_scope`], [`mixed_pattern_finishes_local_copies_before_remote_copies`]).
//!
//! Verifies pattern matching order and partial failure behavior across workspace and remote scopes.

use super::support;
use crate::commands::move_paths::support::{self as paired, bitmap, setup, successful};

/// Verifies that comma-separated local component patterns fork all matching components into `--scope`.
#[test]
fn local_pattern_forks_both_sources_in_the_selected_scope() {
    let helper = paired::workspace(2, false);
    support::delay_copies(&helper);
    successful(
        &helper,
        &format!(r#"fork "{0}/comp1,{0}/comp2" --scope target.scope -x"#, helper.scopes.remote),
    );
    let ids = support::ids(&helper);
    for name in ["comp1", "comp2"] {
        assert!(ids.contains(&format!("target.scope/{name}")));
        assert!(ids.contains(&format!("{}/{name}", helper.scopes.remote)));
    }
}

/// Verifies a mixed local-and-remote pattern forks local matches before remote matches.
#[test]
fn mixed_pattern_finishes_local_copies_before_remote_copies() {
    let helper = support::remote_workspace(2);
    support::delay_copies(&helper);
    helper.output_file("local/index.js", "module.exports=1;\n");
    setup(&helper, "add local -i comp1 --scope local.one");
    let result = successful(
        &helper,
        &format!(
            r#"fork "local.one/comp1,{}/comp2" --scope target.scope -x"#,
            helper.scopes.remote,
        ),
    );
    let summary = result.stdout
        .split("forked 2 component(s)")
        .nth(1)
        .unwrap();
    assert!(
        summary.find("target.scope/comp1").unwrap() < summary.find("target.scope/comp2").unwrap(),
    );
    assert!(support::ids(&helper).contains(&"target.scope/comp1".into()));
    assert!(support::ids(&helper).contains(&"target.scope/comp2".into()));
}
/// Verifies duplicate workspace and remote matches during pattern `bit fork` retain the released partial failure.
#[test]
fn workspace_and_remote_duplicate_matches_retain_the_released_partial_failure() {
    let helper = support::exported(2);
    support::delay_copies(&helper);
    let originals = bitmap(&helper);
    let result = paired::compare(
        &helper,
        &format!(r#"fork "{}/*" --scope target.scope -x"#, helper.scopes.remote),
    );
    assert!(!result.status.success());
    support::assert_copy_barrier(&helper);
    let after = bitmap(&helper);
    assert_eq!(
        after[format!("{}/comp1", helper.scopes.remote)]["version"],
        originals["comp1"]["version"],
    );
    assert!(
        after
            .as_object()
            .unwrap()
            .values()
            .any(|row| row["defaultScope"] == "target.scope"),
    );
}
