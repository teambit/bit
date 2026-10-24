use crate::{
    commands::move_paths::support::{self, bitmap, compare, setup, successful},
    helper::{Helper, config, remote},
};
use serde_json::json;
fn configured(environment: bool) -> Helper {
    let helper = support::workspace(2, true);
    remote::publish(&helper);
    let source = include_str!("callbacks.cjs");
    helper.output_file("scope-lifecycle/index.js", source);
    setup(&helper, "add scope-lifecycle -i env/scope-lifecycle");
    setup(&helper, "scope set fixture.tools env/scope-lifecycle");
    config::set_component_env(&helper.scopes.local_path, "env/scope-lifecycle", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("scope-lifecycle/dist/index.js", source);
    setup(&helper, "tag env/scope-lifecycle --ignore-issues * --message provider");
    config::set_workspace_key(
        &helper.scopes.local_path,
        "fixture.tools/env/scope-lifecycle",
        json!({}),
    );
    if environment {
        for name in ["comp1", "comp2"] {
            config::set_component_env(
                &helper.scopes.local_path,
                name,
                "fixture.tools/env/scope-lifecycle",
            );
        }
        setup(&helper, "link");
    }
    helper.output_file("scope-lifecycle-active", "active");
    helper
}
#[test]
fn batch_loads_all_originals_before_adding_and_invokes_real_registered_onadd_callbacks() {
    let helper = configured(true);
    let old = helper.scopes.remote.clone();
    let output = successful(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve --deprecate -x"),
    );
    let addition = output.stdout.find("scope lifecycle added replacement.scope/comp1").unwrap();
    for name in ["comp1", "comp2"] {
        assert!(
            output.stdout
                .find(&format!("scope lifecycle load {old}/{name}"))
                .unwrap()
                < addition,
        );
        assert!(
            helper.scopes.local_path
                .join(format!("scope-added-{name}"))
                .is_file(),
        );
    }
}
#[test]
fn second_onadd_failure_preserves_the_first_renamed_component_and_the_second_add_prefix() {
    let helper = configured(true);
    helper.output_file("scope-second-add-fails", "fail");
    let old = helper.scopes.remote.clone();
    let output = compare(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve --deprecate -x"),
    );
    assert!(!output.status.success());
    assert!(output.stdout.contains("scope lifecycle added replacement.scope/comp2"));
    let map = bitmap(&helper);
    assert!(
        map.as_object()
            .unwrap()
            .values()
            .any(|row| row["name"] == "comp1"
                && row["config"]["teambit.component/deprecation"]["deprecate"] == true),
    );
    assert!(
        !map.as_object()
            .unwrap()
            .values()
            .any(|row| row["name"] == "comp2"
                && row["config"]["teambit.component/deprecation"]["deprecate"] == true),
    );
}

#[test]
fn later_onload_failure_stops_before_any_scope_addition() {
    let helper = configured(true);
    helper.output_file("scope-second-load-fails", "fail");
    let old = helper.scopes.remote.clone();
    let output = compare(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve --deprecate -x"),
    );
    assert!(!output.status.success());
    assert!(output.stdout.contains(&format!("scope lifecycle load {old}/comp1")));
    assert!(output.stdout.contains(&format!("scope lifecycle load {old}/comp2")));
    assert!(!output.stdout.contains("scope lifecycle added"));
    assert!(!helper.scopes.local_path.join("scope-added-comp1").exists());
}

#[test]
fn first_onload_mutation_is_seen_by_later_source_capture() {
    let helper = configured(true);
    helper.output_file("scope-mutate-later-source", "mutate");
    let old = helper.scopes.remote.clone();
    let output = compare(
        &helper,
        &format!("scope rename {old} replacement.scope --preserve --deprecate -x"),
    );
    assert!(output.status.success());
    assert!(output.stdout.contains("scope lifecycle later source observed"));
}

#[test]
fn root_only_configured_provider_is_not_started_for_late_registered_scope_subcommands() {
    let helper = configured(false);
    config::set_workspace_aspect_key(
        &helper.scopes.local_path,
        "defaultScope",
        json!("unselected.scope"),
    );
    let output = successful(&helper, "scope rename unselected.scope replacement.scope -x");
    assert!(!output.stdout.contains("scope lifecycle"));
    assert!(!helper.scopes.local_path.join("scope-provider-started").exists());
}
