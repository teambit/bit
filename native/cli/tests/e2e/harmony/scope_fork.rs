//! Scope fork keeps remote sources immutable while publishing independent copies.
use crate::{
    commands::move_paths::support::{self, bitmap, setup, successful},
    harmony::fork,
    helper::remote,
};
#[test]
fn scope_fork_reports_every_copy_and_preserves_original_scope_and_name() {
    let helper = fork::remote_workspace(3);
    fork::delay_copies(&helper);
    let result = successful(&helper, &format!("scope fork {} org.scope -x", helper.scopes.remote));
    for name in ["comp1", "comp2", "comp3"] {
        assert!(result.stdout.contains(&format!("org.scope/{name}")));
    }
    assert_eq!(
        fork::ids(&helper),
        [
            "fixture.tools/env/fork-batch-barrier",
            "org.scope/comp1",
            "org.scope/comp2",
            "org.scope/comp3"
        ],
    );
    fork::assert_origins(&helper, &["comp1", "comp2", "comp3"]);
}
#[test]
fn scope_fork_filters_partial_patterns_with_an_explicit_target_scope() {
    let helper = fork::remote_workspace(3);
    fork::delay_copies(&helper);
    successful(&helper, &format!("scope fork {} my-scope comp1,comp3 -x", helper.scopes.remote));
    assert_eq!(
        fork::ids(&helper),
        ["fixture.tools/env/fork-batch-barrier", "my-scope/comp1", "my-scope/comp3"],
    );
    fork::assert_origins(&helper, &["comp1", "comp3"]);
}
#[test]
fn scope_fork_resolves_component_name_prefixes_without_nested_root_ownership() {
    let helper = support::workspace(1, true);
    remote::publish(&helper);
    helper.output_file("member/index.js", "module.exports='nested-name';\n");
    setup(&helper, "add member -i comp1/ui");
    setup(&helper, "tag comp1/ui --ignore-issues * --message nested");
    remote::publish(&helper);
    helper.re_init_workspace();
    helper.add_remote_scope();
    fork::delay_copies(&helper);
    successful(&helper, &format!("scope fork {} org.scope -x", helper.scopes.remote));
    assert_eq!(
        fork::ids(&helper),
        ["fixture.tools/env/fork-batch-barrier", "org.scope/comp1", "org.scope/comp1/ui"],
    );
    let map = bitmap(&helper);
    let roots = map
        .as_object()
        .unwrap()
        .values()
        .filter_map(|row| row["rootDir"].as_str())
        .collect::<Vec<_>>();
    for (index, root) in roots.iter().enumerate() {
        assert!(
            roots
                .iter()
                .skip(index + 1)
                .all(|other| {
                    !root.starts_with(&format!("{other}/"))
                        && !other.starts_with(&format!("{root}/"))
                }),
        );
    }
    fork::assert_origins(&helper, &["comp1", "comp1/ui"]);
}
#[test]
fn scope_fork_rejects_an_original_already_tracked_with_the_same_scope() {
    let helper = fork::exported(1);
    let result =
        support::compare(&helper, &format!("scope fork {} org.scope -x", helper.scopes.remote));
    assert!(!result.status.success());
    assert!(result.stderr.contains("same name and same scope"));
    assert!(bitmap(&helper).get("comp1").is_some());
}

#[test]
fn scope_fork_ast_refactors_cross_component_imports_to_the_new_scope() {
    let helper = support::workspace(2, false);
    helper.output_file(
        "comp1/index.js",
        &format!("module.exports=require('@{}/comp2');\n", helper.scopes.remote),
    );
    setup(&helper, "tag --ignore-issues * --message chain");
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    fork::delay_copies(&helper);
    successful(&helper, &format!("scope fork {} org.scope --ast -x", helper.scopes.remote));
    let map = bitmap(&helper);
    let directory = map["comp1"]["rootDir"].as_str().unwrap();
    let source =
        std::fs::read_to_string(helper.scopes.local_path.join(directory).join("index.js")).unwrap();
    assert!(source.contains("@org/scope.comp2"));
    assert!(!source.contains(&format!("@{}/comp2", helper.scopes.remote)));
}

#[test]
fn scope_fork_without_a_target_uses_the_actual_workspace_default_scope() {
    let helper = fork::remote_workspace(1);
    successful(&helper, &format!("scope fork {} -x", helper.scopes.remote));
    assert_eq!(fork::ids(&helper), ["my-scope/comp1"]);
    fork::assert_origins(&helper, &["comp1"]);
}
