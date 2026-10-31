//! A component's aspects (`AspectsMerger.merge`): `.bitmap` config, the
//! config-merge file, `component.json`, the model's component-specific
//! aspects, workspace variants and the model's other aspects, first wins per
//! aspect. Then its env (`calculateEnvId`).

use crate::{config::aspect_id_without_version, model::ComponentId};
use serde_json::{Map, Value};

const ENVS_ASPECT: &str = "teambit.envs/envs";
const SPECIFIC_FIELD: &str = "__specific";
pub const DEFAULT_ENV: &str = "teambit.harmony/node";
/// `getCoreEnvsIds()`.
pub const CORE_ENVS: [&str; 10] = [
    "teambit.harmony/aspect",
    "teambit.react/react",
    "teambit.harmony/node",
    "teambit.react/react-native",
    "teambit.html/html",
    "teambit.mdx/mdx",
    "teambit.envs/env",
    "teambit.mdx/readme",
    "teambit.harmony/bit-custom-aspect",
    "teambit.harmony/empty-env",
];

/// One aspect of a component (`ExtensionDataEntry`).
#[derive(Debug, Clone, PartialEq)]
pub struct AspectEntry {
    /// `stringId`: the component id with version, or the core aspect name.
    pub id: String,
    pub core: bool,
    /// The config, or `"-"` for a removed aspect.
    pub config: Value,
    pub data: Value,
}

impl AspectEntry {
    /// The id `mergeConfigs` compares, ignoring versions.
    fn merge_key(&self) -> (bool, &str) {
        (self.core, aspect_id_without_version(&self.id))
    }

    fn is_removed(&self) -> bool {
        self.config.as_str().map(str::trim) == Some("-")
    }

    fn env_config(&self) -> Option<&str> {
        self.config
            .get("env")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|env| !env.is_empty())
    }
}

/// Where an aspect list comes from; the order of the aspect merger's input.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Origin {
    BitmapFile,
    ConfigMerge,
    ComponentJsonFile,
    ModelSpecific,
    WorkspaceVariants,
    ModelNonSpecific,
}

/// `ExtensionDataList.fromConfigObject`: `file:` ids are machine-specific and dropped.
#[must_use]
pub fn from_config_object(config: &Map<String, Value>, core_ids: &[String]) -> Vec<AspectEntry> {
    config
        .iter()
        .filter(|(id, _)| !id.starts_with("file:"))
        .map(|(id, config)| {
            let bare = aspect_id_without_version(id);
            AspectEntry {
                id: id.clone(),
                core: core_ids
                    .iter()
                    .any(|core| core == id || core == bare),
                config: config.clone(),
                data: Value::Object(Map::new()),
            }
        })
        .collect()
}

/// A Version's stored `extensions`.
#[must_use]
pub fn from_model(extensions: &[Value]) -> Vec<AspectEntry> {
    extensions
        .iter()
        .filter_map(|extension| {
            let (id, core) = match extension.get("extensionId") {
                Some(Value::String(id)) => (
                    id.strip_suffix("@latest")
                        .or_else(|| id.strip_suffix("@head"))
                        .unwrap_or(id)
                        .to_owned(),
                    false,
                ),
                Some(Value::Object(id)) => (serialized_id(id)?, false),
                _ => (
                    extension
                        .get("name")
                        .or_else(|| extension.get("legacyId"))?
                        .as_str()?
                        .to_owned(),
                    true,
                ),
            };
            let config = extension
                .get("config")
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new()));
            let data = extension
                .get("data")
                .cloned()
                .unwrap_or_else(|| Value::Object(Map::new()));
            Some(AspectEntry { id, core, config, data })
        })
        .collect()
}

/// A serialized `ComponentID` (`{ scope, name, version }`) as `toString()` prints it.
fn serialized_id(id: &Map<String, Value>) -> Option<String> {
    let raw_name = id.get("name")?.as_str()?;
    let (name, inline_ver) = raw_name
        .rsplit_once('@')
        .map_or((raw_name, None), |(bare, ver)| (bare, Some(ver).filter(|ver| !ver.is_empty())));
    let scoped = match id.get("scope").and_then(Value::as_str) {
        Some(scope) if !scope.is_empty() => format!("{scope}/{name}"),
        _ => name.to_owned(),
    };
    let version = id
        .get("version")
        .or_else(|| id.get("head"))
        .and_then(Value::as_str)
        .filter(|ver| !ver.is_empty())
        .or(inline_ver);
    Some(match version {
        Some(ver) if !matches!(ver, "latest" | "head") => format!("{scoped}@{ver}"),
        _ => scoped,
    })
}

/// Whether the model entry is component-specific (`__specific: true`).
#[must_use]
pub fn is_specific(entry: &AspectEntry) -> bool {
    entry.config.get(SPECIFIC_FIELD) == Some(&Value::Bool(true))
}

/// Resolves aspect ids to workspace components the way `resolveExtensionListIds` does.
pub struct Resolver<'a> {
    pub component: &'a ComponentId,
    pub workspace: &'a [ComponentId],
}

impl Resolver<'_> {
    fn resolve(&self, entry: &mut AspectEntry, prefer_workspace_version: bool) {
        if entry.core {
            return;
        }
        let without = aspect_id_without_version(&entry.id).to_owned();
        let Some(found) = self.workspace
            .iter()
            .find(|id| id.to_string_without_version() == without || id.name == without)
        else {
            return;
        };
        let given = entry.id
            .strip_prefix(&without)
            .and_then(|rest| rest.strip_prefix('@'));
        let version = if prefer_workspace_version {
            found.version.as_deref()
        } else {
            given.or(found.version.as_deref())
        };
        let base = found.to_string_without_version();
        entry.id = version.map_or_else(|| base.clone(), |version| format!("{base}@{version}"));
    }
}

/// The merge state across origins (`addExtensionsToMerge`).
pub struct Merger<'a> {
    resolver: Resolver<'a>,
    lists: Vec<Vec<AspectEntry>>,
    removed: Vec<String>,
    env_found: bool,
}

impl<'a> Merger<'a> {
    #[must_use]
    pub const fn new(resolver: Resolver<'a>) -> Self {
        Self { resolver, lists: Vec::new(), removed: Vec::new(), env_found: false }
    }

    pub fn add(&mut self, entries: Vec<AspectEntry>, origin: Origin) {
        if entries.is_empty() {
            return;
        }
        let self_id = self.resolver.component.to_string_without_version();
        let prefer = !matches!(origin, Origin::BitmapFile | Origin::ComponentJsonFile);
        let mut kept = Vec::new();
        for mut entry in entries {
            if entry.is_removed() {
                self.removed.push(entry.id.clone());
                continue;
            }
            if !entry.core && aspect_id_without_version(&entry.id) == self_id {
                continue;
            }
            self.resolver.resolve(&mut entry, prefer);
            kept.push(entry);
        }
        let kept = self.filter_envs(kept);
        self.lists.push(kept);
    }

    /// `filterEnvsFromExtensionsIfNeeded`: once an origin set the env, later
    /// origins cannot set another one.
    ///
    /// Model entries already carry the workspace version of a workspace env
    /// (see [`Resolver`]), which is what Bit does for them here.
    fn filter_envs(&mut self, entries: Vec<AspectEntry>) -> Vec<AspectEntry> {
        let envs_entry = entries
            .iter()
            .find(|entry| aspect_id_without_version(&entry.id) == ENVS_ASPECT);
        let env = envs_entry.and_then(|entry| {
            entry
                .env_config()
                .or_else(|| entry.data.get("id").and_then(Value::as_str))
                .map(str::to_owned)
        });
        let has_envs = envs_entry.is_some() || entries.iter().any(|entry| is_core_env(&entry.id));
        if self.env_found && has_envs {
            return drop_envs(entries, env.as_deref());
        }
        self.env_found |= env.is_some();
        entries
    }

    /// [`merge_lists`] of every origin, minus removed aspects.
    #[must_use]
    pub fn finish(self) -> Vec<AspectEntry> {
        let mut merged = merge_lists(self.lists);
        merged.retain(|entry| {
            let bare = aspect_id_without_version(&entry.id);
            !self.removed
                .iter()
                .any(|rem| rem == &entry.id || aspect_id_without_version(rem) == bare)
        });
        merged
    }
}

/// `ExtensionDataList.mergeConfigs`: the first entry of each aspect wins,
/// compared without versions.
#[must_use]
pub fn merge_lists(lists: Vec<Vec<AspectEntry>>) -> Vec<AspectEntry> {
    let mut merged: Vec<AspectEntry> = Vec::new();
    for entry in lists.into_iter().flatten() {
        if !merged
            .iter()
            .any(|existing| existing.merge_key() == entry.merge_key())
        {
            merged.push(entry);
        }
    }
    merged
}

/// Remove the env entries of a list whose env an earlier origin already set,
/// and the `env` of its `teambit.envs/envs` config.
fn drop_envs(mut entries: Vec<AspectEntry>, env: Option<&str>) -> Vec<AspectEntry> {
    entries.retain(|entry| {
        let is_env =
            env.is_some_and(|env| entry.id == env || aspect_id_without_version(&entry.id) == env);
        !is_env && !is_core_env(&entry.id)
    });
    for entry in &mut entries {
        if aspect_id_without_version(&entry.id) == ENVS_ASPECT
            && let Value::Object(config) = &mut entry.config
        {
            config.remove("env");
        }
    }
    entries
}

fn is_core_env(id: &str) -> bool {
    CORE_ENVS.contains(&aspect_id_without_version(id))
}

/// The merged aspects as `{ id: config }`, without Bit's internal `__specific` field.
#[must_use]
pub fn to_config(entries: &[AspectEntry]) -> Map<String, Value> {
    entries
        .iter()
        .map(|entry| {
            let mut config = entry.config.clone();
            if let Value::Object(object) = &mut config {
                object.remove(SPECIFIC_FIELD);
            }
            (entry.id.clone(), config)
        })
        .collect()
}

/// `calculateEnvId`: the env configured in `teambit.envs/envs` (with the
/// version of the matching aspect entry), else the first core env among the
/// aspects, else the default env.
#[must_use]
pub fn env_id(entries: &[AspectEntry]) -> String {
    let configured = entries
        .iter()
        .find(|entry| aspect_id_without_version(&entry.id) == ENVS_ASPECT)
        .and_then(AspectEntry::env_config);
    if let Some(env) = configured {
        if is_core_env(env) {
            return env.to_owned();
        }
        let without = aspect_id_without_version(env);
        if let Some(entry) = entries
            .iter()
            .find(|entry| entry.id == without || aspect_id_without_version(&entry.id) == without)
        {
            return entry.id.clone();
        }
    }
    if let Some(entry) = entries.iter().find(|entry| is_core_env(&entry.id)) {
        return entry.id.clone();
    }
    configured.map_or_else(|| DEFAULT_ENV.to_owned(), str::to_owned)
}
