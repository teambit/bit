//! Actual published `InstallMain` slots and mutable dependency-installer subscribers.

use crate::{
    commands::move_paths::support,
    helper::{Helper, config},
};
use serde_json::{Value, json};
use std::{fmt::Write, fs};

fn configured() -> Helper {
    let helper = support::workspace(1, true);
    finish_configured(helper)
}

fn minimal_merge_configured() -> Helper {
    let helper = support::workspace(1, false);
    config::set_component_env(&helper.scopes.local_path, "comp1", "teambit.harmony/empty-env");
    let path = helper.scopes.local_path.join("workspace.jsonc");
    let mut workspace = config::read_jsonc(&path);
    workspace["teambit.dependencies/dependency-resolver"]["policy"] =
        json!({"dependencies":{},"devDependencies":{},"peerDependencies":{}});
    config::write_json(&path, &workspace, b"  ");
    support::tag(&helper);
    finish_configured(helper)
}

fn finish_configured(helper: Helper) -> Helper {
    configure_provider(&helper);
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&bitmap_path);
    let aspect = format!("{}/env/install-compat", helper.scopes.remote);
    bitmap["comp1"]["config"][aspect.as_str()] = json!({});
    config::write_json(&bitmap_path, &bitmap, b"    ");
    crate::helper::remote::publish(&helper);
    helper.output_file("install-compat-active", "active");
    helper
}

fn remote_fork_configured() -> Helper {
    let helper = support::workspace(1, false);
    config::set_component_env(&helper.scopes.local_path, "comp1", "teambit.harmony/empty-env");
    support::tag(&helper);
    crate::helper::remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    configure_provider(&helper);
    crate::helper::remote::publish(&helper);
    helper.output_file("install-compat-active", "active");
    helper
}

fn configure_provider(helper: &Helper) {
    let source = include_str!("install_compat.cjs");
    helper.output_file("install-compat/index.js", source);
    support::setup(
        helper,
        &format!("add install-compat -i env/install-compat --scope {}", helper.scopes.remote),
    );
    config::set_component_env(
        &helper.scopes.local_path,
        "env/install-compat",
        "teambit.harmony/empty-env",
    );
    let bitmap_path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&bitmap_path);
    bitmap["env/install-compat"]["config"]["teambit.pkg/pkg"] = json!({
        "packageJson":{"main":"dist/index.js"}
    });
    config::write_json(&bitmap_path, &bitmap, b"    ");
    support::setup(helper, "link");
    helper.output_file("install-compat/dist/index.js", source);
    support::setup(helper, "tag env/install-compat --ignore-issues * --message provider");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/install-compat", helper.scopes.remote),
        json!({}),
    );
}

fn phases(helper: &Helper) -> Vec<String> {
    let path = helper.scopes.local_path.join("install-compat-phases");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Vec::new(),
        Err(error) => panic!("{}: {error}", path.display()),
    };
    text.lines()
        .map(str::to_owned)
        .collect()
}

pub(super) fn install_output(text: &str) -> String {
    let projected = super::fork::installation::project_startup_frame(text);
    let timed = super::lane_adoption::output::durations(&projected);
    let mut output = String::new();
    for line in timed.split_inclusive('\n') {
        let body = line.trim_end_matches(['\r', '\n']);
        let Some(rest) = body.strip_prefix("Successfully installed dependencies and compiled ")
        else {
            output.push_str(line);
            continue;
        };
        let Some((count, seconds)) = rest.split_once(" in ") else {
            output.push_str(line);
            continue;
        };
        let Some(value) = seconds.strip_suffix(" seconds") else {
            output.push_str(line);
            continue;
        };
        assert!(count.ends_with(" component(s)"), "{body}");
        assert!(
            value
                .parse::<f64>()
                .is_ok_and(|number| number.is_finite() && number >= 0.0),
            "{body}",
        );
        write!(
            output,
            "Successfully installed dependencies and compiled {count} in <seconds> seconds{}",
            &line[body.len()..],
        )
        .unwrap();
    }
    output
}

fn fork_command(helper: &Helper) -> String {
    format!("fork {}/comp1", helper.scopes.remote)
}

fn checkout_second_tag(helper: &Helper) {
    helper.output_file("comp1/index.js", "module.exports=()=> 'comp1 version2';\n");
    support::setup(helper, "tag comp1 --ignore-issues * --message second");
    let _ = fs::remove_file(helper.scopes.local_path.join("install-compat-phases"));
}

fn planning_receipt(helper: &Helper) -> Value {
    serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join("install-compat-planning.json")).unwrap(),
    )
    .unwrap()
}

fn merge_ready() -> Helper {
    merge_ready_with(configured())
}

fn merge_ready_minimal() -> Helper {
    let helper = merge_ready_with(minimal_merge_configured());
    let _ = fs::remove_file(helper.scopes.local_path.join("install-compat-planning.json"));
    helper
}

fn merge_ready_with(helper: Helper) -> Helper {
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "lane create install-dev");
    helper.output_file("comp1/index.js", "module.exports=()=> 'comp1 lane';\n");
    support::setup(&helper, "snap comp1 --message lane");
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "switch main --force-theirs -x");
    helper.output_file("comp1/index.js", "module.exports=()=> 'comp1 main';\n");
    support::setup(&helper, "tag comp1 --ignore-issues * --message main");
    crate::helper::remote::publish(&helper);
    let _ = fs::remove_file(helper.scopes.local_path.join("install-compat-phases"));
    helper
}

#[test]
fn direct_install_delegates_before_custom_callbacks() {
    let helper = configured();
    let result =
        crate::commands::add::support::compare_install_declined(&helper, "install", install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert_eq!(phases(&helper), ["install-pre", "manager-pre", "manager-run", "manager-post"]);
}

#[test]
fn retained_fork_install_runs_published_slots_and_mutable_receiver_once() {
    let helper = remote_fork_configured();
    let result = support::compare_install(&helper, &fork_command(&helper), install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert_eq!(phases(&helper), ["install-pre", "manager-pre", "manager-run", "manager-post"]);
    let receipt: Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join("install-compat-receiver.json")).unwrap(),
    )
    .unwrap();
    assert_eq!(receipt["sameInstaller"], true);
    assert_eq!(receipt["sameArgs"], true);
    assert_eq!(receipt["sameOptions"], false);
    assert_eq!(receipt["samePackageOptions"], true);
    assert_eq!(receipt["optional"], false);
    assert_eq!(receipt["reassignedRoot"], true);
}

#[test]
fn retained_install_pre_failure_does_not_replay_or_start_package_manager() {
    let helper = remote_fork_configured();
    helper.output_file("install-compat-fail-pre", "active");
    let result = support::compare_with_stdout(&helper, &fork_command(&helper), install_output);
    assert!(!result.status.success());
    assert_eq!(phases(&helper), ["install-pre"]);
}

#[test]
fn retained_install_package_failure_preserves_post_and_outer_failure_order() {
    let helper = remote_fork_configured();
    helper.output_file("install-compat-fail-pm", "active");
    let result = support::compare_with_stdout(&helper, &fork_command(&helper), install_output);
    assert!(!result.status.success());
    assert_eq!(phases(&helper), ["install-pre", "manager-pre", "manager-run"]);
}

#[test]
fn configured_checkout_install_failure_keeps_native_owner_and_graceful_report() {
    let helper = configured();
    checkout_second_tag(&helper);
    helper.output_file("install-compat-fail-pre", "active");
    let result = support::compare_with_stdout(&helper, "checkout 0.0.1 comp1", install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(result.stdout.contains("Installation Error"), "{}", result.stdout);
    assert_eq!(phases(&helper), ["install-pre"]);
    assert_eq!(planning_receipt(&helper)["seenComp1"], true);
}

#[test]
fn configured_checkout_keeps_provider_memory_through_install() {
    let helper = configured();
    checkout_second_tag(&helper);
    let result = support::compare_install(&helper, "checkout 0.0.1 comp1", install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert_eq!(phases(&helper), ["install-pre", "manager-pre", "manager-run", "manager-post"]);
    assert_eq!(planning_receipt(&helper)["seenComp1"], true);
}

#[test]
fn configured_lane_merge_leaves_unloaded_provider_out_of_install() {
    let helper = merge_ready_minimal();
    let result = support::compare_install(
        &helper,
        "lane merge install-dev --auto-merge-resolve theirs --no-snap",
        install_output,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(!helper.scopes.local_path.join("install-compat-planning.json").exists());
    assert!(phases(&helper).is_empty());
}

#[test]
fn configured_lane_merge_does_not_invoke_unloaded_provider_failure() {
    let helper = merge_ready_minimal();
    helper.output_file("install-compat-fail-pre", "active");
    let result = support::compare_install(
        &helper,
        "lane merge install-dev --auto-merge-resolve theirs --no-snap",
        install_output,
    );
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert!(!helper.scopes.local_path.join("install-compat-planning.json").exists());
    assert!(phases(&helper).is_empty());
}

#[test]
fn configured_component_abort_keeps_provider_memory_through_install() {
    let helper = merge_ready();
    support::setup(&helper, "lane merge install-dev --manual --no-snap -x");
    let _ = fs::remove_file(helper.scopes.local_path.join("install-compat-phases"));
    let result = support::compare_install(&helper, "merge comp1 --abort", install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert_eq!(planning_receipt(&helper)["seenComp1"], true);
    assert_eq!(phases(&helper), ["install-pre", "manager-pre", "manager-run", "manager-post"]);
}

#[test]
fn configured_component_abort_install_failure_is_graceful() {
    let helper = merge_ready();
    support::setup(&helper, "lane merge install-dev --manual --no-snap -x");
    let _ = fs::remove_file(helper.scopes.local_path.join("install-compat-phases"));
    helper.output_file("install-compat-fail-pre", "active");
    let result = support::compare_with_stdout(&helper, "merge comp1 --abort", install_output);
    assert!(result.status.success(), "{} {}", result.stdout, result.stderr);
    assert_eq!(planning_receipt(&helper)["seenComp1"], true);
    assert_eq!(phases(&helper), ["install-pre"]);
}
