use super::{
    DEFAULT_DEV_PATTERNS, DependencyOptions, DevPatternConfig, Subject, Workspace, cache, compute,
    data::Detected,
    default_package_name, definitely_typed, detect,
    dev_files::{self, EnvDevPatterns},
    glob::{match_patterns, matches},
    resolve::{Resolved, Resolver},
    scan::lexical,
    specifier_package_name, valid_component_version,
};
use crate::{
    host::{AfterInstall, AfterInstallResult, Host},
    model::{
        ComponentDependencies, ComponentId, EnvPolicy, Lifecycle, PackageDependency, PolicyEntry,
        WorkspaceComponent,
    },
    policy::{
        self,
        entries::entry,
        scope::Scope,
        tests::{TestHost, component, store_version},
    },
};
use async_trait::async_trait;
use indexmap::IndexMap;
use pretty_assertions::assert_eq;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

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
    run_with(root, components, envs, &DependencyOptions::default(), &TestHost::default()).await
}

async fn run_with(
    root: &Path,
    components: &[WorkspaceComponent],
    envs: &IndexMap<String, EnvPolicy>,
    options: &DependencyOptions,
    host: &dyn Host,
) -> IndexMap<String, ComponentDependencies> {
    compute(root, components, &workspace_policy(), envs, None, options, host)
        .await
        .expect("compute")
}

/// Detect one component's files without overrides, to inspect the issues.
fn detect_only(root: &Path, components: &[WorkspaceComponent], index: usize) -> Detected {
    let options = DependencyOptions::default();
    let workspace = Workspace {
        components,
        manifest: policy::workspace_manifest(&workspace_policy()),
        root_package_json: None,
        options: &options,
    };
    let subject = Subject {
        component: &components[index],
        model: super::component_model::ComponentModel::new(None),
        dev_files: Vec::new(),
        own_env: None,
        custom: IndexMap::new(),
    };
    let mut resolver = Resolver::new(root, components, &[]);
    detect::detect(&workspace, &subject, &mut resolver).expect("detect")
}

/// A host whose env implements the dev-pattern hooks.
struct PatternHost;

#[async_trait]
impl Host for PatternHost {
    async fn env_policy(&self, _env_id: &str) -> io::Result<Option<Value>> {
        Ok(None)
    }
    async fn app_types(&self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }
    async fn dev_patterns(&self, env_id: &str) -> io::Result<Option<Value>> {
        Ok((env_id == "acme/envs/custom").then(|| {
            json!({ "devPatterns": ["**/*.story.*"], "tests": ["**/*.unit.ts"], "docs": null, "compositions": null })
        }))
    }
    async fn package_json_props(&self, _env_id: &str) -> io::Result<Value> {
        Ok(Value::Null)
    }
    async fn transform_package_json(&self, _component: &str, manifest: Value) -> io::Result<Value> {
        Ok(manifest)
    }
    async fn after_install(&self, _request: AfterInstall) -> io::Result<AfterInstallResult> {
        Ok(AfterInstallResult::default())
    }
    async fn confirm(&self, _question: &str) -> io::Result<bool> {
        Ok(false)
    }
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

#[test]
fn relative_imports_follow_filing_cabinet_and_report_file_issues() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut button = component(root, "acme/ui/button", "teambit.harmony/node");
    button.files = vec![
        "index.ts".into(),
        "utils.ts".into(),
        "lib/index.tsx".into(),
        "gen.ts".into(),
        "legacy.js".into(),
    ];
    write(
        &button.dir.join("index.ts"),
        "import './utils.js';\nimport './lib';\nimport './missing';\nimport '../../shared/helper';\nimport '../card/card';\n",
    );
    write(&button.dir.join("utils.ts"), "export const x = 1;\n");
    write(&button.dir.join("lib/index.tsx"), "export const y = 1;\n");
    write(&button.dir.join("gen.ts"), "export const g = 1;\n");
    write(&button.dir.join("legacy.js"), "require('./gen.js');\nrequire('../../shared/helper');\n");
    write(&root.join("shared/helper.ts"), "export const h = 1;\n");
    let mut card = component(root, "acme/ui/card@1.0.0", "teambit.harmony/node");
    card.files = vec!["card.ts".into()];
    write(&card.dir.join("card.ts"), "export const c = 1;\n");
    let components = vec![button, card];
    let detected = detect_only(root, &components, 0);
    assert_eq!(
        detected.missing_files,
        IndexMap::from([("index.ts".to_owned(), vec!["./missing".to_owned()])]),
    );
    let untracked: Vec<(String, Vec<(String, bool)>)> = detected.untracked
        .iter()
        .map(|(file, entry)| {
            (
                file.clone(),
                entry.files
                    .iter()
                    .map(|f| (f.relative_path.clone(), f.existing))
                    .collect(),
            )
        })
        .collect();
    assert_eq!(
        untracked,
        vec![
            ("index.ts".to_owned(), vec![("shared/helper.ts".to_owned(), true)]),
            ("legacy.js".to_owned(), vec![("shared/helper.ts".to_owned(), true)]),
        ],
    );
    assert!(detected.blocks_cache());
    assert_eq!(
        detected.components[0]
            .iter()
            .map(|dependency| dependency.id.name.clone())
            .collect::<Vec<_>>(),
        vec!["ui/card".to_owned()],
    );
}

#[tokio::test]
async fn dev_patterns_compose_config_hooks_and_env_patterns() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut button = component(root, "acme/ui/button", "acme/envs/custom");
    button.files = vec![
        "index.ts".into(),
        "a.unit.ts".into(),
        "b.spec.ts".into(),
        "c.story.tsx".into(),
        "d.docs.mdx".into(),
    ];
    button.config.insert(
        "teambit.component/dev-files".into(),
        json!({"devFilePatterns": ["**/*.mock.ts"]}),
    );
    for file in &button.files {
        write(&button.dir.join(file), "import 'left-pad';\n");
    }
    let mut custom = component(root, "acme/envs/custom", "teambit.envs/env");
    custom.files = vec!["index.ts".into()];
    custom.is_env = true;
    write(&custom.dir.join("index.ts"), "export const env = 1;\n");
    let components = vec![button, custom];
    let options = DependencyOptions {
        dev_patterns: DevPatternConfig::from_aspects(&|id| {
            (id == "teambit.defender/tester").then(|| json!({"patterns": ["**/*.spec.ts"]}))
        }),
        ..DependencyOptions::default()
    };
    let result = run_with(root, &components, &IndexMap::new(), &options, &PatternHost).await;
    assert!(
        packages(&result["acme/ui/button"], Lifecycle::Dev).is_empty(),
        "left-pad is missing, so no dev package is recorded",
    );
    let missing = &result["acme/ui/button"].missing_packages;
    assert_eq!(
        missing.runtime,
        vec!["left-pad".to_owned()],
        "index.ts and b.spec.ts are regular files: the env's getTestsDevPatterns replaced the tester config",
    );
    assert_eq!(
        missing.dev,
        vec!["left-pad".to_owned()],
        "a.unit.ts, c.story.tsx and d.docs.mdx are dev files",
    );
    let env = EnvDevPatterns {
        patterns: Some(json!({"tests": ["**/*.t.ts"], "custom": ["**/*.x.ts"]})),
        tests: None,
        docs: Some(vec!["**/*.d.ts".to_owned()]),
        compositions: None,
    };
    let patterns = dev_files::dev_patterns(&components[0], &options.dev_patterns, &env);
    assert_eq!(patterns["config"], vec!["**/*.mock.ts".to_owned()]);
    assert_eq!(
        patterns["teambit.defender/tester"],
        vec!["**/*.spec.ts".to_owned(), "**/*.t.ts".to_owned()],
    );
    assert_eq!(
        patterns["teambit.docs/docs"],
        vec!["**/*.d.ts".to_owned(), "**/*.docs.*".to_owned()],
    );
    assert_eq!(patterns["acme/envs/custom"], vec!["**/*.x.ts".to_owned()]);
}

#[tokio::test]
async fn env_component_without_manifest_gets_its_own_peers_from_the_host() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut env = component(root, "acme/envs/aspect-env", "teambit.harmony/aspect");
    env.files = vec!["index.ts".into()];
    write(&env.dir.join("index.ts"), "export const env = 1;\n");
    let mut host = TestHost::default();
    host.policies.insert(
        "acme/envs/aspect-env".into(),
        json!({"peers": [{"name": "react", "version": "17.0.2", "supportedRange": "^17.0.0"}]}),
    );
    let result =
        run_with(root, &[env], &IndexMap::new(), &DependencyOptions::default(), &host).await;
    assert_eq!(
        packages(&result["acme/envs/aspect-env"], Lifecycle::Runtime),
        vec![("react".into(), "17.0.2".into())],
    );
    assert_eq!(*host.calls.lock().expect("calls"), vec!["acme/envs/aspect-env".to_owned()]);
}

#[tokio::test]
async fn detection_is_cached_in_bit_format_unless_it_has_issues() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    fs::create_dir_all(root.join(".bit/objects")).expect("scope");
    let mut button = component(root, "acme/ui/button@1.0.0", "teambit.harmony/node");
    button.files = vec!["index.ts".into()];
    write(&button.dir.join("index.ts"), "import _ from 'lodash';\nimport React from 'react';\n");
    package(root, "lodash", &json!({"name": "lodash", "version": "4.17.21"}));
    package(root, "react", &json!({"name": "react", "version": "18.2.0"}));
    let mut broken = component(root, "acme/ui/broken@1.0.0", "teambit.harmony/node");
    broken.files = vec!["index.ts".into()];
    write(&broken.dir.join("index.ts"), "import 'nowhere';\n");
    let components = vec![button, broken];
    let options = DependencyOptions { use_cache: true, ..DependencyOptions::default() };
    run_with(root, &components, &IndexMap::new(), &options, &TestHost::default()).await;
    let scope = Scope::find(root).expect("scope");
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .expect("pool");
    let cached = cache::read(&scope, &components[0], &pool).expect("read").expect("cached");
    assert_eq!(cached, detect_only(root, &components, 0));
    let entry =
        bit_object_import::read_dependency_cache(&scope.dependency_cache(), "acme/ui/button@1.0.0")
            .expect("entry")
            .expect("entry");
    let data: Value = serde_json::from_str(entry["data"].as_str().expect("data")).expect("json");
    assert_eq!(
        data.as_object()
            .expect("object")
            .keys()
            .cloned()
            .collect::<Vec<_>>(),
        [
            "allPackagesDependencies",
            "coreAspects",
            "issues",
            "allDependencies",
            "overridesDependencies"
        ],
    );
    assert_eq!(
        data["allPackagesDependencies"]["packageDependencies"],
        json!({"lodash": "4.17.21", "react": "18.2.0"}),
    );
    assert!(entry["timestamp"].as_f64().is_some());
    assert!(
        cache::read(&scope, &components[1], &pool).expect("read").is_none(),
        "a missing package blocks the cache",
    );
}

/// A host whose `acme/envs/vue` env has detectors: `*.vue` files and `custom.ts`
/// (whatever its content, as a detector replaces the built-in detective). Files of
/// other envs are claimed only through a registered `*.svelte` detector.
#[derive(Default)]
struct DetectorHost {
    calls: std::sync::Mutex<Vec<(String, usize)>>,
}

#[async_trait]
impl Host for DetectorHost {
    async fn env_policy(&self, _env_id: &str) -> io::Result<Option<Value>> {
        Ok(None)
    }
    async fn app_types(&self) -> io::Result<Vec<String>> {
        Ok(Vec::new())
    }
    async fn detect_dependencies(
        &self,
        env_id: &str,
        files: &[String],
    ) -> io::Result<Option<Value>> {
        self.calls
            .lock()
            .expect("calls")
            .push((env_id.to_owned(), files.len()));
        let mut found = serde_json::Map::new();
        for file in files {
            if env_id == "acme/envs/vue" && file.ends_with(".vue") {
                found.insert(
                    file.clone(),
                    json!({"dependencies": ["vue", "./helper", "vue", "fs"], "typescript": false}),
                );
            } else if env_id == "acme/envs/vue" && file.ends_with("custom.ts") {
                found.insert(file.clone(), json!({"dependencies": {"preact": true}}));
            } else if file.ends_with(".svelte") {
                found.insert(
                    file.clone(),
                    json!({"dependencies": ["svelte", "./util.js"], "typescript": true}),
                );
            }
        }
        Ok((env_id == "acme/envs/vue" || !found.is_empty()).then_some(Value::Object(found)))
    }
    async fn package_json_props(&self, _env_id: &str) -> io::Result<Value> {
        Ok(Value::Null)
    }
    async fn transform_package_json(&self, _component: &str, manifest: Value) -> io::Result<Value> {
        Ok(manifest)
    }
    async fn after_install(&self, _request: AfterInstall) -> io::Result<AfterInstallResult> {
        Ok(AfterInstallResult::default())
    }
    async fn confirm(&self, _question: &str) -> io::Result<bool> {
        Ok(false)
    }
}

/// `acme/ui/widget` of the `acme/envs/vue` env: `widget.vue` (a custom detector),
/// `custom.ts` (a custom detector replacing the built-in one) and `index.ts` (built-in).
fn vue_fixture(root: &Path) -> WorkspaceComponent {
    let mut widget = component(root, "acme/ui/widget@1.0.0", "acme/envs/vue@1.0.0");
    widget.files =
        vec!["widget.vue".into(), "custom.ts".into(), "index.ts".into(), "helper.ts".into()];
    write(&widget.dir.join("widget.vue"), "<script>import 'ignored-by-the-detector';</script>\n");
    write(&widget.dir.join("custom.ts"), "import _ from 'lodash';\n");
    write(&widget.dir.join("index.ts"), "import _ from 'lodash';\n");
    write(&widget.dir.join("helper.ts"), "export const helper = 1;\n");
    package(root, "vue", &json!({"name": "vue", "version": "3.4.0"}));
    package(root, "preact", &json!({"name": "preact", "version": "10.19.0"}));
    package(root, "lodash", &json!({"name": "lodash", "version": "4.17.21"}));
    widget
}

fn vue_packages() -> Vec<(String, String)> {
    vec![
        ("vue".into(), "3.4.0".into()),
        ("preact".into(), "10.19.0".into()),
        ("lodash".into(), "4.17.21".into()),
    ]
}

#[tokio::test]
async fn env_detectors_replace_the_built_in_detection_of_the_files_they_support() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let widget = vue_fixture(root);
    let host = DetectorHost::default();
    let result =
        run_with(root, &[widget], &IndexMap::new(), &DependencyOptions::default(), &host).await;
    let widget = &result["acme/ui/widget"];
    // `custom.ts` contributes preact (not its lodash import), `index.ts` lodash, `widget.vue`
    // vue; `./helper` is the component's own file and `fs` a built-in.
    assert_eq!(packages(widget, Lifecycle::Runtime), vue_packages());
    assert!(widget.missing_packages.runtime.is_empty());
    assert_eq!(
        *host.calls.lock().expect("calls"),
        vec![("acme/envs/vue".to_owned(), 4)],
        "the env id is asked without its version, with every file",
    );
}

#[tokio::test]
async fn detectors_are_asked_only_for_components_that_can_have_them() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut plain = component(root, "acme/plain@1.0.0", "teambit.harmony/node");
    plain.files = vec!["index.ts".into()];
    write(&plain.dir.join("index.ts"), "export const x = 1;\n");
    let mut aspect = component(root, "acme/with-aspect@1.0.0", "teambit.react/react");
    aspect.files = vec!["index.svelte".into(), "util.ts".into()];
    aspect.config.insert("acme/aspects/svelte".into(), json!({}));
    write(&aspect.dir.join("index.svelte"), "");
    write(&aspect.dir.join("util.ts"), "export const util = 1;\n");
    package(root, "svelte", &json!({"name": "svelte", "version": "4.2.0"}));
    let mut first = component(root, "acme/first@1.0.0", "acme/envs/no-detectors");
    first.files = vec!["index.ts".into()];
    write(&first.dir.join("index.ts"), "export const x = 1;\n");
    let mut second = component(root, "acme/second@1.0.0", "acme/envs/no-detectors@2.0.0");
    second.files = vec!["index.ts".into()];
    write(&second.dir.join("index.ts"), "export const x = 1;\n");
    let host = DetectorHost::default();
    let components = [plain, aspect, first, second];
    let result =
        run_with(root, &components, &IndexMap::new(), &DependencyOptions::default(), &host).await;
    assert_eq!(
        *host.calls.lock().expect("calls"),
        vec![("teambit.react/react".to_owned(), 2), ("acme/envs/no-detectors".to_owned(), 1)],
        "a core env without non-core aspects is never asked; an env without detectors once",
    );
    assert_eq!(
        packages(&result["acme/with-aspect"], Lifecycle::Runtime),
        vec![("svelte".into(), "4.2.0".into())],
    );
}

#[test]
fn a_registered_detector_resolves_relative_imports_through_typescript() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    let mut svelte = component(root, "acme/svelte@1.0.0", "teambit.harmony/node");
    svelte.files = vec!["index.svelte".into(), "util.ts".into()];
    write(&svelte.dir.join("util.ts"), "export const util = 1;\n");
    let components = [svelte];
    let mut resolver = Resolver::new(root, &components, &[]);
    let mut resolve = |typescript| {
        resolver
            .resolve_from(&components[0], "index.svelte", "./util.js", typescript)
            .expect("resolve")
    };
    assert_eq!(resolve(true), Resolved::Internal);
    assert_eq!(resolve(false), Resolved::MissingFile("./util.js".into()));
}

#[tokio::test]
async fn a_cache_entry_written_without_detectors_is_not_used() {
    let temp = tempfile::tempdir().expect("tempdir");
    let root = temp.path();
    fs::create_dir_all(root.join(".bit/objects")).expect("scope");
    let components = [vue_fixture(root)];
    let options = DependencyOptions { use_cache: true, ..DependencyOptions::default() };
    // An install that did not apply detectors cached the built-in detection.
    let before =
        run_with(root, &components, &IndexMap::new(), &options, &TestHost::default()).await;
    assert_eq!(
        packages(&before["acme/ui/widget"], Lifecycle::Runtime),
        vec![("lodash".into(), "4.17.21".into())],
    );
    let after =
        run_with(root, &components, &IndexMap::new(), &options, &DetectorHost::default()).await;
    assert_eq!(packages(&after["acme/ui/widget"], Lifecycle::Runtime), vue_packages());
    // The fresh detection replaces the entry, for the TypeScript loader.
    let scope = Scope::find(root).expect("scope");
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(1)
        .build()
        .expect("pool");
    let cached = cache::read(&scope, &components[0], &pool).expect("read").expect("cached");
    assert!(cached.packages[0].contains_key("vue"));
}
