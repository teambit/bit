//! End-to-end engine installs of local projects; no registry access.

use super::install;
use crate::{
    config::DependencyResolverConfig,
    engine::{EngineInstallOptions, EngineSettings, EnvVars, settings},
    host::HostInfo,
    model::{GlobalConfig, InstallPlan, Project},
};
use pnpm_lockfile::Lockfile;
use serde_json::{Map, Value, json};
use std::{fs, path::Path};

fn object(value: Value) -> Map<String, Value> {
    match value {
        Value::Object(object) => object,
        _ => panic!("expected an object"),
    }
}

fn workspace_settings(root: &Path) -> EngineSettings {
    let mut settings = settings(
        root,
        &DependencyResolverConfig::default(),
        &GlobalConfig::new(),
        &HostInfo::default(),
        &EnvVars::default(),
    )
    .expect("settings");
    settings.store.store_dir = root.join(".store");
    settings.store.cache_dir = root.join(".cache");
    settings.reporter = None;
    settings
}

fn plan(root: &Path) -> InstallPlan {
    let component = root.join("comps").join("a");
    fs::create_dir_all(&component).expect("mkdir");
    fs::write(component.join("index.js"), "module.exports = 1").expect("write");
    InstallPlan {
        projects: vec![
            Project {
                dir: root.to_path_buf(),
                manifest: object(json!({ "name": "workspace", "version": "1.0.0" })),
            },
            Project {
                dir: component,
                manifest: object(json!({
                    "name": "@s/a",
                    "version": "0.0.1",
                    "dependencies": { "@teambit/legacy": "1.0.0" }
                })),
            },
        ],
        ..InstallPlan::default()
    }
}

#[tokio::test]
async fn installs_local_projects_and_records_bits_checksum() {
    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir
        .path()
        .canonicalize()
        .expect("canonical");
    let settings = workspace_settings(&root);
    let plan = plan(&root);
    let options =
        EngineInstallOptions { include_optional_deps: true, ..EngineInstallOptions::default() };
    install(&plan, &settings, &options).await.expect("first install");
    let lockfile =
        Lockfile::load_from_path(&root.join("pnpm-lock.yaml")).expect("load").expect("lockfile");
    let lockfile = serde_json::to_value(lockfile).expect("json");
    assert_eq!(lockfile["pnpmfileChecksum"], json!("bit-1"));
    // The hooks removed `@teambit/legacy` from the component.
    assert_eq!(lockfile["importers"]["comps/a"], json!({}));
    assert!(root.join("node_modules").is_dir());
    let repeat = install(&plan, &settings, &options).await.expect("repeat install");
    assert!(!repeat.dependencies_changed);
}

#[tokio::test]
async fn a_failed_update_restores_the_lockfile() {
    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir
        .path()
        .canonicalize()
        .expect("canonical");
    let settings = workspace_settings(&root);
    fs::write(root.join("pnpm-lock.yaml"), "lockfileVersion: '9.0'\n").expect("write");
    // No project for the install root fails the install.
    let plan = InstallPlan::default();
    let options = EngineInstallOptions { update_all: true, ..EngineInstallOptions::default() };
    install(&plan, &settings, &options).await.expect_err("no root project");
    assert_eq!(
        fs::read_to_string(root.join("pnpm-lock.yaml")).expect("read"),
        "lockfileVersion: '9.0'\n",
    );
}
