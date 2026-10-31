use crate::{
    commands::move_paths::support,
    helper::{Helper, config, remote},
};
use serde_json::{Value, json};
use std::fs;
pub(super) const FORK: &str = "teambit.component/forking";
pub(in crate::harmony) fn exported(count: usize) -> Helper {
    let helper = support::workspace(count, true);
    remote::publish(&helper);
    helper
}
pub(in crate::harmony) fn remote_workspace(count: usize) -> Helper {
    let helper = exported(count);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    helper
}
pub(super) fn target(helper: &Helper, name: &str) -> std::path::PathBuf {
    let map = config::read_jsonc(&helper.scopes.local_path.join(".bitmap"));
    let row = map
        .as_object()
        .unwrap()
        .values()
        .find(|row| row["name"] == name)
        .unwrap();
    helper.scopes.local_path.join(row["rootDir"].as_str().unwrap())
}
pub(in crate::harmony) fn assert_origins(helper: &Helper, names: &[&str]) {
    assert_copy_barrier(helper);
    for name in names {
        let origin = support::aspect(helper, name, FORK).unwrap();
        assert_eq!(origin["forkedFrom"]["scope"], helper.scopes.remote);
        assert_eq!(origin["forkedFrom"]["name"], *name);
    }
}
pub(in crate::harmony) fn ids(helper: &Helper) -> Vec<String> {
    assert_copy_barrier(helper);
    let mut ids = support::json(helper, "list --json")
        .as_array()
        .unwrap()
        .iter()
        .map(|row| row["id"].as_str().unwrap().to_owned())
        .collect::<Vec<_>>();
    ids.sort();
    ids
}
pub(super) fn component_config(helper: &Helper, name: &str, value: Value) {
    let mut map = support::bitmap(helper);
    map[name]["config"] = value;
    fs::write(helper.scopes.local_path.join(".bitmap"), serde_json::to_vec_pretty(&map).unwrap())
        .unwrap();
}

pub(in crate::harmony) fn delay_copies(helper: &Helper) {
    let source = include_str!("batch_barrier.cjs");
    helper.output_file("fork-batch-barrier/index.js", source);
    support::setup(
        helper,
        "add fork-batch-barrier -i env/fork-batch-barrier --scope fixture.tools",
    );
    config::set_component_env(
        &helper.scopes.local_path,
        "env/fork-batch-barrier",
        "teambit.envs/env",
    );
    support::setup(helper, "link");
    helper.output_file("fork-batch-barrier/dist/index.js", source);
    support::setup(
        helper,
        "tag env/fork-batch-barrier --ignore-issues * --message history-barrier",
    );
    config::set_workspace_key(
        &helper.scopes.local_path,
        "fixture.tools/env/fork-batch-barrier",
        json!({}),
    );
    copy_environment(helper);
}
fn copy_environment(helper: &Helper) {
    let environment = json!({
        "fixture.tools/env/fork-batch-barrier":{},
        "teambit.envs/envs":{"env":"fixture.tools/env/fork-batch-barrier"}
    });
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.workspace/variants",
        json!({"{comp*}":environment,"{comp*/**}":environment}),
    );
    helper.output_file("fork-batch-required", "actual target env onAdd barrier required\n");
}

/// Prove that scope subcommands loaded the real env and reached its onAdd slot.
pub(super) fn assert_copy_barrier(helper: &Helper) {
    if helper.scopes.local_path.join("fork-batch-required").exists() {
        let observed = fs::read_to_string(helper.scopes.local_path.join("fork-batch-observed"))
            .expect("actual fork batch onAdd barrier did not run");
        assert!(!observed.is_empty());
    }
}
