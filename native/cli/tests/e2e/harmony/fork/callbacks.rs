use super::support;
use crate::{
    commands::move_paths::support::{bitmap, compare, setup, successful},
    helper::{Helper, config},
};
use serde_json::json;
use std::fs;
fn configured() -> Helper {
    let helper = support::exported(1);
    let source = include_str!("callbacks.cjs");
    helper.output_file("fork-env/index.js", source);
    setup(&helper, "add fork-env -i env/fork");
    config::set_component_env(&helper.scopes.local_path, "env/fork", "teambit.envs/env");
    setup(&helper, "link");
    helper.output_file("fork-env/dist/index.js", source);
    setup(&helper, "tag env/fork --ignore-issues * --message provider");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/fork", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("fork-active", "active");
    helper
}
#[test]
fn local_fork_copies_actual_loaded_memory_and_runs_registered_onadd_in_order() {
    let helper = configured();
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = successful(&helper, "fork comp1 comp2 -x");
    assert_load_order(&result.stdout);
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
    let target = support::target(&helper, "comp2");
    assert!(
        fs::read_to_string(target.join("index.js"))
            .unwrap()
            .contains("fork source in-memory mutation"),
    );
    assert_eq!(
        fs::read_to_string(helper.scopes.local_path.join("fork-added")).unwrap(),
        "observed\n",
    );
}
#[test]
fn onadd_failure_retains_the_canonical_written_target_and_original_source() {
    let helper = configured();
    helper.output_file("fork-add-fails", "fail");
    let original = fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap();
    let result = compare(&helper, "fork comp1 comp2 -x");
    assert!(!result.status.success());
    assert!(result.stderr.contains("fixture fork onAdd rejected"));
    assert_load_order(&result.stdout);
    assert!(bitmap(&helper).get("comp2").is_some());
    assert!(support::target(&helper, "comp2").join("index.js").is_file());
    assert_eq!(fs::read(helper.scopes.local_path.join("comp1/index.js")).unwrap(), original);
}

fn assert_load_order(stdout: &str) {
    let source = stdout.find("fork source load").expect("actual source onLoad");
    let target = stdout.find("fork target load").expect("actual target onLoad");
    let added = stdout.find("fork target added").expect("actual onAdd");
    assert!(source < target && target < added, "actual callback order: {stdout}");
    let loader = stdout[..target]
        .rfind("- loading 1 component(s)")
        .expect("actual tracker loading status before target onLoad");
    assert!(source < loader, "tracker loader must precede its fresh target callback: {stdout}");
}
