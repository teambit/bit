//! Real default installation; the published JSON mode suppresses pnpm's timed reporter.
use super::{file, untrack};
use crate::{
    commands::move_paths::support,
    helper::{Helper, config, remote},
};
use serde_json::Value;
use std::fs;
fn fixture(count: usize) -> Helper {
    let helper = support::workspace(count, false);
    for index in 1..=count {
        let name = format!("comp{index}");
        config::set_component_env(&helper.scopes.local_path, &name, "teambit.harmony/empty-env");
        if index < count {
            helper.output_file(
                &format!("{name}/index.js"),
                &format!(
                    "module.exports=require('@{}/comp{}');\n",
                    helper.scopes.remote,
                    index + 1,
                ),
            );
        }
    }
    support::setup(&helper, "link");
    support::tag(&helper);
    remote::publish(&helper);
    helper.re_init_workspace_with(false);
    helper.add_remote_scope();
    helper
}
fn install(helper: &Helper, name: &str, flags: &str, count: usize) {
    let command = format!("import {}/{name} {flags} --json", helper.scopes.remote);
    let output = support::compare_install(helper, &command, str::to_owned);
    assert!(output.status.success(), "{command}: {} {}", output.stdout, output.stderr);
    let result: Value = serde_json::from_str(&output.stdout).unwrap();
    assert_eq!(
        result["importDetails"]
            .as_array()
            .unwrap()
            .len(),
        count,
    );
    assert!(result["installationError"].is_null());
    assert!(helper.scopes.local_path.join("pnpm-lock.yaml").is_file());
    assert!(helper.scopes.local_path.join("node_modules/.modules.yaml").is_file());
}
fn assert_linked(helper: &Helper, names: &[&str]) {
    let bitmap = support::bitmap(helper);
    for name in names {
        assert_eq!(bitmap[name]["version"], "0.0.1");
        let package =
            helper.scopes.local_path.join(format!("node_modules/@{}/{name}", helper.scopes.remote));
        assert!(package.join("package.json").is_file());
        assert!(package.join("index.js").is_file());
    }
}
#[test]
fn track_only_json_performs_real_default_installation_without_replacing_existing_files() {
    let helper = fixture(1);
    support::setup(&helper, &super::command(&helper, "comp1", ""));
    let entry = untrack(&helper, "comp1");
    fs::write(file(&helper, &entry, "index.js"), "module.exports='retained local file';\n")
        .unwrap();
    install(&helper, "comp1", "--track-only", 1);
    assert_linked(&helper, &["comp1"]);
    assert_eq!(
        fs::read(file(&helper, &entry, "index.js")).unwrap(),
        b"module.exports='retained local file';\n",
    );
}
#[test]
fn empty_directory_and_workspace_policy_json_perform_real_default_installation() {
    let helper = fixture(1);
    support::setup(&helper, &super::command(&helper, "comp1", ""));
    let entry = untrack(&helper, "comp1");
    fs::write(file(&helper, &entry, "sentinel.txt"), "occupied original\n").unwrap();
    install(&helper, "comp1", "--write-to-empty-dir --write-deps workspace.jsonc", 1);
    assert_linked(&helper, &["comp1"]);
    assert_eq!(
        support::bitmap(&helper)["comp1"]["rootDir"],
        format!("{}_1", entry["rootDir"].as_str().unwrap()),
    );
    assert_eq!(fs::read(file(&helper, &entry, "sentinel.txt")).unwrap(), b"occupied original\n");
}
#[test]
fn silent_dependent_paths_json_perform_real_default_installation_and_link_all_intermediates() {
    let helper = fixture(4);
    support::setup(&helper, &super::command(&helper, "comp1", ""));
    install(&helper, "comp4", "--dependents --silent", 3);
    assert_linked(&helper, &["comp1", "comp2", "comp3", "comp4"]);
}
