//! Workspace and component manifests handed to the engine.
//!
//! A port of `WorkspaceManifestFactory` (`dependency-resolver`), the root
//! components part of `InstallMain._getComponentsManifests`, and the manifest
//! preparation of `DependencyInstaller.installComponents`.

pub(crate) mod semver;

pub use assemble::{manifests_hash, subscriber_links};

mod assemble;
mod component_deps;
mod dedupe;
mod deps;
mod env_root;
mod intersect;
mod load_order;
mod root_components;
#[cfg(test)]
mod subscriber_tests;
mod versions;

use crate::{
    config::DependencyResolverConfig,
    host::CoreAspect,
    model::{
        ComponentDependencies, DependencyMap, EnvPolicy, InstallPlan, Manifest, PolicyEntry,
        Project, WorkspaceComponent,
    },
    options::InstallOptions,
};
use component_deps::RootPolicy;
use deps::Field;
use indexmap::IndexMap;
use std::{
    io,
    path::{Path, PathBuf},
};

/// Everything the manifest calculation reads.
#[derive(Debug, Clone, Copy)]
pub struct ManifestInput<'a> {
    /// The workspace root (the root project's dir).
    pub root: &'a Path,
    /// Workspace components, without the component at the workspace root (`rootDir: "."`).
    pub components: &'a [WorkspaceComponent],
    /// Per component, keyed by the component id without version.
    pub dependencies: &'a IndexMap<String, ComponentDependencies>,
    pub policies: Policies<'a>,
    pub config: &'a DependencyResolverConfig,
    pub options: &'a ManifestOptions,
    pub context: ManifestContext<'a>,
}

/// The merged workspace policy and the env policies.
#[derive(Debug, Clone, Copy)]
pub struct Policies<'a> {
    /// The merged root policy (`mergedRootPolicy`), in its final order: merge-config,
    /// root `package.json`, `workspace.jsonc` and configured aspects/envs.
    pub workspace: &'a [PolicyEntry],
    /// Keyed by env id as components reference it (`WorkspaceComponent::env_id`).
    pub envs: &'a IndexMap<String, EnvPolicy>,
}

/// Facts about the installation beyond the workspace's components.
#[derive(Debug, Clone, Copy)]
pub struct ManifestContext<'a> {
    /// `link:` dependencies of the root manifest (core aspects, `@teambit/bit`, ...).
    pub linked_root_deps: &'a DependencyMap,
    /// `None` keeps every component dependency.
    pub remote_filter: Option<&'a RemoteFilter>,
    /// Core aspects: their package names leave the root policy, their ids are never local references.
    pub core_aspects: &'a [CoreAspect],
    /// App components (ids without version), from the registered app types.
    pub apps: &'a [String],
    /// Package names of envs that are neither core nor in the workspace, keyed by env id without version.
    pub env_packages: &'a IndexMap<String, String>,
}

/// Remotes listed in `scope.json` and the global remotes are not on the hub;
/// their components only have packages when a configured registry serves the scope.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct RemoteFilter {
    pub local_remotes: Vec<String>,
    /// Registry scopes without the `@` (`bit`, `my-org`).
    pub registry_scopes: Vec<String>,
}

/// The install options that shape manifests.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "One field per option of `getComponentManifests` and `toJson`."
    )
)]
pub struct ManifestOptions {
    /// `!--skip-dedupe`; ignored with root components.
    pub dedupe: bool,
    pub copy_peer_to_runtime_on_root: bool,
    pub copy_peer_to_runtime_on_components: bool,
    /// `resolveEnvPeersFromRoot` of the manifest factory: env peers go to the root
    /// instead of every component.
    pub resolve_env_peers_from_root: bool,
    /// `WorkspaceManifest.toJson({ resolveEnvPeersFromRoot })`: the root manifest
    /// gets the env peers as defaults.
    pub root_env_peers: bool,
    /// `includeAllEnvPeers`: without `resolveEnvPeersFromRoot`, every env peer is
    /// injected into the component, not only those it uses.
    pub include_all_env_peers: bool,
    pub force_env_peers_to_root: bool,
    pub has_root_components: bool,
    pub node_linker: String,
    /// `rootComponentsPath`: `<rootComponentsDirectory or node_modules>/.bit_roots`.
    pub root_components_dir: PathBuf,
}

impl ManifestOptions {
    /// The options `bit install` uses for `config`.
    #[must_use]
    pub fn new(
        config: &DependencyResolverConfig,
        dedupe: bool,
        root_components_dir: PathBuf,
    ) -> Self {
        let has_root_components = config.has_root_components();
        let resolve_env_peers_from_root = config.resolve_env_peers_from_root();
        ManifestOptions {
            dedupe: !has_root_components && dedupe,
            copy_peer_to_runtime_on_root: true,
            copy_peer_to_runtime_on_components: false,
            resolve_env_peers_from_root,
            root_env_peers: resolve_env_peers_from_root,
            include_all_env_peers: true,
            force_env_peers_to_root: config.force_env_peers_to_root.unwrap_or(false),
            has_root_components,
            node_linker: config.node_linker().to_string(),
            root_components_dir,
        }
    }

    /// The options of `writeDependenciesToPackageJson`: `_getComponentsManifests` with
    /// `{ dedupe: true, includeAllEnvPeers: false }` only, so the root copies no peers,
    /// gets no env peers, and no `nodeLinker` turns on `referenceLocalPackages`.
    #[must_use]
    pub fn for_package_json(
        config: &DependencyResolverConfig,
        root_components_dir: PathBuf,
    ) -> Self {
        ManifestOptions {
            copy_peer_to_runtime_on_root: false,
            root_env_peers: false,
            include_all_env_peers: false,
            node_linker: String::new(),
            ..Self::new(config, true, root_components_dir)
        }
    }

    /// `copyPeerToRuntimeOnRoot` (default `true`) and `copyPeerToRuntimeOnComponents`
    /// (default `false`) of `InstallMain.install`'s options.
    #[must_use]
    pub fn with_copy_peer_to_runtime(mut self, options: &InstallOptions) -> Self {
        self.copy_peer_to_runtime_on_root = options.copy_peer_to_runtime_on_root.unwrap_or(true);
        self.copy_peer_to_runtime_on_components = options.copy_peer_to_runtime_on_components;
        self
    }

    /// `referenceLocalPackages`: root components with the isolated linker.
    fn reference_local_packages(&self) -> bool {
        self.has_root_components && self.node_linker == "isolated"
    }
}

/// The calculated manifests.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct ManifestOutcome {
    pub plan: InstallPlan,
    /// Manifests before `installComponents` applies the mutable linked-dependency options.
    pub pre_link_projects: Vec<crate::model::Project>,
    /// Env peer overrides (`overrides: true` in `env.jsonc`), already folded into `plan.overrides`.
    pub peer_overrides: DependencyMap,
    /// `logger.consoleWarning` lines (conflicting env peers).
    pub warnings: Vec<String>,
    /// `logger.console` lines (the peer conflict hint).
    pub messages: Vec<String>,
    /// With root components, a workspace component is still missing from some
    /// component's dependencies: another install round is needed.
    pub has_missing_local_components: bool,
    /// The `.bit_roots` directories the plan uses (to create, and to keep when cleaning).
    pub root_dirs: Vec<PathBuf>,
}

/// `filterOutCoreAspects`: core aspect packages and `@teambit/legacy` leave the root policy.
fn root_policy(input: &ManifestInput<'_>) -> Vec<PolicyEntry> {
    input.policies.workspace
        .iter()
        .filter(|entry| {
            entry.name != "@teambit/legacy"
                && !input.context.core_aspects
                    .iter()
                    .any(|aspect| aspect.package_name == entry.name)
        })
        .cloned()
        .collect()
}

fn deduped(
    input: &ManifestInput<'_>,
    policy: &[PolicyEntry],
    root: &RootPolicy<'_>,
) -> io::Result<dedupe::Deduped> {
    let components = component_deps::build(input, root);
    if input.options.has_root_components {
        let mut result = dedupe::dedupe(policy, &components, true)?;
        for field in Field::ALL {
            let kept = dedupe::exclude_workspace(result.root.get(field));
            result.root.set(field, kept);
        }
        result.components = components;
        return Ok(result);
    }
    if input.options.dedupe {
        return dedupe::dedupe(policy, &components, false);
    }
    Ok(dedupe::Deduped {
        root: dedupe::policy_manifest(policy),
        components,
        peer_conflicts: Vec::new(),
    })
}

fn projects(manifests: IndexMap<PathBuf, Manifest>, root: &Path) -> Vec<Project> {
    let (roots, others): (Vec<_>, Vec<_>) = manifests
        .into_iter()
        .partition(|(dir, _)| dir.as_path() == root);
    roots
        .into_iter()
        .chain(others)
        .map(|(dir, manifest)| Project { dir, manifest })
        .collect()
}

/// The deduped dependencies of the components and the root.
fn deduped_for(input: &ManifestInput<'_>, policy: &[PolicyEntry]) -> io::Result<dedupe::Deduped> {
    let dependencies = if input.options.has_root_components {
        dedupe::policy_manifest(policy).get(Field::Dependencies).clone()
    } else {
        DependencyMap::new()
    };
    deduped(input, policy, &RootPolicy { entries: policy, dependencies })
}

/// Component manifests and the root manifest, keyed by dir.
fn workspace_manifests(
    input: &ManifestInput<'_>,
    env_root: &env_root::EnvRoot,
) -> io::Result<IndexMap<PathBuf, Manifest>> {
    let deduped = deduped_for(input, &root_policy(input))?;
    let mut manifests = assemble::component_manifests(input, &deduped, env_root);
    manifests.insert(
        input.root.to_path_buf(),
        assemble::root_manifest(input, &deduped.root, env_root),
    );
    Ok(manifests)
}

/// Adds the `.bit_roots` projects; returns their dirs and whether a workspace
/// component is still missing from some component.
fn add_root_components(
    input: &ManifestInput<'_>,
    manifests: &mut IndexMap<PathBuf, Manifest>,
) -> (Vec<PathBuf>, bool) {
    if !input.options.has_root_components {
        return (Vec::new(), false);
    }
    let roots = root_components::root_manifests(input, manifests);
    let dirs = roots.keys().cloned().collect();
    manifests.extend(roots);
    (dirs, root_components::has_missing_local_components(input, manifests))
}

/// Calculate the projects of one engine call.
pub fn plan(input: &ManifestInput<'_>) -> io::Result<ManifestOutcome> {
    let env_root = if input.options.resolve_env_peers_from_root {
        env_root::merge(input)
    } else {
        env_root::EnvRoot::default()
    };
    let mut manifests = workspace_manifests(input, &env_root)?;
    let (root_dirs, has_missing_local_components) = add_root_components(input, &mut manifests);
    let forced_harmony_version = assemble::forced_harmony_version(input);
    let pre_link_projects = projects(manifests.clone(), input.root);
    assemble::merge_linked(&mut manifests, input, forced_harmony_version.as_deref());
    let external_dependencies = assemble::external_dependencies(input, &manifests);
    let config_overrides = input.config.overrides.clone().unwrap_or_default();
    let plan = InstallPlan {
        projects: projects(manifests, input.root),
        overrides: deps::spread(&[&env_root.overrides, &config_overrides]),
        forced_harmony_version,
        external_dependencies,
    };
    Ok(ManifestOutcome {
        plan,
        pre_link_projects,
        peer_overrides: env_root.overrides,
        warnings: env_root.warnings,
        messages: env_root.messages,
        has_missing_local_components,
        root_dirs,
    })
}

/// What `writeDependenciesToPackageJson` writes to the root `package.json`.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct PackageJsonDependencies {
    /// The root manifest's `{ ...devDependencies, ...dependencies }`.
    pub dependencies: DependencyMap,
    /// `logger.consoleWarning` lines (conflicting env peers).
    pub warnings: Vec<String>,
    /// `logger.console` lines (the peer conflict hint).
    pub messages: Vec<String>,
}

/// The root manifest of `getComponentManifests`, before `installComponents` merges the
/// linked dependencies into it, as `writeDependenciesToPackageJson` reads it.
pub fn package_json_dependencies(input: &ManifestInput<'_>) -> io::Result<PackageJsonDependencies> {
    let env_root = if input.options.resolve_env_peers_from_root {
        env_root::merge(input)
    } else {
        env_root::EnvRoot::default()
    };
    let deduped = deduped_for(input, &root_policy(input))?;
    let manifest = assemble::root_manifest(input, &deduped.root, &env_root);
    let mut dependencies = deps::manifest_field(&manifest, "devDependencies");
    dependencies.extend(deps::manifest_field(&manifest, "dependencies"));
    Ok(PackageJsonDependencies {
        dependencies,
        warnings: env_root.warnings,
        messages: env_root.messages,
    })
}

#[cfg(test)]
mod tests;
