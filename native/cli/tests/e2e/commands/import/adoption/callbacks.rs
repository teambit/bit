//! Real configured provider effects precede graph facts; write-deps loads published targets.
use super::{command, dependents, exported, file};
use crate::{
    commands::move_paths::support,
    helper::{Helper, config},
};
use serde_json::json;
fn configure(helper: &Helper) {
    let source = include_str!("callbacks.cjs");
    helper.output_file("adoption-provider/index.js", source);
    support::setup(helper, "add adoption-provider -i env/adoption --scope fixture.tools");
    config::set_component_env(&helper.scopes.local_path, "env/adoption", "teambit.envs/env");
    support::setup(helper, "link");
    helper.output_file("adoption-provider/dist/index.js", source);
    support::setup(helper, "tag env/adoption --ignore-issues * --message provider");
    config::set_workspace_key(&helper.scopes.local_path, "fixture.tools/env/adoption", json!({}));
    helper.output_file("adoption-provider-active", "active");
}
#[test]
fn configured_provider_source_changes_feed_the_authoritative_dependent_graph() {
    let helper = dependents::graph();
    configure(&helper);
    helper.output_file("adoption-provider-edit", "active");
    let result = super::successful(&helper, &command(&helper, "comp4", "--dependents --silent"));
    assert!(result.stdout.contains("adoption configured provider changed live dependencies"));
    assert!(helper.scopes.local_path.join("adoption-provider-observed").is_file());
    let entry = support::bitmap(&helper)["comp1"].clone();
    let receipt =
        config::read_jsonc(&helper.scopes.local_path.join("adoption-provider-edit-receipt.json"));
    let module = std::path::Path::new(receipt["module"].as_str().unwrap());
    assert!(module.is_file() && module.ends_with(std::path::Path::new("dist").join("index.js")));
    assert_eq!(
        std::path::Path::new(receipt["directory"].as_str().unwrap()),
        file(&helper, &entry, "index.js").parent().unwrap(),
    );
    assert_eq!(
        std::fs::read_to_string(file(&helper, &entry, "index.js")).unwrap(),
        format!("module.exports=require('@{}/comp2');\n", helper.scopes.remote),
    );
    dependents::assert_components(&helper, &["comp1", "comp2", "comp3", "comp4", "env/adoption"]);
}
#[test]
fn write_deps_onload_failure_retains_the_published_import_prefix_and_provider_output() {
    let helper = exported(2);
    support::setup(&helper, &command(&helper, "comp1", ""));
    configure(&helper);
    helper.output_file("adoption-target-load-fails", "active");
    let result = super::compare(&helper, &command(&helper, "comp2", "--write-deps package.json"));
    assert!(!result.status.success());
    assert!(result.stdout.contains("adoption configured provider started"));
    assert!(result.stdout.contains("adoption imported target load"));
    assert!(result.stderr.contains("adoption imported target rejected"));
    let entry = support::bitmap(&helper)["comp2"].clone();
    assert!(file(&helper, &entry, "index.js").is_file());
    assert!(helper.scopes.local_path.join("adoption-provider-observed").is_file());
}

#[test]
fn first_graph_seeder_onload_failure_precedes_second_seeders_dependency_cache_publication() {
    let helper = dependents::graph();
    support::setup(&helper, &command(&helper, "comp2", ""));
    configure(&helper);
    stale_seeder_sources(&helper);
    helper.output_file("adoption-graph-load-fails", "active");
    let result = super::compare(&helper, &command(&helper, "comp4", "--dependents --silent"));
    assert!(!result.status.success());
    assert!(result.stdout.contains(&format!(
        "adoption graph seeder load {}/comp1",
        helper.scopes.remote,
    )));
    assert!(!result.stdout.contains(&format!(
        "adoption graph seeder load {}/comp2",
        helper.scopes.remote,
    )));
    assert!(result.stderr.contains("adoption first graph seeder rejected"));
    assert!(!helper.scopes.local_path.join("adoption-second-seeder-observed").exists());
    assert!(support::bitmap(&helper).get("comp4").is_none());
}
fn stale_seeder_sources(helper: &Helper) {
    let bitmap = support::bitmap(helper);
    for name in ["comp1", "comp2"] {
        let path = file(helper, &bitmap[name], "index.js");
        let mut source = std::fs::read_to_string(&path).unwrap();
        source.push_str("\n// force fresh graph dependency capture before onLoad\n");
        std::fs::write(path, source).unwrap();
    }
}

#[test]
fn graph_write_deps_loads_new_target_classes_in_the_released_insertion_order() {
    let helper = dependents::graph();
    configure(&helper);
    helper.output_file("adoption-record-load-order", "active");
    super::successful(
        &helper,
        &command(&helper, "comp4", "--dependents --silent --write-deps package.json"),
    );
    let bytes = std::fs::read_to_string(helper.scopes.local_path.join("adoption-load-order.jsonl"))
        .unwrap();
    let ids = bytes
        .lines()
        .map(|line| serde_json::from_str::<String>(line).unwrap())
        .collect::<Vec<_>>();
    assert_new_target_order(&helper, &ids);
}
fn assert_new_target_order(helper: &Helper, ids: &[String]) {
    let first = |name: &str| {
        let expected = format!("{}/{name}@0.0.1", helper.scopes.remote);
        ids.iter()
            .position(|id| id == &expected)
            .unwrap_or_else(|| panic!("missing {expected} in {ids:?}"))
    };
    let mut previous = first("comp1");
    for name in ["comp4", "comp-a", "comp-a2", "comp3", "comp2"] {
        let next = first(name);
        assert!(previous < next, "actual class load order {ids:?}");
        previous = next;
    }
}
