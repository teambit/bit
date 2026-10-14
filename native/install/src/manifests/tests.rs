//! End-to-end cases of `plan`, with expectations traced through the TypeScript sources.

use super::{
    ManifestContext, ManifestInput, ManifestOptions, ManifestOutcome, Policies, RemoteFilter,
    manifests_hash, plan,
};
use crate::{
    config::DependencyResolverConfig,
    host::CoreAspect,
    model::{
        ComponentDependencies, ComponentDependency, ComponentId, DependencyMap, EnvPolicy,
        Lifecycle, Manifest, MissingPackages, PackageDependency, PolicyEntry, WorkspaceComponent,
    },
};
use indexmap::IndexMap;
use serde_json::{Value, json};
use std::path::{Path, PathBuf};

pub(super) const ROOT: &str = "/ws";

pub(super) fn id(scope: &str, name: &str, version: Option<&str>) -> ComponentId {
    ComponentId {
        scope: Some(scope.to_string()),
        default_scope: None,
        name: name.to_string(),
        version: version.map(str::to_string),
    }
}

pub(super) fn component(
    scope: &str,
    name: &str,
    version: Option<&str>,
    env: &str,
) -> WorkspaceComponent {
    WorkspaceComponent {
        id: id(scope, name, version),
        root_dir: name.to_string(),
        dir: Path::new(ROOT).join(name),
        files: vec!["index.ts".to_string()],
        main_file: "index.ts".to_string(),
        package_name: format!("@{}/{}", scope.replace('.', "-"), name.replace('/', ".")),
        env_id: env.to_string(),
        is_env: false,
        has_package_json: false,
        config: serde_json::Map::new(),
    }
}

pub(super) fn package(name: &str, version: &str, lifecycle: Lifecycle) -> PackageDependency {
    PackageDependency {
        name: name.to_string(),
        version: version.to_string(),
        lifecycle,
        optional: false,
    }
}

pub(super) fn component_dep(dep: &WorkspaceComponent, version: &str) -> ComponentDependency {
    let mut dep_id = dep.id.clone();
    dep_id.version = Some(version.to_string());
    ComponentDependency {
        id: dep_id,
        package_name: dep.package_name.clone(),
        lifecycle: Lifecycle::Runtime,
        is_extension: false,
        optional: false,
        hidden: false,
    }
}

pub(super) fn entry(name: &str, version: &str, lifecycle: Lifecycle) -> PolicyEntry {
    PolicyEntry {
        name: name.to_string(),
        version: version.to_string(),
        lifecycle,
        force: false,
        optional: false,
        hidden: false,
        preserve: None,
        workspace_singleton: false,
        r#override: false,
        source: None,
        resolve_from_env: false,
    }
}

pub(super) fn map(entries: &[(&str, &str)]) -> DependencyMap {
    entries
        .iter()
        .map(|(name, spec)| ((*name).to_string(), (*spec).to_string()))
        .collect()
}

pub(super) fn env_peer(name: &str, version: &str) -> PolicyEntry {
    PolicyEntry {
        force: true,
        source: Some("env-own".to_string()),
        ..entry(name, version, Lifecycle::Runtime)
    }
}

/// Owned inputs of one `plan` call.
pub(super) struct Fixture {
    pub(super) components: Vec<WorkspaceComponent>,
    pub(super) dependencies: IndexMap<String, ComponentDependencies>,
    pub(super) workspace: Vec<PolicyEntry>,
    pub(super) envs: IndexMap<String, EnvPolicy>,
    pub(super) config: DependencyResolverConfig,
    pub(super) options: ManifestOptions,
    pub(super) linked: DependencyMap,
    pub(super) filter: Option<RemoteFilter>,
}

pub(super) struct Extra {
    pub(super) core_aspects: Vec<CoreAspect>,
    pub(super) apps: Vec<String>,
    pub(super) env_packages: IndexMap<String, String>,
}

impl Fixture {
    pub(super) fn new(components: Vec<WorkspaceComponent>) -> Self {
        let config = DependencyResolverConfig::default();
        let options =
            ManifestOptions::new(&config, true, Path::new(ROOT).join("node_modules/.bit_roots"));
        Fixture {
            components,
            dependencies: IndexMap::new(),
            workspace: Vec::new(),
            envs: IndexMap::new(),
            config,
            options,
            linked: DependencyMap::new(),
            filter: None,
        }
    }

    pub(super) fn deps(&mut self, component: usize, deps: ComponentDependencies) {
        self.dependencies.insert(self.components[component].id.to_string_without_version(), deps);
    }

    pub(super) fn run_with(&self, extra: &Extra) -> ManifestOutcome {
        let input = ManifestInput {
            root: Path::new(ROOT),
            components: &self.components,
            dependencies: &self.dependencies,
            policies: Policies { workspace: &self.workspace, envs: &self.envs },
            config: &self.config,
            options: &self.options,
            context: ManifestContext {
                linked_root_deps: &self.linked,
                remote_filter: self.filter.as_ref(),
                core_aspects: &extra.core_aspects,
                apps: &extra.apps,
                env_packages: &extra.env_packages,
            },
        };
        plan(&input).expect("plan")
    }

    pub(super) fn run(&self) -> ManifestOutcome {
        self.run_with(&Extra {
            core_aspects: Vec::new(),
            apps: Vec::new(),
            env_packages: IndexMap::new(),
        })
    }
}

pub(super) fn manifest<'a>(outcome: &'a ManifestOutcome, dir: &str) -> &'a Manifest {
    let dir = PathBuf::from(dir);
    &outcome.plan.projects
        .iter()
        .find(|project| project.dir == dir)
        .unwrap_or_else(|| panic!("no project {dir:?}"))
        .manifest
}

fn field(manifest: &Manifest, key: &str) -> Value {
    manifest
        .get(key)
        .cloned()
        .unwrap_or(Value::Null)
}

const NODE: &str = "teambit.harmony/node";

#[test]
fn dedupes_into_the_root_and_drops_workspace_components() {
    let mut fixture = Fixture::new(vec![
        component("org.ui", "button", Some("1.0.0"), NODE),
        component("org.ui", "card", None, NODE),
    ]);
    let button = fixture.components[0].clone();
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![
                package("lodash", "^4.17.0", Lifecycle::Runtime),
                package("jest", "29.0.0", Lifecycle::Dev),
            ],
            ..Default::default()
        },
    );
    fixture.deps(
        1,
        ComponentDependencies {
            packages: vec![package("lodash", "^4.17.1", Lifecycle::Runtime)],
            components: vec![component_dep(&button, "1.0.0")],
            ..Default::default()
        },
    );
    let outcome = fixture.run();
    let root = manifest(&outcome, ROOT);
    assert_eq!(outcome.plan.projects[0].dir, PathBuf::from(ROOT));
    assert_eq!(field(root, "name"), json!("workspace"));
    assert_eq!(field(root, "version"), json!("1.0.0"));
    assert_eq!(field(root, "dependencies"), json!({ "lodash": ">=4.17.1 <5.0.0" }));
    assert_eq!(field(root, "devDependencies"), json!({ "jest": "29.0.0" }));
    assert_eq!(field(root, "dependenciesMeta"), json!({}));
    let card = manifest(&outcome, "/ws/card");
    assert_eq!(field(card, "name"), json!("@org-ui/card"));
    assert_eq!(field(card, "version"), json!("0.0.1-new"));
    assert_eq!(field(card, "dependencies"), json!({}));
    assert_eq!(field(manifest(&outcome, "/ws/button"), "version"), json!("1.0.0"));
}

#[test]
fn versions_come_from_component_policy_then_workspace_policy() {
    let mut fixture = Fixture::new(vec![component("org.ui", "button", Some("abc1234"), NODE)]);
    fixture.options.dedupe = false;
    fixture.workspace = vec![
        entry("react", "^18.2.0", Lifecycle::Peer),
        entry("lodash", "4.17.21", Lifecycle::Runtime),
    ];
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![
                package("lodash", "4.17.0", Lifecycle::Dev),
                package("react", "^18.0.0", Lifecycle::Peer),
                package("chalk", "4.1.0", Lifecycle::Runtime),
                package("snap", "1234567", Lifecycle::Runtime),
                package("blank", "", Lifecycle::Runtime),
            ],
            policy: vec![
                entry("chalk", "^5.0.0", Lifecycle::Runtime),
                entry("snap", "+", Lifecycle::Runtime),
            ],
            ..Default::default()
        },
    );
    let outcome = fixture.run();
    let button = manifest(&outcome, "/ws/button");
    assert_eq!(field(button, "version"), json!("0.0.0-abc1234"));
    assert_eq!(
        field(button, "dependencies"),
        json!({ "chalk": "^5.0.0", "snap": "0.0.0-1234567", "blank": "0.0.1-new" }),
    );
    // The root policy's runtime entry versions dev dependencies too.
    assert_eq!(field(button, "devDependencies"), json!({ "lodash": "4.17.21" }));
    assert_eq!(field(button, "peerDependencies"), json!({ "react": "^18.2.0" }));
    let root = manifest(&outcome, ROOT);
    // Without dedupe the root is the policy manifest; peers are copied to dependencies.
    assert_eq!(field(root, "dependencies"), json!({ "react": "^18.2.0", "lodash": "4.17.21" }));
    assert_eq!(field(root, "peerDependencies"), json!({ "react": "^18.2.0" }));
}

#[test]
fn optional_dependencies_and_peer_meta() {
    let mut fixture = Fixture::new(vec![component("org.ui", "button", Some("1.0.0"), NODE)]);
    fixture.options.dedupe = false;
    let mut optional = package("fsevents", "^2.0.0", Lifecycle::Runtime);
    optional.optional = true;
    let mut optional_peer = package("typescript", "^5.0.0", Lifecycle::Peer);
    optional_peer.optional = true;
    fixture.deps(
        0,
        ComponentDependencies { packages: vec![optional, optional_peer], ..Default::default() },
    );
    let button = manifest(&fixture.run(), "/ws/button").clone();
    assert_eq!(field(&button, "optionalDependencies"), json!({ "fsevents": "^2.0.0" }));
    assert_eq!(
        field(&button, "peerDependenciesMeta"),
        json!({ "typescript": { "optional": true } }),
    );
}

#[test]
fn remote_filter_drops_components_without_a_registry() {
    let local = component("local.remote", "util", Some("1.0.0"), NODE);
    let hub = component("org.hub", "util", Some("2.0.0"), NODE);
    let registry = component("bit.registry", "util", Some("3.0.0"), NODE);
    let mut fixture = Fixture::new(vec![component("org.ui", "button", Some("1.0.0"), NODE)]);
    fixture.options.dedupe = false;
    fixture.filter = Some(RemoteFilter {
        local_remotes: vec!["local.remote".to_string(), "bit.registry".to_string()],
        registry_scopes: vec!["bit-registry".to_string()],
    });
    fixture.deps(
        0,
        ComponentDependencies {
            components: vec![
                component_dep(&local, "1.0.0"),
                component_dep(&hub, "2.0.0"),
                component_dep(&registry, "3.0.0"),
            ],
            ..Default::default()
        },
    );
    let button = manifest(&fixture.run(), "/ws/button").clone();
    assert_eq!(
        field(&button, "dependencies"),
        json!({ "@org-hub/util": "2.0.0", "@bit-registry/util": "3.0.0" }),
    );
}

#[test]
fn legacy_and_core_packages_leave_the_policy_and_manifests() {
    let mut fixture = Fixture::new(vec![component("org.ui", "button", Some("1.0.0"), NODE)]);
    fixture.options.dedupe = false;
    fixture.workspace = vec![
        entry("@teambit/legacy", "1.0.0", Lifecycle::Runtime),
        entry("@teambit/react", "1.0.0", Lifecycle::Runtime),
        entry("@teambit/harmony", "0.4.6", Lifecycle::Runtime),
    ];
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![package("@teambit/legacy", "1.0.0", Lifecycle::Runtime)],
            ..Default::default()
        },
    );
    fixture.linked = [("@teambit/bit", "link:/bit"), ("@org-ui/button", "link:/elsewhere")]
        .into_iter()
        .map(|(name, spec)| (name.to_string(), spec.to_string()))
        .collect();
    let extra = Extra {
        core_aspects: vec![CoreAspect {
            id: "teambit.react/react".into(),
            package_name: "@teambit/react".into(),
            dir: "/bit/react".into(),
        }],
        apps: Vec::new(),
        env_packages: IndexMap::new(),
    };
    let outcome = fixture.run_with(&extra);
    let root = manifest(&outcome, ROOT);
    // Harmony is dropped unless `workspace.jsonc` forces a version; links come first.
    assert_eq!(
        field(root, "dependencies"),
        json!({ "@teambit/bit": "link:/bit", "@org-ui/button": "link:/elsewhere" }),
    );
    assert_eq!(outcome.plan.forced_harmony_version, None);
    assert_eq!(field(manifest(&outcome, "/ws/button"), "dependencies"), json!({}));
}

#[test]
fn forced_harmony_and_direct_links_are_kept_or_dropped() {
    let mut fixture = Fixture::new(vec![
        component("org.ui", "button", Some("1.0.0"), NODE),
        component("org.ui", "card", Some("1.0.0"), NODE),
    ]);
    fixture.options.dedupe = false;
    fixture.config.policy =
        json!({ "dependencies": { "@teambit/harmony": { "version": "0.4.7" } } });
    fixture.config.overrides = Some([("react".to_string(), "18.0.0".to_string())].into());
    fixture.workspace = vec![entry("@teambit/harmony", "0.4.7", Lifecycle::Runtime)];
    // A package dependency on a workspace component is filtered out of `card`,
    // so it is no direct dependency and the link stays.
    fixture.deps(
        1,
        ComponentDependencies {
            packages: vec![package("@org-ui/button", "1.0.0", Lifecycle::Runtime)],
            ..Default::default()
        },
    );
    fixture.linked = map(&[("@org-ui/button", "link:/ws/button")]);
    let outcome = fixture.run();
    assert_eq!(outcome.plan.forced_harmony_version.as_deref(), Some("0.4.7"));
    assert_eq!(
        field(manifest(&outcome, ROOT), "dependencies"),
        json!({ "@org-ui/button": "link:/ws/button", "@teambit/harmony": "0.4.7" }),
    );
    assert_eq!(field(manifest(&outcome, "/ws/card"), "dependencies"), json!({}));
    assert_eq!(outcome.plan.overrides, map(&[("react", "18.0.0")]));
}

fn env_policy(peers: Vec<PolicyEntry>) -> EnvPolicy {
    EnvPolicy { component: Vec::new(), self_policy: peers, ..EnvPolicy::default() }
}

#[test]
fn env_peers_go_to_the_root_and_conflicts_to_components() {
    let mut fixture = Fixture::new(vec![
        component("org.ui", "a", Some("1.0.0"), "org.envs/react-17@1.0.0"),
        component("org.ui", "b", Some("1.0.0"), "org.envs/react-18@2.0.0"),
    ]);
    fixture.envs.insert(
        "org.envs/react-17@1.0.0".into(),
        env_policy(vec![env_peer("react", "^17.0.0"), env_peer("typescript", "5.0.0")]),
    );
    fixture.envs.insert(
        "org.envs/react-18@2.0.0".into(),
        env_policy(vec![env_peer("react", "^18.0.0"), env_peer("typescript", "5.0.0")]),
    );
    let outcome = fixture.run();
    assert_eq!(field(manifest(&outcome, ROOT), "dependencies"), json!({ "typescript": "5.0.0" }));
    assert_eq!(field(manifest(&outcome, "/ws/a"), "dependencies"), json!({ "react": "^17.0.0" }));
    assert_eq!(field(manifest(&outcome, "/ws/b"), "dependencies"), json!({ "react": "^18.0.0" }));
    assert!(outcome.warnings.is_empty() && outcome.messages.is_empty());
}

#[test]
fn singleton_env_peers_resolve_to_one_version_with_a_warning() {
    let mut fixture = Fixture::new(vec![
        component("org.ui", "a", Some("1.0.0"), "org.envs/one@1.0.0"),
        component("org.ui", "b", Some("1.0.0"), "org.envs/two@1.0.0"),
        component("org.ui", "c", Some("1.0.0"), "org.envs/three@1.0.0"),
    ]);
    let singleton = |version: &str| PolicyEntry {
        workspace_singleton: true,
        r#override: true,
        ..env_peer("react", version)
    };
    fixture.envs.insert("org.envs/one@1.0.0".into(), env_policy(vec![singleton("^18.0.0")]));
    fixture.envs.insert("org.envs/two@1.0.0".into(), env_policy(vec![singleton("18.2.0")]));
    fixture.envs.insert("org.envs/three@1.0.0".into(), env_policy(vec![singleton("^17.0.0")]));
    fixture.config.overrides = Some([("lodash".to_string(), "4.0.0".to_string())].into());
    let outcome = fixture.run();
    // `18.2.0` satisfies `^18.0.0` and itself; `^18.0.0` coerces to 18.0.0, satisfying the same two.
    // On the tie the higher coerced version wins.
    assert_eq!(field(manifest(&outcome, ROOT), "dependencies"), json!({ "react": "18.2.0" }));
    assert_eq!(
        outcome.warnings,
        [
            r#"Conflicting env peer versions for "react": using 18.2.0, but not compatible with: ^17.0.0 (org.envs/three)"#
        ],
    );
    assert_eq!(outcome.messages.len(), 1);
    assert!(outcome.messages[0].contains(r#""overrides": { "react": "<version>" }"#));
    assert_eq!(outcome.peer_overrides, map(&[("react", "18.2.0")]));
    let overrides: Vec<_> = outcome.plan.overrides
        .iter()
        .map(|(a, b)| (a.as_str(), b.as_str()))
        .collect();
    assert_eq!(overrides, [("react", "18.2.0"), ("lodash", "4.0.0")]);
}

#[test]
fn env_peers_never_override_the_root_policy_and_resolve_plus() {
    let mut fixture =
        Fixture::new(vec![component("org.ui", "a", Some("1.0.0"), "org.envs/env@1.0.0")]);
    fixture.workspace = vec![
        entry("react", "18.1.0", Lifecycle::Runtime),
        entry("graphql", "16.0.0", Lifecycle::Peer),
    ];
    fixture.envs.insert(
        "org.envs/env@1.0.0".into(),
        env_policy(vec![
            env_peer("react", "^18.0.0"),
            env_peer("graphql", "+"),
            env_peer("vitest", "+"),
        ]),
    );
    let outcome = fixture.run();
    assert_eq!(
        field(manifest(&outcome, ROOT), "dependencies"),
        json!({ "graphql": "16.0.0", "react": "18.1.0", "vitest": "*" }),
    );
}

#[test]
fn legacy_env_peers_are_injected_into_components() {
    let mut fixture =
        Fixture::new(vec![component("org.ui", "a", Some("1.0.0"), "org.envs/env@1.0.0")]);
    fixture.options.resolve_env_peers_from_root = false;
    fixture.options.dedupe = false;
    fixture.envs.insert(
        "org.envs/env@1.0.0".into(),
        env_policy(vec![
            env_peer("react", "^18.0.0"),
            env_peer("graphql", "+"),
            env_peer("vitest", "+"),
        ]),
    );
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![
                package("graphql", "abcdef1", Lifecycle::Peer),
                package("react", "^17.0.0", Lifecycle::Runtime),
            ],
            ..Default::default()
        },
    );
    let outcome = fixture.run();
    assert_eq!(
        field(manifest(&outcome, "/ws/a"), "dependencies"),
        json!({ "react": "^17.0.0", "graphql": "0.0.0-abcdef1", "vitest": "*" }),
    );
    assert_eq!(field(manifest(&outcome, ROOT), "dependencies"), json!({}));
}

#[test]
fn root_components_add_env_and_app_roots() {
    let mut fixture = Fixture::new(vec![
        component("org.ui", "app", Some("1.0.0"), "org.envs/env@1.0.0"),
        component("org.ui", "lib", None, "teambit.harmony/node"),
    ]);
    fixture.config.root_components = Some(true);
    fixture.options = ManifestOptions::new(
        &fixture.config,
        true,
        Path::new(ROOT).join("node_modules/.bit_roots"),
    );
    let lib = fixture.components[1].clone();
    fixture.workspace = vec![entry("lodash", "^4.17.0", Lifecycle::Runtime)];
    let mut forced = env_peer("react", "^18.0.0");
    forced.force = true;
    fixture.envs.insert(
        "org.envs/env@1.0.0".into(),
        env_policy(vec![forced, env_peer("lodash", "+")]),
    );
    let mut lib_dep = component_dep(&lib, "0.0.1");
    lib_dep.id.version = None;
    fixture.deps(
        0,
        ComponentDependencies {
            components: vec![lib_dep],
            packages: vec![package("express", "^4.0.0", Lifecycle::Runtime)],
            missing_packages: MissingPackages {
                runtime: vec!["lodash".into(), "@org-ui/lib".into()],
                dev: Vec::new(),
            },
            ..Default::default()
        },
    );
    let extra = Extra {
        core_aspects: Vec::new(),
        apps: vec!["org.ui/app".to_string()],
        env_packages: [("org.envs/env".to_string(), "@org-envs/env".to_string())].into(),
    };
    // `app` references `lib` as `workspace:*`, so the root's link to `lib` is dropped.
    fixture.linked = [("@org-ui/lib", "link:/ws/lib"), ("@teambit/bit", "link:/bit")]
        .into_iter()
        .map(|(a, b)| (a.to_string(), b.to_string()))
        .collect();
    let outcome = fixture.run_with(&extra);
    let app = manifest(&outcome, "/ws/app");
    // Missing root-policy dependencies are added; the version-less workspace
    // dependency equals the version-less workspace id, so it is referenced locally.
    let app_deps: Vec<_> = app["dependencies"]
        .as_object()
        .unwrap()
        .keys()
        .cloned()
        .collect();
    assert_eq!(app_deps, ["lodash", "@org-ui/lib", "express"]);
    assert_eq!(
        field(app, "dependencies"),
        json!({ "lodash": "^4.17.0", "@org-ui/lib": "workspace:*", "express": "^4.0.0" }),
    );
    let env_root = manifest(&outcome, "/ws/node_modules/.bit_roots/org.envs_env@1.0.0");
    assert_eq!(
        field(env_root, "dependencies"),
        json!({ "react": "^18.0.0", "lodash": "*", "@org-ui/app": "workspace:*", "@org-ui/lib": "workspace:*", "@org-envs/env": "1.0.0" }),
    );
    assert_eq!(field(env_root, "installConfig"), json!({ "hoistingLimits": "workspaces" }));
    let node_root = manifest(&outcome, "/ws/node_modules/.bit_roots/teambit.harmony_node");
    assert_eq!(
        field(node_root, "dependencies"),
        json!({ "@org-ui/app": "workspace:*", "@org-ui/lib": "workspace:*" }),
    );
    let app_root = manifest(&outcome, "/ws/node_modules/.bit_roots/org.ui_app");
    assert_eq!(field(app_root, "name"), Value::Null);
    assert_eq!(
        field(app_root, "dependencies"),
        json!({ "react": "^18.0.0", "lodash": "^4.17.0", "express": "^4.0.0", "@org-ui/app": "workspace:*", "@org-ui/lib": "workspace:*" }),
    );
    assert_eq!(
        field(manifest(&outcome, ROOT), "dependencies"),
        json!({ "@teambit/bit": "link:/bit", "lodash": "^4.17.0", "express": "^4.0.0", "react": "^18.0.0" }),
    );
    assert_eq!(outcome.plan.external_dependencies, ["@org-ui/app", "@org-ui/lib"]);
    assert!(outcome.has_missing_local_components);
    assert_eq!(outcome.root_dirs.len(), 3);
}

#[test]
fn hash_ignores_the_dependency_type() {
    let mut fixture = Fixture::new(vec![component("org.ui", "a", Some("1.0.0"), NODE)]);
    fixture.options.dedupe = false;
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![package("x", "1.0.0", Lifecycle::Runtime)],
            ..Default::default()
        },
    );
    let runtime = manifests_hash(&fixture.run().plan);
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![package("x", "1.0.0", Lifecycle::Dev)],
            ..Default::default()
        },
    );
    assert_eq!(runtime, manifests_hash(&fixture.run().plan));
    fixture.deps(
        0,
        ComponentDependencies {
            packages: vec![package("x", "2.0.0", Lifecycle::Dev)],
            ..Default::default()
        },
    );
    assert_ne!(runtime, manifests_hash(&fixture.run().plan));
}
