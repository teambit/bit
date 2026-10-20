//! Real package-manager subscriber suppresses pnpm's platform-dependent progress frames.
use crate::{
    commands::move_paths::support,
    helper::{Helper, config},
};
use serde_json::{Value, json};

pub(super) fn configure(helper: &Helper) {
    let source = include_str!("reporter.cjs");
    helper.output_file("quiet-reporter/index.js", source);
    support::setup(
        helper,
        &format!("add quiet-reporter -i env/quiet-reporter --scope {}", helper.scopes.remote),
    );
    config::set_component_env(
        &helper.scopes.local_path,
        "env/quiet-reporter",
        "teambit.harmony/empty-env",
    );
    let path = helper.scopes.local_path.join(".bitmap");
    let mut bitmap = config::read_jsonc(&path);
    bitmap["env/quiet-reporter"]["config"]["teambit.pkg/pkg"] = json!({
        "packageJson":{"main":"dist/index.js"}
    });
    config::write_json(&path, &bitmap, b"    ");
    support::setup(helper, "link");
    helper.output_file("quiet-reporter/dist/index.js", source);
    support::setup(helper, "tag env/quiet-reporter --ignore-issues * --message reporter");
    crate::helper::remote::publish(helper);
    let mut bitmap = config::read_jsonc(&path);
    let reporter = bitmap
        .as_object_mut()
        .unwrap()
        .remove("env/quiet-reporter")
        .unwrap();
    let version = reporter["version"].as_str().unwrap();
    config::write_json(&path, &bitmap, b"    ");
    config::set_workspace_key(
        &helper.scopes.local_path,
        &format!("{}/env/quiet-reporter@{version}", helper.scopes.remote),
        json!({}),
    );
    link_reporter_policy(helper);
    helper.output_file("quiet-reporter-active", "active");
}

fn link_reporter_policy(helper: &Helper) {
    let workspace = helper.scopes.local_path.join("workspace.jsonc");
    let mut resolver =
        config::read_jsonc(&workspace)["teambit.dependencies/dependency-resolver"].clone();
    if resolver.is_null() {
        resolver = json!({});
    }
    let package = format!("@{}/env.quiet-reporter", helper.scopes.remote);
    let link = format!("link:{}", helper.scopes.local_path.join("quiet-reporter").display());
    resolver["policy"]["dependencies"][package.as_str()] = json!(link);
    config::set_workspace_key(
        &helper.scopes.local_path,
        "teambit.dependencies/dependency-resolver",
        resolver,
    );
}

pub(super) fn assert_receipt(helper: &Helper) {
    let path = helper.scopes.local_path.join("quiet-reporter-receipt.jsonl");
    let lines = std::fs::read_to_string(&path).unwrap();
    let actual = lines
        .lines()
        .map(|line| serde_json::from_str::<Value>(line).unwrap())
        .collect::<Vec<_>>();
    assert_eq!(
        actual,
        vec![
            json!({"phase":"pre","hidden":true}),
            json!({"phase":"post","sameInstaller":true,"sameArgs":true,"samePackageOptions":true,"hidden":true}),
        ],
    );
}
