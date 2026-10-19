use super::exported;
use crate::{commands::move_paths::support, helper::config};
use serde_json::json;

#[test]
fn active_lane_import_preserves_real_provider_startup_and_config_mutation() {
    let helper = exported(1);
    support::setup(&helper, "lane create current");
    configure(&helper, true);
    let before = support::bitmap(&helper);
    let output = support::compare_declined(
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

fn default_switch_installation(ci: bool) {
    let helper = installation_fixture();
    helper.output_file("lane-adoption-record-phases", "active");
    // A real subscriber sets the same supported pnpm throttle for both implementations.
    helper.output_file("lane-adoption-throttle-progress", "active");
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
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
    assert_phases(&helper);
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
    let helper = support::workspace(1, false);
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
    support::setup(&helper, "snap --ignore-issues * --message lane");
    crate::helper::remote::publish(&helper);
    support::setup(&helper, "switch main -x");
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
