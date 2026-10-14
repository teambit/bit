//! `_getComponentsManifestsAndRootPolicy`: env policies, the workspace policy with
//! the configured aspects and generator envs, the components' dependencies and
//! the manifests of one engine run.

use super::session::{Loaded, Session};
use crate::{
    dependencies::{self, DependencyOptions, DevPatternConfig, default_package_name, glob},
    import::{self, remotes::global_remotes},
    manifests::{
        self, ManifestContext, ManifestInput, ManifestOptions, ManifestOutcome, Policies,
        RemoteFilter,
    },
    model::{
        ComponentDependencies, ComponentId, DependencyMap, EnvPolicy, Lifecycle, PolicyEntry,
        WorkspaceComponent,
    },
    policy::{self, is_core_env, split_version},
    workspace::ScopeObjects,
};
use indexmap::IndexMap;
use serde_json::Value;
use std::io;

/// `getWorkspaceManifest`'s status line around the manifest creation.
const DEDUPING: &str = "deduping dependencies for installation";

/// One calculation of what to install.
pub struct Calculated {
    pub components: Vec<WorkspaceComponent>,
    pub env_policies: IndexMap<String, EnvPolicy>,
    pub dependencies: IndexMap<String, ComponentDependencies>,
    pub outcome: ManifestOutcome,
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
    // The TypeScript command loads the components twice before the manifests:
    // `linkCodemods` right after the root links, then `getComponentsDirectory`
    // in `_getComponentsManifests`. The native linker runs after this
    // calculation and loads nothing, so both lines belong here.
    session.loading(loaded);
    session.loading(loaded);
    let components = loaded.components();
    let env_policies = policy::load_env_policies(&session.root, &components, session.host).await?;
    let workspace_policy = workspace_policy(loaded)?;
    let dependencies = dependencies::compute(
        &session.root,
        &components,
        &workspace_policy,
        &env_policies,
        loaded.workspace.root_package_json.as_ref(),
        &dependency_options(session, loaded, &components)?,
        session.host,
    )
    .await?;
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
        },
    )?;
    session.output.success(DEDUPING, None);
    // The component loads the TypeScript command performs while it finishes
    // the manifests of the engine run.
    session.loading(loaded);
    session.loading(loaded);
    Ok(Calculated { components, env_policies, dependencies, outcome })
}

struct Inputs<'a> {
    components: &'a [WorkspaceComponent],
    dependencies: &'a IndexMap<String, ComponentDependencies>,
    env_policies: &'a IndexMap<String, EnvPolicy>,
    root_policy: &'a [PolicyEntry],
    linked_root_deps: &'a DependencyMap,
    apps: &'a [String],
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
    );
    let remote_filter = remote_filter(session, loaded)?;
    let env_packages = env_packages(inputs.components);
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
            env_packages: &env_packages,
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
        if in_workspace(loaded, &component_id) {
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
            version: version.unwrap_or("*").to_string(),
            lifecycle: Lifecycle::Runtime,
            force: false,
            optional: false,
            hidden: false,
            preserve: None,
            workspace_singleton: false,
            r#override: false,
            source: None,
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
    let versioned = ComponentId { version: version.map(str::to_owned), ..id.clone() };
    Ok(objects
        .component_or_head(&versioned)?
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
    let (scope, name) = id.split_once('/').unwrap_or(("", id));
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
        dev_patterns: DevPatternConfig::from_aspects(&|id| loaded.config.aspect(id).cloned()),
    })
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

/// Package names of envs that are neither core nor workspace components.
fn env_packages(components: &[WorkspaceComponent]) -> IndexMap<String, String> {
    let mut packages = IndexMap::new();
    for component in components {
        let env = split_version(&component.env_id).0;
        let local = components
            .iter()
            .any(|candidate| candidate.id.to_string_without_version() == env);
        if !is_core_env(env) && !local {
            packages.insert(env.to_string(), default_package_name(&parse_id(env)));
        }
    }
    packages
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
            .cloned()
            .collect(),
        registry_scopes: loaded.engine.registry.registries.scopes
            .keys()
            .map(|scope| scope.trim_start_matches('@').to_string())
            .collect(),
    })
}
