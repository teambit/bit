use super::{
    DEFAULT_DEV_PATTERNS, DependencyOptions, compute, default_package_name, definitely_typed,
    glob::{match_patterns, matches},
    scan::lexical,
    specifier_package_name, valid_component_version,
};
use crate::{
    model::{
        ComponentDependencies, ComponentId, EnvPolicy, Lifecycle, PackageDependency, PolicyEntry,
        WorkspaceComponent,
    },
    policy::{
        entries::entry,
        tests::{component, store_version},
    },
};
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::{fs, path::Path};

fn write(path: &Path, contents: &str) {
    fs::create_dir_all(path.parent().expect("parent")).expect("dir");
    fs::write(path, contents).expect("write");
}

fn package(root: &Path, name: &str, manifest: &Value) {
    write(
        &root
            .join("node_modules")
            .join(name)
            .join("package.json"),
        &manifest.to_string(),
    );
}

fn packages(dependencies: &ComponentDependencies, lifecycle: Lifecycle) -> Vec<(String, String)> {
    dependencies.packages
        .iter()
        .filter(|package| package.lifecycle == lifecycle)
        .map(|PackageDependency { name, version, .. }| (name.clone(), version.clone()))
        .collect()
}

/// `acme/ui/button` imports a package, a workspace component, a missing package in
/// a spec file and a TypeScript package whose `@types` is in the workspace policy.
fn fixture(root: &Path) -> Vec<WorkspaceComponent> {
    let mut button = component(root, "acme/ui/button@1.0.0", "teambit.harmony/node");
    button.files = vec!["index.ts".into(), "utils.ts".into(), "button.spec.ts".into()];
    write(
        &button.dir.join("index.ts"),
        "import _ from 'lodash';\nimport { Card } from '@acme/ui.card';\nimport { x } from './utils';\nimport fs from 'fs';\nimport React from 'react';\n",
    );
    write(&button.dir.join("utils.ts"), "export const x = 1;\n");
    write(
        &button.dir.join("button.spec.ts"),
        "import 'jest-extended';\nimport { render } from '@testing-library/react';\n",
    );
    let mut card = component(root, "acme/ui/card@2.0.0", "teambit.harmony/node");
    card.files = vec!["index.ts".into()];
    card.package_name = "@acme/ui.card".into();
    write(&card.dir.join("index.ts"), "export const Card = 1;\n");
    package(root, "lodash", &json!({"name": "lodash", "version": "4.17.21"}));
    package(root, "react", &json!({"name": "react", "version": "18.2.0"}));
    package(
        root,
        "@testing-library/react",
        &json!({"name": "@testing-library/react", "version": "14.0.0"}),
    );
    vec![button, card]
}

fn workspace_policy() -> Vec<PolicyEntry> {
    vec![
        entry("@types/lodash", "^4.14.0", Lifecycle::Runtime),
        entry("react", "^18.0.0", Lifecycle::Runtime),
    ]
}

async fn run(
    root: &Path,
    components: &[WorkspaceComponent],
    envs: &IndexMap<String, EnvPolicy>,
) -> IndexMap<String, ComponentDependencies> {
    compute(root, components, &workspace_policy(), envs, None, &DependencyOptions::default())
        .await
        .expect("compute")
}

#[tokio::test]
async fn detects_packages_components_and_missing() {
    let temp = tempfile::tempdir().expect("tempdir");
    let components = fixture(temp.path());
    let result = run(temp.path(), &components, &IndexMap::new()).await;
    let button = &result["acme/ui/button"];
    assert_eq!(
        packages(button, Lifecycle::Runtime),
        vec![("lodash".into(), "4.17.21".into()), ("react".into(), "^18.0.0".into())],
    );
    assert_eq!(
        packages(button, Lifecycle::Dev),
        vec![
            ("@types/lodash".into(), "^4.14.0".into()),
            ("@testing-library/react".into(), "14.0.0".into())
        ],
    );
    assert_eq!(button.missing_packages.dev, vec!["jest-extended".to_owned()]);
    let card = button.components
        .iter()
        .find(|dependency| dependency.package_name == "@acme/ui.card")
        .expect("card");
    assert_eq!(
        (card.id.version.as_deref(), card.lifecycle, card.is_extension),
        (Some("2.0.0"), Lifecycle::Runtime, false),
    );
}

#[tokio::test]
async fn overrides_env_peers_and_forced_entries() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut components = fixture(temp.path());
    components[0].config.insert(
        "teambit.dependencies/dependency-resolver".into(),
        json!({"policy": {"dependencies": {"is-odd": "1.0.0", "lodash": "-"}, "devDependencies": {"jest-extended": "-"}}}),
    );
    let env = EnvPolicy {
        component: vec![entry("react", "^18.0.0 || ^19.0.0", Lifecycle::Peer)],
        ..EnvPolicy::default()
    };
    let envs = IndexMap::from([("teambit.harmony/node".to_owned(), env)]);
    let result = run(temp.path(), &components, &envs).await;
    let button = &result["acme/ui/button"];
    assert_eq!(packages(button, Lifecycle::Runtime), vec![("is-odd".into(), "1.0.0".into())]);
    assert_eq!(
        packages(button, Lifecycle::Peer),
        vec![("react".into(), "^18.0.0 || ^19.0.0".into())],
    );
    assert!(button.missing_packages.dev.is_empty());
    assert!(
        button.policy
            .iter()
            .any(|entry| entry.name == "is-odd" && entry.force),
    );
}

#[tokio::test]
async fn env_component_gets_its_own_peers() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut env = component(root, "acme/envs/my-env", "teambit.envs/env");
    env.files = vec!["env.jsonc".into(), "index.ts".into()];
    env.is_env = true;
    write(
        &env.dir.join("env.jsonc"),
        r#"{"policy":{"peers":[{"name":"react","version":"+","supportedRange":"^18"},{"name":"vue","version":"3.0.0","supportedRange":"^3"}]}}"#,
    );
    write(&env.dir.join("index.ts"), "import React from 'react';\n");
    package(root, "react", &json!({"name": "react", "version": "18.3.1"}));
    let result = run(root, &[env], &IndexMap::new()).await;
    let env = &result["acme/envs/my-env"];
    assert_eq!(
        packages(env, Lifecycle::Runtime),
        vec![("react".into(), "18.3.1".into()), ("vue".into(), "3.0.0".into())],
    );
}

#[tokio::test]
async fn model_versions_fill_missing_packages_and_root_component_is_empty() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut button = component(root, "acme/button@1.0.0", "teambit.harmony/node");
    button.files = vec!["index.js".into()];
    write(
        &button.dir.join("index.js"),
        "const chalk = require('chalk');\nconst ext = require('acme-ext');\n",
    );
    store_version(
        root,
        "acme/button",
        "1.0.0",
        &json!({"packageDependencies": {"chalk": "4.1.0"}, "extensions": [{"name": "teambit.dependencies/dependency-resolver", "data": {"dependencies": []}}]}),
    );
    let mut workspace_root = component(root, "acme/workspace", "teambit.harmony/node");
    workspace_root.root_dir = ".".into();
    workspace_root.files = vec!["index.js".into()];
    let result = run(root, &[button, workspace_root], &IndexMap::new()).await;
    assert_eq!(
        packages(&result["acme/button"], Lifecycle::Runtime),
        vec![("chalk".into(), "4.1.0".into())],
    );
    assert_eq!(result["acme/button"].missing_packages.runtime, vec!["acme-ext".to_owned()]);
    assert!(result["acme/workspace"].packages.is_empty());
}

#[tokio::test]
async fn extensions_are_dev_component_dependencies() {
    let temp = tempfile::tempdir().expect("tempdir");
    let mut components = fixture(temp.path());
    components[0].config.insert("acme/aspects/my-aspect@0.0.3".into(), json!({}));
    components[0].config.insert("teambit.harmony/node".into(), json!({}));
    let result = run(temp.path(), &components, &IndexMap::new()).await;
    let extensions: Vec<_> = result["acme/ui/button"].components
        .iter()
        .filter(|dependency| dependency.is_extension)
        .map(|dependency| {
            (dependency.package_name.clone(), dependency.id.version.clone(), dependency.lifecycle)
        })
        .collect();
    assert_eq!(
        extensions,
        vec![("@acme/aspects.my-aspect".to_owned(), Some("0.0.3".to_owned()), Lifecycle::Dev)],
    );
}

#[test]
fn dev_file_globs() {
    let patterns: Vec<String> = DEFAULT_DEV_PATTERNS
        .iter()
        .map(|pattern| (*pattern).to_owned())
        .collect();
    assert!(match_patterns("button.spec.tsx", &patterns));
    assert!(match_patterns("a/b/button.test.js", &patterns));
    assert!(match_patterns("button.composition.tsx", &patterns));
    assert!(match_patterns("button.compositions.tsx", &patterns));
    assert!(match_patterns("button.docs.mdx", &patterns));
    assert!(!match_patterns("button.spec.scss", &patterns));
    assert!(!match_patterns("button.tsx", &patterns));
    assert!(matches("{src,lib}/**/*.ts", "lib/a/b.ts"));
    assert!(!matches("*.ts", ".hidden.ts"));
    assert!(matches("file.[jt]s", "file.ts"));
    let with_exclude = vec!["**/*.ts".to_owned(), "!**/index.ts".to_owned()];
    assert!(match_patterns("a.ts", &with_exclude));
    assert!(!match_patterns("x/index.ts", &with_exclude));
}

#[test]
fn lexical_fallback_and_names() {
    assert_eq!(
        lexical(
            "@Component() class X {}\nimport a from 'a';\nexport * from \"b\";\nconst c = require('c/d');\nimport('e');"
        ),
        vec!["a", "b", "e", "c/d"],
    );
    assert_eq!(specifier_package_name("@scope/name/deep"), "@scope/name");
    assert_eq!(specifier_package_name("lodash/fp"), "lodash");
    assert_eq!(definitely_typed("@scope/name"), "@types/scope__name");
    assert_eq!(definitely_typed("lodash"), "@types/lodash");
}

#[test]
fn component_versions_and_package_names() {
    let snap = "a".repeat(40);
    assert_eq!(valid_component_version(&format!("0.0.0-{snap}")), Some(snap.clone()));
    assert_eq!(valid_component_version("1.2.3"), Some("1.2.3".to_owned()));
    assert_eq!(valid_component_version("^1.2"), Some("1.2.0".to_owned()));
    assert_eq!(valid_component_version(&snap), Some(snap));
    assert_eq!(valid_component_version("file:../x"), None);
    let id = |scope: &str, name: &str| ComponentId {
        scope: Some(scope.into()),
        default_scope: None,
        name: name.into(),
        version: None,
    };
    assert_eq!(default_package_name(&id("teambit.react", "ui/button")), "@teambit/react.ui.button");
    assert_eq!(default_package_name(&id("acme", "button")), "@acme/button");
}
