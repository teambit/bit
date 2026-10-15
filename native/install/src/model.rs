//! Types shared between the install stages. Each stage owns its own internals;
//! these are the values passed between them (see `docs/rust/native-install.md`).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::path::PathBuf;

/// A `package.json`-shaped object, keyed in insertion order.
pub type Manifest = Map<String, Value>;

/// `{ name: range }` of one dependency field.
pub type DependencyMap = IndexMap<String, String>;

/// A component id as Bit prints it: `scope/name@version`. `scope` is `None` for
/// a new component that has only a `defaultScope`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
pub struct ComponentId {
    pub scope: Option<String>,
    pub default_scope: Option<String>,
    pub name: String,
    pub version: Option<String>,
}

impl ComponentId {
    /// The scope the component is or will be exported to.
    #[must_use]
    pub fn effective_scope(&self) -> Option<&str> {
        self.scope.as_deref().or(self.default_scope.as_deref())
    }

    /// `scope/name`, without the version.
    #[must_use]
    pub fn to_string_without_version(&self) -> String {
        match self.effective_scope() {
            Some(scope) => format!("{scope}/{}", self.name),
            None => self.name.clone(),
        }
    }
}

/// The dependency lifecycle of a policy entry or a detected dependency.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Lifecycle {
    Runtime,
    Dev,
    Peer,
}

impl Lifecycle {
    /// The `package.json` field this lifecycle maps to.
    #[must_use]
    pub const fn manifest_key(self) -> &'static str {
        match self {
            Self::Runtime => "dependencies",
            Self::Dev => "devDependencies",
            Self::Peer => "peerDependencies",
        }
    }
}

/// One entry of a workspace, variant or env dependency policy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The fields mirror the TypeScript policy entry shape."
    )
)]
pub struct PolicyEntry {
    pub name: String,
    pub version: String,
    pub lifecycle: Lifecycle,
    /// Added to the component even when not detected (variant policies).
    #[serde(default)]
    pub force: bool,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub hidden: bool,
    /// Workspace policy `{ version, preserve }`.
    #[serde(default)]
    pub preserve: Option<bool>,
    /// Env peers (`env.jsonc` `peers[]`): installed once at the root.
    #[serde(default)]
    pub workspace_singleton: bool,
    /// Env peers with `override: true` become pnpm overrides.
    #[serde(default)]
    pub r#override: bool,
    /// `env-own`, `config`, `slots`, `env`, `workspace`, ...
    #[serde(default)]
    pub source: Option<String>,
    /// `{ version, resolveFromEnv: true }`: the dependency is linked from the
    /// component's env (`getResolvedFromEnv`).
    #[serde(default)]
    pub resolve_from_env: bool,
}

/// One package dependency of a component after overrides and versions apply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PackageDependency {
    pub name: String,
    pub version: String,
    pub lifecycle: Lifecycle,
    #[serde(default)]
    pub optional: bool,
}

/// One component dependency of a component after overrides and versions apply.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDependency {
    pub id: ComponentId,
    pub package_name: String,
    pub lifecycle: Lifecycle,
    /// Aspects configured on the component (`isExtension` in TypeScript).
    #[serde(default)]
    pub is_extension: bool,
    #[serde(default)]
    pub optional: bool,
    #[serde(default)]
    pub hidden: bool,
}

/// The dependency data of one workspace component, as the TypeScript
/// `dependency-resolver` aspect data stores it after component load.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentDependencies {
    pub packages: Vec<PackageDependency>,
    pub components: Vec<ComponentDependency>,
    /// Merged component policy (env, env-for-itself, slots, config).
    pub policy: Vec<PolicyEntry>,
    /// `MissingPackagesDependenciesOnFs` issue data.
    pub missing_packages: MissingPackages,
}

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissingPackages {
    pub runtime: Vec<String>,
    pub dev: Vec<String>,
}

/// A component tracked in `.bitmap`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The fields mirror what the TypeScript install reads from a loaded component."
    )
)]
pub struct WorkspaceComponent {
    pub id: ComponentId,
    /// Workspace-relative root dir as written in `.bitmap` (`/`-separated).
    pub root_dir: String,
    /// Absolute component directory.
    pub dir: PathBuf,
    /// `.bitmap` files, relative to `root_dir`.
    pub files: Vec<String>,
    pub main_file: String,
    pub package_name: String,
    /// Env id with version when the env is versioned (`teambit.harmony/node`
    /// for the default env).
    pub env_id: String,
    /// The component itself is an env (its env is `teambit.envs/env` or it has `env.jsonc`).
    pub is_env: bool,
    /// The component ships its own `package.json`.
    pub has_package_json: bool,
    /// Merged aspect configuration: `.bitmap` config, then `component.json`,
    /// then matching variants, then the merge-config file.
    pub config: Map<String, Value>,
}

/// A project handed to the engine: the workspace root, a component dir, or a
/// root-components (`.bit_roots`) dir.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Project {
    pub dir: PathBuf,
    pub manifest: Manifest,
}

/// Everything the engine needs to install the workspace once.
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPlan {
    /// The workspace root first, then components, then `.bit_roots` projects.
    pub projects: Vec<Project>,
    /// pnpm overrides: env peer overrides first, `workspace.jsonc` overrides win.
    pub overrides: DependencyMap,
    /// `@teambit/harmony` version forced by the workspace policy.
    pub forced_harmony_version: Option<String>,
    /// Non-root manifest names (`externalDependencies` with root components).
    pub external_dependencies: Vec<String>,
}

/// The dependency policy an env contributes (`env.jsonc`, or `getDependencies()`
/// through the host for envs without one).
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvPolicy {
    /// Applied to every component using the env (peers use `supportedRange`).
    pub component: Vec<PolicyEntry>,
    /// The env's own peers (`env.jsonc` `peers[]` with `version`, `force: true`,
    /// `source: "env-own"`): installed at the root and for the env component itself.
    pub self_policy: Vec<PolicyEntry>,
    /// The policy came from `getDependencies()` because the env has no `env.jsonc`
    /// (`envsWithoutManifest` in TypeScript).
    pub without_manifest: bool,
    /// The host could not load the env to ask for its policy
    /// (`getFailedToLoadEnvs` in TypeScript).
    #[serde(default)]
    pub failed_to_load: bool,
    /// The env was not registered before the package manager, so this is the default
    /// env's policy, which its components get (`calculateEnv`); the env's own root has
    /// no policy (`getEnvPolicyFromEnvId` finds none).
    #[serde(default)]
    pub default_env: bool,
}

/// Bit's global configuration (`bit config`), keyed by the config key
/// (`user.token`, `registry`, `proxy`, ...).
pub type GlobalConfig = IndexMap<String, Value>;
