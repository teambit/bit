//! Lane adoption compares the released command at the same absolute workspace path.
pub(crate) mod callbacks;
pub(crate) mod output;

mod conflicts;
mod environment;
mod reporter;
mod selection;
mod subscribers;

use crate::{
    commands::move_paths::support,
    helper::{Helper, config, remote},
};

fn exported(count: usize) -> Helper {
    let helper = support::workspace(count, false);
    for index in 1..=count {
        config::set_component_env(
            &helper.scopes.local_path,
            &format!("comp{index}"),
            "teambit.harmony/empty-env",
        );
    }
    support::tag(&helper);
    remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    helper.append_file("comp1/index.js", "\n// lane version\n");
    support::setup(&helper, "snap --unmodified --ignore-issues * --message lane");
    remote::publish(&helper);
    helper
}
fn empty(helper: &Helper) {
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
}
fn lane(helper: &Helper) -> String {
    format!("{}/dev", helper.scopes.remote)
}

#[test]
fn remote_alias_preserves_both_local_alias_and_remote_name_lookup() {
    let helper = exported(1);
    empty(&helper);
    selection::two_write_success(&helper, &format!("switch {} -n adopted -x", lane(&helper)));
    let local = support::json(&helper, "lane show adopted --json");
    let remote = support::json(&helper, "lane show dev --json");
    assert_eq!(local["components"], remote["components"]);
    assert_eq!(
        local["components"]
            .as_array()
            .unwrap()
            .len(),
        1,
    );
    selection::two_write_success(&helper, "switch main -x");
    selection::two_write_success(&helper, "switch adopted --skip-fetch -x");
}

#[test]
fn json_switch_fails_before_adoption_because_the_released_handler_is_absent() {
    let helper = exported(2);
    empty(&helper);
    let before = support::bitmap(&helper);
    let output = support::compare_declined(
        &helper,
        &format!("switch {} --json", lane(&helper)),
        str::to_owned,
    );
    assert!(!output.status.success());
    let diagnostic = format!("{}{}", output.stdout, output.stderr);
    assert!(diagnostic.contains(r#"doesn't implement "json" method"#));
    assert_eq!(support::bitmap(&helper), before);
    assert!(!helper.scopes.local_path.join("pnpm-lock.yaml").exists());
}

#[test]
fn remote_pattern_performs_real_default_installation() {
    let helper = exported(2);
    empty(&helper);
    reporter::configure(&helper);
    let command = format!("switch {} -p {}/comp1", lane(&helper), helper.scopes.remote);
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        &command,
        output::durations,
        ["checkout", "lane-switch"],
        true,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let bitmap = support::bitmap(&helper);
    assert!(bitmap.get("comp1").is_some());
    assert!(bitmap.get("comp2").is_none());
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    reporter::assert_receipt(&helper);
}

#[test]
fn lane_import_pattern_adopts_only_selected_component_on_main() {
    let helper = exported(2);
    empty(&helper);
    selection::two_write_success(
        &helper,
        &format!("lane import {} -p {}/comp2 -x", lane(&helper), helper.scopes.remote),
    );
    let bitmap = support::bitmap(&helper);
    assert!(bitmap.get("comp1").is_none());
    assert!(bitmap.get("comp2").is_some());
}

#[test]
fn remote_pattern_default_installation_without_root_components_preserves_all_state() {
    default_installation_without_roots(false);
}

#[test]
fn ci_default_installation_without_root_components_preserves_exact_output_and_state() {
    default_installation_without_roots(true);
}

fn default_installation_without_roots(ci: bool) {
    let helper = exported(2);
    empty(&helper);
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut workspace = config::read_jsonc(&path);
    let resolver = workspace
        .as_object_mut()
        .unwrap()
        .entry("teambit.dependencies/dependency-resolver")
        .or_insert_with(|| serde_json::json!({}));
    resolver["rootComponents"] = serde_json::json!(false);
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        resolver.clone(),
    );
    let command = format!("switch {} -p {}/comp1", lane(&helper), helper.scopes.remote);
    let compare = if ci {
        crate::commands::add::support::history_oracle::compare_ci
    } else {
        crate::commands::add::support::history_oracle::compare
    };
    let output = compare(&helper, &command, output::durations, ["checkout", "lane-switch"], true);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let bitmap = support::bitmap(&helper);
    assert!(bitmap.get("comp1").is_some());
    assert!(bitmap.get("comp2").is_none());
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    let workspace = config::read_jsonc(&path);
    assert_eq!(workspace["teambit.dependencies/dependency-resolver"]["rootComponents"], false);
}
