//! Actual install subscriber objects remain mutable across the package-manager call.
use super::callbacks::{assert_phases, assert_throttle_receipts, installation_fixture};
use crate::{commands::add::support::history_oracle, helper::config};
use serde_json::json;
use std::fs;

#[test]
fn install_subscribers_mutate_original_inputs_and_retain_reassigned_argument_fields() {
    install_subscribers(false);
}

#[test]
fn ci_install_subscribers_mutate_original_inputs_and_retain_reassigned_argument_fields() {
    install_subscribers(true);
}

fn install_subscribers(ci: bool) {
    let helper = installation_fixture();
    helper.output_file("lane-adoption-record-phases", "active");
    helper.output_file("lane-adoption-mutate-install", "active");
    helper.output_file(
        "subscriber-linked/package.json",
        &json!({"name":"@fixture/subscriber-linked","version":"1.0.0","main":"index.js"})
            .to_string(),
    );
    helper.output_file(
        "subscriber-linked/index.js",
        "module.exports='subscriber local package';\n",
    );
    let compare = if ci { history_oracle::compare_ci } else { history_oracle::compare };
    let output =
        compare(&helper, "switch dev", super::output::durations, ["checkout", "lane-switch"], true);
    assert!(output.status.success(), "{} {}", output.stdout, output.stderr);
    assert_phases(&helper);
    assert_throttle_receipts(&helper);
    assert_receipt(&helper);
    assert_linked_package(&helper);
}
fn assert_linked_package(helper: &crate::helper::Helper) {
    let package = helper.scopes.local_path.join("node_modules/@fixture/subscriber-linked");
    assert_eq!(
        fs::read(package.join("index.js")).unwrap(),
        b"module.exports='subscriber local package';\n",
    );
    assert_eq!(config::read_jsonc(&package.join("package.json"))["version"], "1.0.0");
    let lock = fs::read_to_string(helper.scopes.local_path.join("pnpm-lock.yaml")).unwrap();
    assert!(lock.contains("excludeLinksFromLockfile: true"), "{lock}");
    assert!(!lock.contains("@fixture/subscriber-linked"), "{lock}");
    // The pinned engine writes this YAML-named file as JSON, as install_clocks verifies.
    let modules: serde_json::Value = serde_json::from_slice(
        &fs::read(helper.scopes.local_path.join("node_modules/.modules.yaml")).unwrap(),
    )
    .unwrap();
    assert_eq!(modules["included"]["optionalDependencies"], false);
    assert!(!helper.scopes.local_path.join("subscriber-ignored-root").exists());
}

fn assert_receipt(helper: &crate::helper::Helper) {
    let text = fs::read_to_string(helper.scopes.local_path.join(
        "lane-adoption-subscriber-receipts.jsonl",
    ))
    .unwrap();
    let rows: Vec<serde_json::Value> = text
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(rows.len(), 1, "{text}");
    let row = &rows[0];
    for field in ["sameInstaller", "sameArgs", "sameOptions", "reassignedOptional"] {
        assert_eq!(row[field], true, "{field}: {text}");
    }
    for field in ["samePackageOptions", "originalOptional"] {
        assert_eq!(row[field], false, "{field}: {text}");
    }
    assert!(row.get("installerRoot").is_none(), "{text}");
    assert_eq!(row["formalRoot"], helper.scopes.local_path.to_str().unwrap());
    assert_eq!(
        row["argsRoot"],
        helper.scopes.local_path
            .join("subscriber-ignored-root")
            .to_str()
            .unwrap(),
    );
    assert_eq!(
        row["linked"],
        format!("link:{}", helper.scopes.local_path.join("subscriber-linked").display()),
    );
}
