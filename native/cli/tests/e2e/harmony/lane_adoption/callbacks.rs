use super::exported;
use crate::{commands::move_paths::support, helper::config};
use serde_json::json;

#[test]
fn active_lane_import_preserves_real_provider_startup_and_config_mutation() {
    let helper = exported(1);
    support::setup(&helper, "lane create current");
    configure(&helper, true);
    let before = support::bitmap(&helper);
    let output = support::compare_with_stdout(
        &helper,
        &format!("lane import {}/dev -x", helper.scopes.remote),
        str::to_owned,
    );
    assert!(output.status.success());
    assert_eq!(output.stdout.matches("lane adoption configured provider started").count(), 1);
    assert_eq!(support::bitmap(&helper), before);
    let receipt =
        config::read_jsonc(&helper.scopes.local_path.join("lane-adoption-provider-receipt.json"));
    assert!(
        std::path::Path::new(receipt["module"].as_str().unwrap())
            .ends_with(std::path::Path::new("dist").join("index.js")),
    );
    assert!(
        std::fs::read_to_string(helper.scopes.local_path.join("workspace.jsonc"))
            .unwrap()
            .contains("// lane adoption provider config mutation"),
    );
}

fn configure(helper: &crate::helper::Helper, active_lane: bool) {
    let source = include_str!("callbacks.cjs");
    helper.output_file("lane-provider/index.js", source);
    support::setup(helper, "add lane-provider -i env/lane-adoption");
    config::set_component_env(
        &helper.scopes.local_path,
        "env/lane-adoption",
        "teambit.harmony/empty-env",
    );
    configure_package(helper);
    support::setup(helper, "link");
    helper.output_file("lane-provider/dist/index.js", source);
    support::setup(
        helper,
        if active_lane {
            "snap env/lane-adoption --ignore-issues * --message provider"
        } else {
            "tag env/lane-adoption --ignore-issues * --message provider"
        },
    );
    if !active_lane {
        crate::helper::remote::publish(helper);
    }
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/lane-adoption", helper.scopes.remote),
        json!({}),
    );
    helper.output_file("lane-adoption-provider-active", "active");
}

fn configure_package(helper: &crate::helper::Helper) {
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&path);
    bitmap["env/lane-adoption"]["config"]["teambit.pkg/pkg"] = json!({
        "packageJson": {"main": "dist/index.js"}
    });
    config::write_json(&path, &bitmap, b"    ");
}

#[test]
fn default_switch_installation_reuses_the_real_provider_session() {
    default_switch_installation(false);
}

#[test]
fn ci_default_switch_installation_reuses_the_real_provider_session() {
    default_switch_installation(true);
}

#[test]
fn switch_loads_configured_compiler_without_custom_onload() {
    let helper = installation_fixture();
    helper.output_file("lane-adoption-disable-onload", "active");
    helper.output_file("lane-adoption-hide-pm-output", "active");
    helper.output_file("lane-adoption-record-phases", "active");
    helper.output_file("lane-adoption-record-compiler", "active");
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        "switch dev",
        super::output::durations,
        ["checkout", "lane-switch"],
        true,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let phases =
        std::fs::read_to_string(helper.scopes.local_path.join("lane-adoption-phases.jsonl"))
            .unwrap();
    assert!(phases.contains(r#""phase":"getCompiler""#), "{phases}");
    assert!(!phases.contains(r#""phase":"onLoad""#), "{phases}");
    assert_hidden_pm_receipt(&helper);
}

#[test]
fn switch_reads_later_source_after_earlier_onload() {
    let helper = installation_fixture_with_components(2);
    helper.output_file("lane-adoption-mutate-later-source", "active");
    helper.output_file("lane-adoption-hide-pm-output", "active");
    helper.output_file("lane-adoption-record-phases", "active");
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        "switch dev",
        super::output::durations,
        ["checkout", "lane-switch"],
        true,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    let source = std::fs::read_to_string(helper.scopes.local_path.join("comp2/index.js")).unwrap();
    assert!(source.contains("earlier onLoad changed later source"), "{source}");
    assert!(source.contains("require('react')"), "{source}");
    assert!(helper.scopes.local_path.join("lane-adoption-later-source-mutated").is_file());
    assert_hidden_pm_receipt(&helper);
}

#[test]
fn switch_loads_lane_provider_before_its_later_checkout_target() {
    let helper = installation_fixture_with_lane_provider();
    std::fs::remove_file(helper.scopes.local_path.join("lane-adoption-provider-active")).unwrap();
    let lane = support::json(&helper, "cat-lane dev");
    helper.output_file("lane-adoption-provider-active", "active");
    let names = lane["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            row["id"]["name"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect::<Vec<_>>();
    assert_eq!(names, ["comp1", "env/lane-adoption"]);
    helper.output_file("lane-adoption-hide-pm-output", "active");
    helper.output_file("lane-adoption-record-phases", "active");
    helper.output_file("lane-adoption-record-compiler", "active");
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        "switch dev",
        super::output::durations,
        ["checkout", "lane-switch"],
        true,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert!(output.trace.contains("host switchStatusStageRow"), "{}", output.trace);
    let phases =
        std::fs::read_to_string(helper.scopes.local_path.join("lane-adoption-phases.jsonl"))
            .unwrap();
    assert!(phases.contains(r#""phase":"getCompiler""#), "{phases}");
    assert_hidden_pm_receipt(&helper);
}

#[test]
fn switch_reports_batch_snapped_provider_in_published_order() {
    let helper = installation_fixture_with_options(1, true, false);
    std::fs::remove_file(helper.scopes.local_path.join("lane-adoption-provider-active")).unwrap();
    let lane = support::json(&helper, "cat-lane dev");
    helper.output_file("lane-adoption-provider-active", "active");
    let names = lane["components"]
        .as_array()
        .unwrap()
        .iter()
        .map(|row| {
            row["id"]["name"]
                .as_str()
                .unwrap()
                .to_owned()
        })
        .collect::<Vec<_>>();
    assert_eq!(names, ["env/lane-adoption", "comp1"]);
    helper.output_file("lane-adoption-hide-pm-output", "active");
    let output = crate::commands::add::support::history_oracle::compare(
        &helper,
        "switch dev",
        super::output::durations,
        ["checkout", "lane-switch"],
        true,
    );
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert_hidden_pm_receipt(&helper);
}

fn assert_hidden_pm_receipt(helper: &crate::helper::Helper) {
    let receipts = std::fs::read_to_string(helper.scopes.local_path.join(
        "lane-adoption-throttle-receipts.jsonl",
    ))
    .unwrap();
    let rows = receipts
        .lines()
        .map(|line| serde_json::from_str::<serde_json::Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        rows,
        [
            json!({"phase":"pre","throttleProgress":60000,"hidePackageManagerOutput":true}),
            json!({"phase":"post","throttleProgress":60000,"hidePackageManagerOutput":true}),
        ],
    );
}

fn default_switch_installation(ci: bool) {
    let helper = installation_fixture();
    helper.output_file("lane-adoption-record-phases", "active");
    helper.output_file("lane-adoption-record-compiler", "active");
    let compare = if ci {
        crate::commands::add::support::history_oracle::compare_ci
    } else {
        crate::commands::add::support::history_oracle::compare
    };
    let output =
        compare(&helper, "switch dev", super::output::durations, ["checkout", "lane-switch"], true);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert_eq!(output.stdout.matches("lane adoption configured provider started").count(), 1);
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    #[cfg(target_os = "linux")]
    assert!(output.trace.contains("running stock pnpm installation natively"), "{}", output.trace);
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    assert_phases(&helper);
    let phases =
        std::fs::read_to_string(helper.scopes.local_path.join("lane-adoption-phases.jsonl"))
            .unwrap();
    assert!(phases.contains(r#""phase":"getCompiler""#), "{phases}");
    assert_throttle_receipts(&helper);
}

pub(crate) fn assert_throttle_receipts(helper: &crate::helper::Helper) {
    let text = std::fs::read_to_string(helper.scopes.local_path.join(
        "lane-adoption-throttle-receipts.jsonl",
    ))
    .unwrap();
    let rows: Vec<serde_json::Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(
        rows,
        vec![
            json!({"phase":"pre","throttleProgress":60000}),
            json!({"phase":"post","throttleProgress":60000}),
        ],
    );
}

pub(crate) fn installation_fixture() -> crate::helper::Helper {
    installation_fixture_with_components(1)
}

fn installation_fixture_with_lane_provider() -> crate::helper::Helper {
    installation_fixture_with_options(1, true, true)
}

fn installation_fixture_with_components(count: usize) -> crate::helper::Helper {
    installation_fixture_with_options(count, false, false)
}

fn installation_fixture_with_options(
    count: usize,
    lane_provider: bool,
    separate_snap: bool,
) -> crate::helper::Helper {
    let helper = support::workspace(count, false);
    configure(&helper, false);
    std::fs::remove_file(helper.scopes.local_path.join("lane-adoption-provider-active")).unwrap();
    config::set_component_env(
        &helper.scopes.local_path,
        "comp1",
        &format!("{}/env/lane-adoption", helper.scopes.remote),
    );
    support::tag(&helper);
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "lane create dev");
    helper.append_file("comp1/index.js", "\n// switched lane body\n");
    if separate_snap {
        support::setup(&helper, "snap comp1 --ignore-issues * --message lane-consumer");
    }
    if lane_provider {
        helper.append_file("lane-provider/index.js", "\n// switched lane provider source\n");
    }
    if separate_snap {
        support::setup(&helper, "snap env/lane-adoption --ignore-issues * --message lane-provider");
    }
    if count > 1 {
        helper.append_file("comp2/index.js", "\n// switched lane second body\n");
    }
    if !separate_snap {
        support::setup(&helper, "snap --ignore-issues * --message lane");
    }
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "switch main -x");
    // Every comparison uses the same supported progress throttle through the real subscriber.
    helper.output_file("lane-adoption-throttle-progress", "active");
    helper.output_file("lane-adoption-provider-active", "active");
    helper
}
pub(super) fn assert_phases(helper: &crate::helper::Helper) {
    let path = helper.scopes.local_path.join("lane-adoption-phases.jsonl");
    let text = std::fs::read_to_string(path).unwrap();
    let rows: Vec<serde_json::Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    for phase in ["onLoad", "preInstall", "postInstall", "compile"] {
        assert!(
            rows.iter()
                .any(|row| row["phase"] == phase),
            "missing {phase}: {text}",
        );
    }
    let position = |phase| {
        rows.iter()
            .position(|row| row["phase"] == phase)
            .unwrap()
    };
    assert!(position("onLoad") < position("preInstall"), "{text}");
    assert!(position("preInstall") < position("postInstall"), "{text}");
    assert!(position("postInstall") < position("compile"), "{text}");
    for row in &rows {
        assert_eq!(row["consumerLane"], "main", "{row}");
        assert!(row["diskLane"].is_null(), "{row}");
    }
    let bitmap = support::bitmap(helper);
    assert_eq!(bitmap["_bit_lane"]["id"]["name"], "dev");
    let preinstall = rows
        .iter()
        .find(|row| row["phase"] == "preInstall")
        .unwrap();
    assert_eq!(preinstall["version"], bitmap["comp1"]["version"]);
}
