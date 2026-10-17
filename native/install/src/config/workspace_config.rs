pub(super) use bit_workspace_config::config_string;

use super::DependencyResolverConfig;
use crate::jsonc;
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub const WORKSPACE_ASPECT: &str = "teambit.workspace/workspace";
pub const DEPENDENCY_RESOLVER_ASPECT: &str = "teambit.dependencies/dependency-resolver";
pub const VARIANTS_ASPECT: &str = "teambit.workspace/variants";
pub const GENERATOR_ASPECT: &str = "teambit.generator/generator";
pub const WORKSPACE_CONFIG_FILES_ASPECT: &str = "teambit.workspace/workspace-config-files";
pub const CONFIG_STORE_ASPECT: &str = "teambit.harmony/config-store";
pub const ENVS_ASPECT: &str = "teambit.envs/envs";

/// Top-level `workspace.jsonc` keys that are not aspects (`INTERNAL_CONFIG_PROPS`).
const INTERNAL_PROPS: [&str; 3] = ["$schema", "$schemaVersion", "require"];

/// `teambit.workspace/workspace` settings (`WorkspaceExtensionProps`).
#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    dylint_lib = "perfectionist",
    expect(
        perfectionist::too_many_struct_fields,
        reason = "The fields mirror the teambit.workspace/workspace section of workspace.jsonc."
    )
)]
pub struct WorkspaceSettings {
    pub name: Option<String>,
    pub icon: Option<String>,
    pub default_scope: Option<String>,
    pub default_directory: Option<String>,
    pub root_components_directory: Option<String>,
    pub resolve_aspects_from_node_modules: Option<bool>,
    pub resolve_envs_from_roots: Option<bool>,
    pub auto_load_aspects_deps: Option<bool>,
    pub external_package_manager: Option<bool>,
    /// Extra ignore patterns for component files (`.gitignore` syntax).
    pub ignored_files: Option<Vec<String>>,
    /// Track the files Bit normally generates (`package.json`, lockfiles) as source.
    pub track_all_files: Option<bool>,
    pub trusted_scopes: Option<Vec<String>>,
    pub bitmap_auto_sync: Option<bool>,
    #[serde(flatten)]
    pub rest: IndexMap<String, Value>,
}

/// `workspace.jsonc`, parsed.
#[derive(Debug, Default, Clone, PartialEq)]
pub struct WorkspaceConfig {
    pub path: PathBuf,
    /// Every top-level key except `$schema`, `$schemaVersion` and `require`, in
    /// file order: aspect id (possibly with `@version`) → config.
    pub aspects: IndexMap<String, Value>,
    pub workspace: WorkspaceSettings,
    pub dependency_resolver: DependencyResolverConfig,
    /// `teambit.workspace/variants`: pattern → aspects config, in file order.
    pub variants: Vec<(String, Map<String, Value>)>,
    /// `teambit.generator/generator` `envs`.
    pub generator_envs: Vec<String>,
    /// `teambit.workspace/workspace-config-files` `enableWorkspaceConfigWrite`.
    pub enable_workspace_config_write: bool,
    /// `teambit.harmony/config-store`: the workspace layer of `bit config`.
    pub config_store: IndexMap<String, String>,
}

/// `scope/name@version` → `scope/name`. Ids never start with `@`.
#[must_use]
pub fn aspect_id_without_version(id: &str) -> &str {
    match id.rsplit_once('@') {
        Some((without, _)) if !without.is_empty() => without,
        _ => id,
    }
}

impl WorkspaceConfig {
    pub fn load(root: &Path) -> io::Result<Self> {
        let path = root.join("workspace.jsonc");
        let text = fs::read_to_string(&path)?;
        let value = jsonc::parse(&text).map_err(|error| invalid_config(&path, &error))?;
        Self::from_value(path, value)
    }

    pub fn from_value(path: PathBuf, value: Value) -> io::Result<Self> {
        let Value::Object(raw) = value else {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{} must be an object", path.display()),
            ));
        };
        let aspects: IndexMap<String, Value> = raw
            .into_iter()
            .filter(|(key, _)| !INTERNAL_PROPS.contains(&key.as_str()))
            .collect();
        let mut config = Self { path, aspects, ..Self::default() };
        config.workspace = config.typed(WORKSPACE_ASPECT)?;
        config.dependency_resolver = config.typed(DEPENDENCY_RESOLVER_ASPECT)?;
        config.variants = config.variants();
        config.generator_envs = config.strings(GENERATOR_ASPECT, "envs");
        config.enable_workspace_config_write = config
            .aspect(WORKSPACE_CONFIG_FILES_ASPECT)
            .and_then(|files| files.get("enableWorkspaceConfigWrite"))
            .and_then(Value::as_bool)
            .unwrap_or(false);
        config.config_store = config.config_store();
        Ok(config)
    }

    /// The config of an aspect, matched without its version.
    #[must_use]
    pub fn aspect(&self, id: &str) -> Option<&Value> {
        let id = aspect_id_without_version(id);
        self.aspects
            .iter()
            .find(|(key, _)| aspect_id_without_version(key) == id)
            .map(|(_, value)| value)
    }

    fn typed<Config: Default + for<'de> Deserialize<'de>>(&self, id: &str) -> io::Result<Config> {
        match self.aspect(id) {
            Some(value @ Value::Object(_)) => serde_json::from_value(value.clone())
                .map_err(|error| invalid_config(&self.path, &error)),
            _ => Ok(Config::default()),
        }
    }

    fn variants(&self) -> Vec<(String, Map<String, Value>)> {
        let Some(Value::Object(patterns)) = self.aspect(VARIANTS_ASPECT) else { return Vec::new() };
        patterns
            .iter()
            .filter_map(|(pattern, config)| Some((pattern.clone(), config.as_object()?.clone())))
            .collect()
    }

    fn strings(&self, id: &str, field: &str) -> Vec<String> {
        self.aspect(id)
            .and_then(|config| config.get(field))
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_owned)
                    .collect()
            })
            .unwrap_or_default()
    }

    fn config_store(&self) -> IndexMap<String, String> {
        let Some(Value::Object(store)) = self.aspect(CONFIG_STORE_ASPECT) else {
            return IndexMap::new();
        };
        store
            .iter()
            .filter_map(|(key, value)| Some((key.clone(), config_string(value)?)))
            .collect()
    }

    /// `extensionsIds` without core aspects and `file:` ids: the user aspects
    /// configured at the workspace level.
    #[must_use]
    pub fn user_aspect_ids(&self, core_ids: &[String]) -> Vec<String> {
        self.aspects
            .keys()
            .filter(|key| !key.starts_with("file:"))
            .filter(|key| {
                !core_ids
                    .iter()
                    .any(|core| core == aspect_id_without_version(key))
            })
            .cloned()
            .collect()
    }

    /// `<rootComponentsDirectory or node_modules>/.bit_roots`, absolute.
    #[must_use]
    pub fn root_components_path(&self, root: &Path) -> PathBuf {
        let base = self.workspace.root_components_directory
            .as_deref()
            .map_or_else(|| root.join("node_modules"), |dir| root.join(dir));
        base.join(".bit_roots")
    }
}

fn invalid_config(path: &Path, error: &dyn std::fmt::Display) -> io::Error {
    io::Error::new(
        io::ErrorKind::InvalidData,
        format!("failed parsing {}: {error}", path.display()),
    )
}
