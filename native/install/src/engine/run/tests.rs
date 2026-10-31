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
    // The root has no `package.json`, so a `pnpm-workspace.yaml` above the temp dir
    // would take it in and the install would write there.
    settings.base.workspace_dir = Some(root.to_path_buf());
    settings.base.modules_dir = root.join("node_modules");
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
async fn installs_local_projects_with_core_removal_overrides() {
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
    assert!(lockfile.get("pnpmfileChecksum").is_none());
    assert_eq!(lockfile["overrides"], json!({"@teambit/legacy@*":"-","@teambit/harmony@*":"-"}));
    // Workspace manifest preprocessing removes core registry dependencies.
    assert_eq!(lockfile["importers"]["comps/a"], json!({}));
    assert!(root.join("node_modules").is_dir());
    let repeat = install(&plan, &settings, &options).await.expect("repeat install");
    assert!(!repeat.dependencies_changed);
}

#[tokio::test]
async fn injected_components_retain_sibling_dependencies_removed_from_importers() {
    let dir = tempfile::tempdir().expect("temp dir");
    let root = dir
        .path()
        .canonicalize()
        .expect("canonical");
    let mut settings = workspace_settings(&root);
    settings.layout.root_components = true;
    let plan = injected_plan(&root);
    let options =
        EngineInstallOptions { include_optional_deps: true, ..EngineInstallOptions::default() };
    install(&plan, &settings, &options).await.expect("install injected chain");
    let lockfile = Lockfile::load_from_path(&root.join("pnpm-lock.yaml"))
        .expect("read lockfile")
        .expect("lockfile");
    let lockfile = serde_json::to_value(lockfile).expect("serialize lockfile");
    assert!(lockfile["importers"]["components/alpha"].get("dependencies").is_none());
    let (_, alpha) = lockfile["snapshots"]
        .as_object()
        .expect("snapshots")
        .iter()
        .find(|(key, _)| key.starts_with("alpha@file:"))
        .expect("injected alpha");
    assert!(
        alpha["dependencies"]["beta"]
            .as_str()
            .expect("sibling reference")
            .starts_with("file:"),
    );
    let alpha = root
        .join("node_modules/.bit_roots/env/node_modules/alpha")
        .canonicalize()
        .expect("injected component");
    assert!(
        alpha
            .parent()
            .expect("node_modules")
            .join("beta/index.js")
            .is_file(),
    );
    install(&plan, &settings, &options).await.expect("repeat install");
    assert!(
        alpha
            .parent()
            .expect("node_modules")
            .join("beta/index.js")
            .is_file(),
    );
}

fn injected_plan(root: &Path) -> InstallPlan {
    let manifests = [
        ("", json!({"name":"workspace","version":"1.0.0"})),
        (
            "components/alpha",
            json!({"name":"alpha","version":"1.0.0",
            "dependencies":{"beta":"workspace:*"},"dependenciesMeta":{"beta":{"injected":true}}}),
        ),
        ("components/beta", json!({"name":"beta","version":"1.0.0"})),
        (
            "node_modules/.bit_roots/env",
            json!({"name":"environment","version":"1.0.0",
            "dependencies":{"alpha":"workspace:*"},"dependenciesMeta":{"alpha":{"injected":true}}}),
        ),
    ];
    let projects = manifests
        .into_iter()
        .map(|(directory, manifest)| {
            let dir = root.join(directory);
            fs::create_dir_all(&dir).expect("project directory");
            fs::write(dir.join("index.js"), "module.exports = 1;").expect("source");
            Project { dir, manifest: object(manifest) }
        })
        .collect();
    InstallPlan {
        projects,
        external_dependencies: vec!["alpha".into(), "beta".into()],
        ..InstallPlan::default()
    }
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
