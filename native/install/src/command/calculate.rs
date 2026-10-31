//! `_getComponentsManifestsAndRootPolicy`: env policies, the workspace policy with
//! the configured aspects and generator envs, the components' dependencies and
//! the manifests of one engine run.

pub(super) use initial::calculate_linked;

mod initial;
mod resolution;

use super::session::{Loaded, Session};
use crate::{
    dependencies::{DependencyOptions, DevPatternConfig, default_package_name, glob},
    import::{self, remotes::global_remotes},
    manifests::{
        self, ManifestContext, ManifestInput, ManifestOptions, ManifestOutcome,
        PackageJsonDependencies, Policies, RemoteFilter,
    },
    model::{
        ComponentDependencies, ComponentId, DependencyMap, EnvPolicy, Lifecycle, PolicyEntry,
        WorkspaceComponent,
    },
    policy::{self, is_core_env, split_version},
    workspace::{ScopeObjects, external_env_packages},
};
use indexmap::IndexMap;
use resolution::{Resolved, resolve, resolve_initialized};
use serde_json::Value;
use std::io;

/// `getWorkspaceManifest`'s status line around the manifest creation.
const DEDUPING: &str = "deduping dependencies for installation";

/// One calculation of what to install.
pub struct Calculated {
    pub components: Vec<WorkspaceComponent>,
    pub engine_components: Vec<WorkspaceComponent>,
    pub env_policies: IndexMap<String, EnvPolicy>,
    pub dependencies: IndexMap<String, ComponentDependencies>,
    pub outcome: ManifestOutcome,
    pub subscriber_policy: Vec<PolicyEntry>,
    pub subscriber_links: DependencyMap,
}

impl Calculated {
    /// `getOldNonLoadedEnvs`: envs whose policy only `getDependencies()` knows and
    /// that could not be loaded.
    pub fn non_loaded_envs(&self) -> Vec<String> {
        self.env_policies
            .iter()
            .filter(|(_, policy)| policy.without_manifest && policy.failed_to_load)
            .map(|(id, _)| id.clone())
            .collect()
    }
}

/// Calculate the policies, dependencies and manifests of the workspace.
pub async fn calculate(
    session: &Session<'_>,
    loaded: &Loaded,
    linked_root_deps: &DependencyMap,
) -> io::Result<Calculated> {
    session.host.configured_aspect_classes().await?;
    let components =
        super::session::installation_components::load(session, loaded, "manifests").await?;
    let Resolved {
        env_policies,
        workspace_policy,
        dependencies,
    } = resolve_initialized(session, loaded, &components, true).await?;
    let (linked_root_deps, env_packages) =
        &with_env_links(session, loaded, linked_root_deps, &components, &dependencies)?;
    let apps = apps(session, loaded, &components).await?;
    let root_policy = root_policy(session, loaded, workspace_policy)?;
    // `getWorkspaceManifest` announces the manifest creation (`createFromComponents`).
    session.output.status(DEDUPING);
    let outcome = plan(
        session,
        loaded,
        &Inputs {
            components: &components,
            dependencies: &dependencies,
            env_policies: &env_policies,
            root_policy: &root_policy,
            linked_root_deps,
            apps: &apps,
            env_packages,
        },
    )?;
    session.output.success_status();
    root_manifest_loading(session, loaded).await?;
    Ok(Calculated {
        engine_components: components.clone(),
        components,
        env_policies,
        dependencies,
        outcome,
        subscriber_policy: root_policy,
        subscriber_links: linked_root_deps.clone(),
    })
}

async fn root_manifest_loading(session: &Session<'_>, loaded: &Loaded) -> io::Result<()> {
    // Node loads env and app root manifests only when root components are enabled.
    if loaded.config.dependency_resolver.has_root_components() {
        super::session::installation_components::load(session, loaded, "root-envs").await?;
        super::session::installation_components::load(session, loaded, "root-apps").await?;
    }
    Ok(())
}

/// `writeDependenciesToPackageJson`: the root manifest `_getComponentsManifests`
/// calculates with `{ dedupe: true, includeAllEnvPeers: false }`, without the
/// dependency filter and the linked root dependencies of an installation.
pub async fn package_json_dependencies(
    session: &Session<'_>,
    loaded: &Loaded,
) -> io::Result<PackageJsonDependencies> {
    // `getComponentsDirectory` in `_getComponentsManifests`.
    session.loading(loaded);
    let components = loaded.components();
    let Resolved {
        env_policies,
        workspace_policy,
        dependencies,
    } = resolve(session, loaded, &components).await?;
    let root_policy = root_policy(session, loaded, workspace_policy)?;
    session.output.status(DEDUPING);
    let config = &loaded.config.dependency_resolver;
    let options = ManifestOptions::for_package_json(
        config,
        loaded.config.root_components_path(&session.root),
    );
    let env_packages =
        external_env_packages(&components, &ScopeObjects::new(&loaded.workspace.scope_path))?;
    let result = manifests::package_json_dependencies(&ManifestInput {
        root: &session.root,
        components: &components,
        dependencies: &dependencies,
        policies: Policies { workspace: &root_policy, envs: &env_policies },
        config,
        options: &options,
        context: ManifestContext {
            linked_root_deps: &DependencyMap::default(),
            remote_filter: None,
            core_aspects: &session.info.core_aspects,
            apps: &[],
            env_packages: &env_packages,
        },
    })?;
    session.output.success_status();
    Ok(result)
}

/// `linkDepsResolvedFromEnv` (off with root components), and the external env packages
/// the links resolve from, which the manifests reuse.
fn with_env_links(
    session: &Session<'_>,
    loaded: &Loaded,
    linked_root_deps: &DependencyMap,
    components: &[WorkspaceComponent],
    dependencies: &IndexMap<String, ComponentDependencies>,
) -> io::Result<(DependencyMap, IndexMap<String, String>)> {
    let env_packages =
        external_env_packages(components, &ScopeObjects::new(&loaded.workspace.scope_path))?;
    let mut links = linked_root_deps.clone();
    if loaded.config.dependency_resolver.has_root_components() {
        return Ok((links, env_packages));
    }
    let env_links = crate::links::resolved_from_env_links(
        &session.root,
        session.info,
        components,
        dependencies,
        &env_packages,
    );
    for message in &env_links.messages {
        session.output.console(message);
    }
    links.extend(env_links.links);
    Ok((links, env_packages))
}

struct Inputs<'a> {
    components: &'a [WorkspaceComponent],
    dependencies: &'a IndexMap<String, ComponentDependencies>,
    env_policies: &'a IndexMap<String, EnvPolicy>,
    root_policy: &'a [PolicyEntry],
    linked_root_deps: &'a DependencyMap,
    apps: &'a [String],
    env_packages: &'a IndexMap<String, String>,
}

fn plan(
    session: &Session<'_>,
    loaded: &Loaded,
    inputs: &Inputs<'_>,
) -> io::Result<ManifestOutcome> {
    let config = &loaded.config.dependency_resolver;
    let options = ManifestOptions::new(
        config,
        !session.options.skip_dedupe,
        loaded.config.root_components_path(&session.root),
    )
    .with_copy_peer_to_runtime(session.options);
    let remote_filter = remote_filter(session, loaded)?;
    manifests::plan(&ManifestInput {
        root: &session.root,
        components: inputs.components,
        dependencies: inputs.dependencies,
        policies: Policies { workspace: inputs.root_policy, envs: inputs.env_policies },
        config,
        options: &options,
        context: ManifestContext {
            linked_root_deps: inputs.linked_root_deps,
            remote_filter: Some(&remote_filter),
            core_aspects: &session.info.core_aspects,
            apps: inputs.apps,
            env_packages: inputs.env_packages,
        },
    })
}

/// `getWorkspacePolicy`: `workspace.jsonc`, the root `package.json`, the merge-config file.
fn workspace_policy(loaded: &Loaded) -> io::Result<Vec<PolicyEntry>> {
    let merge_config = loaded.workspace.merge_config.workspace_policy()?.map(Value::Object);
    Ok(policy::workspace_policy(
        &loaded.config.dependency_resolver,
        loaded.workspace.root_package_json.as_ref(),
        merge_config.as_ref(),
    ))
}

/// `addConfiguredAspectsToWorkspacePolicy` and `addConfiguredGeneratorEnvsToWorkspacePolicy`:
/// aspects and envs configured in `workspace.jsonc` but not in the workspace are installed
/// at the root (`skipIfExisting`), under the package name their scope objects record
/// (`getPackageName`), or the default name when the scope does not hold them.
fn root_policy(
    session: &Session<'_>,
    loaded: &Loaded,
    mut policy: Vec<PolicyEntry>,
) -> io::Result<Vec<PolicyEntry>> {
    let objects = ScopeObjects::new(&loaded.workspace.scope_path);
    let aspects = loaded.config.user_aspect_ids(&session.core_ids());
    let envs = loaded.config.generator_envs
        .iter()
        .filter(|env| !is_core_env(env))
        .cloned();
    for id in aspects.into_iter().chain(envs) {
        let (name, version) = split_version(&id);
        let component_id = parse_id(name);
        if component_id.name.is_empty() || in_workspace(loaded, &component_id) {
            continue;
        }
        let package = stored_package_name(&objects, &component_id, version)?
            .unwrap_or_else(|| default_package_name(&component_id));
        if policy
            .iter()
            .any(|entry| entry.name == package)
        {
            continue;
        }
        policy.push(PolicyEntry {
            name: package,
            version: version
                .map(str::trim)
                .filter(|ver| !ver.is_empty())
                .unwrap_or("*")
                .to_string(),
            lifecycle: Lifecycle::Runtime,
            force: false,
            optional: false,
            hidden: false,
            preserve: None,
            workspace_singleton: false,
            r#override: false,
            source: None,
            resolve_from_env: false,
        });
    }
    Ok(policy)
}

/// The package name the scope records for `id` at `version` (its head without one).
fn stored_package_name(
    objects: &ScopeObjects,
    id: &ComponentId,
    version: Option<&str>,
) -> io::Result<Option<String>> {
    let version = version
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .map(str::to_owned);
    Ok(objects
        .component_or_head(&ComponentId { version, ..id.clone() })?
        .map(|model| model.package_name(id)))
}

fn in_workspace(loaded: &Loaded, id: &ComponentId) -> bool {
    let wanted = id.to_string_without_version();
    loaded.workspace.components
        .iter()
        .any(|component| component.id.to_string_without_version() == wanted)
}

/// `scope/name` (the scope may contain dots, the name slashes).
pub fn parse_id(id: &str) -> ComponentId {
    let id = id.trim();
    let (scope, name) = id
        .split_once('/')
        .map_or(("", id), |(scope, name)| (scope.trim(), name.trim()));
    ComponentId {
        scope: (!scope.is_empty()).then(|| scope.to_string()),
        default_scope: None,
        name: name.to_string(),
        version: None,
    }
}

fn dependency_options(
    session: &Session<'_>,
    loaded: &Loaded,
    components: &[WorkspaceComponent],
) -> io::Result<DependencyOptions> {
    let mut merge_config = IndexMap::new();
    for component in components {
        let id = component.id.to_string_without_version();
        if let Some(entry) = loaded.workspace.merge_config.component(&id)? {
            merge_config.insert(id, Value::Object(entry.auto_deps));
        }
    }
    Ok(DependencyOptions {
        core_aspects: session.info.core_aspects.clone(),
        merge_config,
        update_dependents: update_dependents(loaded)?,
        use_cache: true,
        cache_initialized: session.options.dependency_cache_initialized,
        dev_patterns: DevPatternConfig::from_aspects(&|id| loaded.config.aspect(id).cloned()),
        policy_slots: Vec::new(),
        workspace_aspects: workspace_aspects(session, loaded),
    })
}

/// `getNotLoadedConfiguredExtensions` of the CLI start: the `workspace.jsonc` aspects
/// that are not core, whose providers run in TypeScript before any component loads.
pub(super) fn workspace_aspects(session: &Session<'_>, loaded: &Loaded) -> Vec<String> {
    let core_aspects = &session.info.core_aspects;
    loaded.config
        .user_aspect_ids(&session.core_ids())
        .into_iter()
        .filter(|id| !policy::slots::is_core(split_version(id).0, core_aspects))
        .collect()
}

/// `getIdFromUpdateDependentsOnLane`: the current lane's hidden dependents, with
/// their lane versions.
fn update_dependents(loaded: &Loaded) -> io::Result<Vec<ComponentId>> {
    let Some(lane) = &loaded.workspace.lane else { return Ok(Vec::new()) };
    let lane_id = import::LaneId {
        scope: lane.scope.clone(),
        name: lane.name.clone(),
        exported: lane.exported,
    };
    let repo = import::Repo::new(&loaded.workspace.scope_path);
    Ok(import::local_update_dependents(&repo, &lane_id)?
        .into_iter()
        .map(|id| ComponentId {
            scope: Some(id.scope),
            default_scope: None,
            name: id.name,
            version: id.version,
        })
        .collect())
}

/// App components (ids without version): only root components install apps separately.
async fn apps(
    session: &Session<'_>,
    loaded: &Loaded,
    components: &[WorkspaceComponent],
) -> io::Result<Vec<String>> {
    if !loaded.config.dependency_resolver.has_root_components() {
        return Ok(Vec::new());
    }
    let patterns = session.host.app_types().await?;
    Ok(components
        .iter()
        .filter(|component| {
            component.files.iter().any(|file| glob::match_patterns(file, &patterns))
        })
        .map(|component| component.id.to_string_without_version())
        .collect())
}

/// `generateFilterFnForDepsFromLocalRemote`: remotes from `scope.json` and the global
/// remotes are not on the hub, and registry scopes still serve packages.
fn remote_filter(session: &Session<'_>, loaded: &Loaded) -> io::Result<RemoteFilter> {
    let scope = crate::config::ScopeJson::load(&loaded.workspace.scope_path)?;
    let global = global_remotes(&session.info.global_config_dir)?;
    Ok(RemoteFilter {
        local_remotes: scope.remotes
            .keys()
            .chain(global.keys())
            .map(|remote| remote.trim().to_string())
            .filter(|remote| !remote.is_empty())
            .collect(),
        registry_scopes: loaded.engine.registry.registries.scopes
            .keys()
            .map(|scope| {
                scope
                    .trim()
                    .trim_start_matches('@')
                    .trim()
                    .to_string()
            })
            .filter(|scope| !scope.is_empty())
            .collect(),
    })
}
