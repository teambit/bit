use super::support;
use crate::commands::move_paths::support::{compare, json, successful};

#[test]
fn remote_fork_defaults_the_target_name_and_retains_scoped_original_provenance() {
    let helper = support::remote_workspace(1);
    successful(&helper, &format!("fork {}/comp1 -x", helper.scopes.remote));
    assert_eq!(
        json(&helper, "status --json")["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    assert_eq!(support::ids(&helper), ["my-scope/comp1"]);
    support::assert_origins(&helper, &["comp1"]);
}
#[test]
fn remote_wildcard_forks_each_matching_component_into_the_requested_scope() {
    let helper = support::remote_workspace(2);
    support::delay_copies(&helper);
    successful(&helper, &format!(r#"fork "{}/*" --scope target.scope -x"#, helper.scopes.remote));
    assert_eq!(
        json(&helper, "status --json")["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        support::ids(&helper),
        ["fixture.tools/env/fork-batch-barrier", "target.scope/comp1", "target.scope/comp2"],
    );
    support::assert_origins(&helper, &["comp1", "comp2"]);
}
#[test]
fn comma_separated_remote_ids_fork_only_the_requested_components() {
    let helper = support::remote_workspace(3);
    support::delay_copies(&helper);
    successful(
        &helper,
        &format!(r#"fork "{0}/comp1,{0}/comp3" --scope target.scope -x"#, helper.scopes.remote),
    );
    assert_eq!(
        json(&helper, "status --json")["newComponents"]
            .as_array()
            .unwrap()
            .len(),
        2,
    );
    assert_eq!(
        support::ids(&helper),
        ["fixture.tools/env/fork-batch-barrier", "target.scope/comp1", "target.scope/comp3"],
    );
    support::assert_origins(&helper, &["comp1", "comp3"]);
}
#[test]
fn pattern_with_an_explicit_target_preserves_the_released_validation_error() {
    let helper = support::remote_workspace(2);
    let result = compare(&helper, &format!(r#"fork "{}/*" comp2 -x"#, helper.scopes.remote));
    assert!(!result.status.success());
    assert!(result.stderr.contains("target-component-name is not allowed when using patterns"));
}
#[test]
fn remote_single_refactor_fails_before_any_component_is_tracked() {
    let helper = support::remote_workspace(1);
    let result =
        compare(&helper, &format!("fork {}/comp1 comp2 --refactor -x", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(result.stderr.contains("you can't use the --refactor flag"));
    assert!(support::ids(&helper).is_empty());
}

#[test]
fn remote_single_no_link_omits_provenance_while_materializing_a_new_component() {
    let helper = support::remote_workspace(1);
    successful(&helper, &format!("fork {}/comp1 comp-copy --no-link -x", helper.scopes.remote));
    assert!(
        crate::commands::move_paths::support::aspect(&helper, "comp-copy", support::FORK).is_none(),
    );
    assert_eq!(support::ids(&helper), ["my-scope/comp-copy"]);
}

#[test]
fn remote_missing_id_failure_preserves_the_canonical_repository_prefix() {
    let helper = support::remote_workspace(1);
    let result = compare(&helper, &format!("fork {}/missing comp-copy -x", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(support::ids(&helper).is_empty());
}
