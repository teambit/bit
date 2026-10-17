//! Per-component dependency lists: detection, overrides and versions.
//!
//! This is the dependency computation Bit performs while loading a workspace
//! component (`DependenciesLoader`): detection (from Bit's dependency cache when
//! fresh, otherwise by scanning the files), `ApplyOverrides`, version resolution
//! and `extractDepsFromLegacy`. The result is what the `dependency-resolver`
//! aspect data holds after the component loads.

pub mod cache;
pub mod glob;

pub use detect::definitely_typed;
pub use dev_files::{DevPatternConfig, EnvDevPatterns, dev_files, dev_patterns};
pub use resolve::package_name as specifier_package_name;
pub use versions::valid_component_version;

mod apply;
mod apply_late;
mod builtins;
mod component_model;
mod data;
mod detect;
mod detectors;
mod dev_files;
mod list;
mod resolve;
mod scan;
#[cfg(test)]
mod tests;
mod versions;

use crate::{
    host::{CoreAspect, Host},
    model::{
        ComponentDependencies, ComponentId, EnvPolicy, Manifest, PolicyEntry, WorkspaceComponent,
    },
    policy::{self, EnvJsoncReader, VariantOptions, is_core_env, overrides, scope::Scope},
};
use component_model::ComponentModel;
use data::Detected;
use detectors::{CustomDetection, Detectors};
use dev_files::EnvPatterns;
use indexmap::IndexMap;
use resolve::Resolver;
use serde_json::Value;
use std::{io, path::Path};

/// Envs whose components may implement `getDependencies()` without an `env.jsonc`
/// (`getEnvDefinitionById` knows them once loaded as aspects).
const ASPECT_ENVS: [&str; 4] = [
    "teambit.envs/env",
    "teambit.harmony/aspect",
    "teambit.harmony/envs/core-aspect-env",
    "teambit.harmony/envs/core-aspect-env-jest",
];

/// Default dev-file patterns of the tester, compositions and docs aspects.
pub const DEFAULT_DEV_PATTERNS: [&str; 4] = [
    "**/*.spec.+(js|ts|jsx|tsx)",
    "**/*.test.+(js|ts|jsx|tsx)",
    "**/*.composition?(s).*",
    "**/*.docs.*",
];

/// Inputs beyond the components and policies.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct DependencyOptions {
    /// Bit's core aspects: imports of their packages are not dependencies.
    pub core_aspects: Vec<CoreAspect>,
    /// Dependency data of the merge-config file, by component id without version.
    pub merge_config: IndexMap<String, Value>,
    /// `updateDependents` of the current lane.
    pub update_dependents: Vec<ComponentId>,
    /// Read Bit's dependency cache when it is fresh, and write it after a detection.
    pub use_cache: bool,
    /// The workspace configuration of the dev-pattern registrars.
    pub dev_patterns: DevPatternConfig,
    /// Dependency policies aspects registered (`registerDependenciesPolicies`).
    pub policy_slots: Vec<crate::policy::slots::Registration>,
    /// The non-core aspects `workspace.jsonc` configures at its root, which the CLI
    /// loads on start (`getNotLoadedConfiguredExtensions`): any may register a detector.
    pub workspace_aspects: Vec<String>,
}

/// Workspace-wide inputs shared by every component.
pub struct Workspace<'a> {
    pub components: &'a [WorkspaceComponent],
    /// The workspace policy `toManifest()`: `[dependencies, peerDependencies]`.
    pub manifest: [IndexMap<String, String>; 2],
    pub root_package_json: Option<&'a Manifest>,
    pub options: &'a DependencyOptions,
}

impl Workspace<'_> {
    /// The `.bitmap` id matching `id` without version (`getIdFromBitMap`).
    #[must_use]
    pub fn bitmap_id(&self, id: &ComponentId) -> Option<&ComponentId> {
        self.components
            .iter()
            .map(|component| &component.id)
            .find(|candidate| detect::same(candidate, id))
    }

    /// Whether `id` is a Bit core aspect.
    #[must_use]
    pub fn is_core_aspect(&self, id: &ComponentId) -> bool {
        self.is_core_aspect_id(&id.to_string_without_version())
    }

    #[must_use]
    pub fn is_core_aspect_id(&self, id: &str) -> bool {
        is_core_env(id)
            || self.options.core_aspects
                .iter()
                .any(|aspect| aspect.id == id)
    }

    /// The package name of a component: the workspace component's, else the default
    /// `componentIdToPackageName` naming.
    #[must_use]
    pub fn package_name(&self, id: &ComponentId) -> String {
        self.components
            .iter()
            .find(|component| detect::same(&component.id, id))
            .map_or_else(|| default_package_name(id), |component| component.package_name.clone())
    }
}

/// `componentIdToPackageName` without a binding prefix or `pkg` configuration.
#[must_use]
pub fn default_package_name(id: &ComponentId) -> String {
    let scope = id.effective_scope().unwrap_or_default();
    let owner = scope.split('.').next().unwrap_or(scope);
    let name = format!("{scope}.{}", id.name.replace('/', "."));
    let stripped = name
        .strip_prefix(&format!("{owner}."))
        .unwrap_or(&name);
    format!("@{owner}/{stripped}")
}

/// One component being computed.
pub struct Subject<'a> {
    pub component: &'a WorkspaceComponent,
    pub model: ComponentModel,
    pub dev_files: Vec<String>,
    /// The env policy of the component itself, when it is an env with an `env.jsonc`.
    pub own_env: Option<EnvPolicy>,
    /// The files a custom detector supports, with what it found.
    pub custom: IndexMap<String, CustomDetection>,
}

/// The dependency data of every component, keyed by component id without version.
/// `host` serves the env hooks implemented in JavaScript: dev patterns, custom
/// detectors, and `getDependencies()` of env components without an `env.jsonc`.
pub async fn compute(
    root: &Path,
    components: &[WorkspaceComponent],
    workspace_policy: &[PolicyEntry],
    env_policies: &IndexMap<String, EnvPolicy>,
    root_package_json: Option<&Manifest>,
    options: &DependencyOptions,
    host: &dyn Host,
) -> io::Result<IndexMap<String, ComponentDependencies>> {
    let workspace = Workspace {
        components,
        manifest: policy::workspace_manifest(workspace_policy),
        root_package_json,
        options,
    };
    let scope = Scope::find(root);
    invalidate_cache(root, scope.as_ref(), options)?;
    let reader = EnvJsoncReader { components, scope: scope.clone() };
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(2)
        .build()
        .map_err(io::Error::other)?;
    let mut resolver = Resolver::new(root, components, &options.core_aspects);
    let mut env_patterns = EnvPatterns::new(&reader, host, &options.dev_patterns);
    let mut detectors = Detectors::new(host, &options.core_aspects, &options.workspace_aspects);
    let mut result = IndexMap::new();
    for component in components {
        let mut subject =
            subject(component, scope.as_ref(), &reader, &mut env_patterns, options, host).await?;
        subject.custom = detectors.get(component).await?;
        let context = Context {
            workspace: &workspace,
            scope: scope.as_ref(),
            pool: &pool,
            env_policy: env_policies
                .get(&component.env_id)
                .cloned()
                .unwrap_or_default(),
        };
        let dependencies = one(&context, &subject, &mut resolver)?;
        result.insert(component.id.to_string_without_version(), dependencies);
    }
    Ok(result)
}

/// `ComponentLoader.invalidateDependenciesCache`, before the components load.
fn invalidate_cache(
    root: &Path,
    scope: Option<&Scope>,
    options: &DependencyOptions,
) -> io::Result<()> {
    if options.use_cache
        && !cache::disabled()
        && let Some(scope) = scope
    {
        cache::invalidation::invalidate(root, &scope.dependency_cache())?;
    }
    Ok(())
}

struct Context<'a> {
    workspace: &'a Workspace<'a>,
    scope: Option<&'a Scope>,
    pool: &'a rayon::ThreadPool,
    env_policy: EnvPolicy,
}

async fn subject<'a>(
    component: &'a WorkspaceComponent,
    scope: Option<&Scope>,
    reader: &EnvJsoncReader<'_>,
    env_patterns: &mut EnvPatterns<'_>,
    options: &DependencyOptions,
    host: &dyn Host,
) -> io::Result<Subject<'a>> {
    let own_env = own_env(component, reader, &options.workspace_aspects, host).await?;
    let patterns = env_patterns.get(&component.env_id).await?;
    let dev_files = dev_files::dev_files(
        component,
        &dev_files::dev_patterns(component, env_patterns.config, &patterns),
    );
    let version = component.id.version
        .as_deref()
        .filter(|version| !version.is_empty());
    let model = match (scope, version) {
        (Some(scope), Some(version)) => {
            scope.version(&component.id.to_string_without_version(), Some(version))?
        }
        _ => None,
    };
    Ok(Subject {
        component,
        model: ComponentModel::new(model),
        dev_files,
        own_env,
        custom: IndexMap::new(),
    })
}

/// `getEnvPolicyFromEnvId` for the component itself: its `env.jsonc` policy, else
/// its `getDependencies()` when it is an env (a user env is never a core env, so
/// legacy `peerDependencies` do not become its own peers). A component of an aspect
/// env is an env only when it is registered as one: `getEnvDefinitionById` does not
/// load it, and loading an aspect that is not an env costs seconds.
async fn own_env(
    component: &WorkspaceComponent,
    reader: &EnvJsoncReader<'_>,
    workspace_aspects: &[String],
    host: &dyn Host,
) -> io::Result<Option<EnvPolicy>> {
    if has_env_jsonc(component) {
        let manifest = reader.resolved(&component.id.to_string_without_version())?;
        return manifest
            .as_ref()
            .and_then(|manifest| manifest.get("policy"))
            .filter(|policy| policy.is_object())
            .map(|policy| policy::env::from_config(policy, false))
            .transpose();
    }
    let aspect_env = ASPECT_ENVS.contains(&policy::split_version(&component.env_id).0);
    if !component.is_env && !aspect_env {
        return Ok(None);
    }
    let id = component.id.to_string_without_version();
    // `getPoliciesFromEnvForItself` finds no policy for an env the install did not
    // register; the default env it resolves to applies to its components only.
    if component.is_env && host.env_falls_back(&id).await? {
        return Ok(None);
    }
    let config = if component.is_env {
        host.env_policy(&id).await?
    } else {
        host.registered_env_policy(&id, workspace_aspects).await?
    };
    let Some(config) = config else {
        return Ok(None);
    };
    policy::env::from_config(&config, false).map(Some)
}

fn has_env_jsonc(component: &WorkspaceComponent) -> bool {
    component.files
        .iter()
        .any(|file| file == "env.jsonc" || file == "env.json")
}

/// Detection, overrides, versions and the final list of one component.
fn one(
    context: &Context<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
) -> io::Result<ComponentDependencies> {
    let workspace = context.workspace;
    let component = subject.component;
    let policy = policy::component_policy(
        component,
        &context.env_policy,
        subject.own_env.as_ref(),
        &workspace.options.policy_slots,
    );
    let merge_config = workspace.options.merge_config
        .get(&component.id.to_string_without_version())
        .map(|data| {
            policy::entries::from_variant_config(
                data,
                &VariantOptions { source: Some("auto"), ..VariantOptions::default() },
            )
        })
        .unwrap_or_default();
    let deps = overrides::deps(&policy);
    let auto_detect =
        overrides::auto_detect(&policy::merge(vec![policy.clone(), merge_config.clone()]));
    let merge_config = overrides::auto_detect(&merge_config);
    let mut detected = detected(context, subject, resolver)?;
    let origin = apply::early(workspace, &subject.model, &deps, &mut detected);
    apply_late::auto_detect(&auto_detect, &deps, &origin, &mut detected);
    let env_own = apply_late::env_own_peers(workspace, subject, resolver, &mut detected)?;
    apply_late::manually_add(workspace, subject, resolver, &deps, &mut detected)?;
    apply_late::remove_components_from_packages(&mut detected);
    let inputs = versions::VersionInputs {
        deps: &deps,
        auto_detect: &auto_detect,
        merge_config: &merge_config,
        env_own: &env_own,
    };
    versions::update(workspace, subject, &inputs, &mut detected);
    Ok(list::build(workspace, subject, &inputs, &detected, policy))
}

fn detected(
    context: &Context<'_>,
    subject: &Subject<'_>,
    resolver: &mut Resolver<'_>,
) -> io::Result<Detected> {
    // The workspace-root component (`rootDir: "."`) is the workspace itself: never detected.
    if subject.component.root_dir == "." {
        return Ok(Detected::default());
    }
    let cache = context.workspace.options.use_cache && !cache::disabled();
    // The cache entry is keyed by the component id and checked against file times, as
    // in TypeScript; detector output is not part of it, so an entry written without the
    // detectors (by an earlier native install) would be stale. A component a custom
    // detector applies to is therefore always detected; its fresh entry is still written.
    if cache
        && subject.custom.is_empty()
        && let Some(scope) = context.scope
        && let Some(cached) = cache::read(scope, subject.component, context.pool)?
    {
        return Ok(cached);
    }
    let detected = detect::detect(context.workspace, subject, resolver)?;
    // Like `DependenciesLoader`, a failed cache write never fails the load.
    if cache
        && !detected.blocks_cache()
        && let Some(scope) = context.scope
    {
        let _ = cache::write(scope, subject.component, &detected);
    }
    Ok(detected)
}
