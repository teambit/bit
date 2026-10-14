//! Workspace components from `.bitmap`, `component.json` and variants.
//!
//! [`Workspace::load`] reads every `.bitmap` entry and computes what Bit's
//! component loader would for install: the files under the root dir (with
//! Bit's ignore rules), the merged aspect configuration (`.bitmap`, the
//! config-merge file, `component.json`, the scope model and variants), the env
//! and the package name. Nothing is filtered out: [`BitmapEntry`] says whether
//! an entry is removed or unavailable on the current lane.

pub use aspects::{AspectEntry, CORE_ENVS, DEFAULT_ENV};
pub use bitmap::{BITMAP, Bitmap, BitmapEntry, LaneFlags, LaneInfo, WORKSPACE_ROOT_DIR};
pub use env_packages::external_env_packages;
pub use env_type::aspect_env_ids;
pub use files::{
    ALWAYS_IGNORE_LIST, BIT_GENERATED_IGNORE_LIST, FileRules, IGNORE_ROOT_ONLY_LIST,
    rebase_ignore_pattern, user_ignore_list,
};
pub use ignore::Ignore;
pub use package_name::{binding_prefix_by_default_scope, component_package_name};
pub use scope_model::{ModelData, ScopeObjects, sha1_hex};
pub use variants::{VariantConfig, by_root_dir_and_name};

mod aspects;
mod bitmap;
mod env_packages;
mod env_type;
mod files;
mod first_env;
mod glob;
mod ignore;
mod package_name;
mod scope_model;
mod variants;

use crate::{
    config::{MergeConfig, WorkspaceConfig, aspect_id_without_version, scope_path},
    jsonc,
    model::{ComponentId, Manifest, WorkspaceComponent},
};
use aspects::{Merger, Origin, Resolver};
use serde_json::{Map, Value};
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// The env of env components.
pub(super) const ENV_OF_ENVS: &str = "teambit.envs/env";

#[derive(Debug, Default, Clone, PartialEq)]
pub struct Workspace {
    pub root: PathBuf,
    /// The local scope (`.bit` or `.git/bit`).
    pub scope_path: PathBuf,
    pub lane: Option<LaneInfo>,
    /// `.bitmap` entries, parallel to `components`.
    pub entries: Vec<BitmapEntry>,
    pub components: Vec<WorkspaceComponent>,
    /// The workspace root `package.json`.
    pub root_package_json: Option<Manifest>,
    pub merge_config: MergeConfig,
}

/// `component.json` (`ComponentConfigFile`).
struct ComponentJson {
    extensions: Map<String, Value>,
    propagate: bool,
}

fn component_json(dir: &Path) -> io::Result<Option<ComponentJson>> {
    let path = dir.join("component.json");
    let text = match fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(error),
    };
    let value = jsonc::parse(&text)?;
    Ok(Some(ComponentJson {
        extensions: value
            .get("extensions")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default(),
        propagate: value.get("propagate").is_some_and(crate::config::truthy),
    }))
}

fn json_file(path: &Path) -> io::Result<Option<Manifest>> {
    match fs::read_to_string(path) {
        Ok(text) => match serde_json::from_str(&text) {
            Ok(Value::Object(manifest)) => Ok(Some(manifest)),
            Ok(_) => Ok(None),
            Err(error) => Err(io::Error::new(
                io::ErrorKind::InvalidData,
                format!("{}: {error}", path.display()),
            )),
        },
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
}

/// Root dirs of the components that own their directory now, other than the
/// workspace root: what the workspace-root component's scan leaves out.
fn owning_dirs(entries: &[BitmapEntry]) -> Vec<String> {
    entries
        .iter()
        .filter(|entry| {
            entry.owns_its_dir() && !matches!(entry.root_dir.as_str(), WORKSPACE_ROOT_DIR | "")
        })
        .map(|entry| entry.root_dir.trim_end_matches('/').to_owned())
        .collect()
}

/// Shared inputs of every component's load.
struct Loader<'a> {
    root: &'a Path,
    config: &'a WorkspaceConfig,
    core_ids: &'a [String],
    rules: FileRules,
    objects: ScopeObjects,
    merge_config: &'a MergeConfig,
    ids: Vec<ComponentId>,
    owning_dirs: Vec<String>,
}

impl Workspace {
    /// Load every `.bitmap` entry. `core_aspect_ids` are Bit's core aspects
    /// (configured without a scope or version).
    pub fn load(
        root: &Path,
        config: &WorkspaceConfig,
        core_aspect_ids: &[String],
    ) -> io::Result<Self> {
        let bitmap = Bitmap::load(root, config.workspace.default_scope.as_deref())?;
        let merge_config = MergeConfig::load(root)?;
        let scope_path = scope_path(root);
        let ignored = config.workspace.ignored_files.clone().unwrap_or_default();
        let mut loader = Loader {
            root,
            config,
            core_ids: core_aspect_ids,
            rules: FileRules::load(
                root,
                &ignored,
                config.workspace.track_all_files.unwrap_or(false),
            )?,
            objects: ScopeObjects::new(&scope_path),
            merge_config: &merge_config,
            ids: bitmap.entries
                .iter()
                .map(|entry| entry.id.clone())
                .collect(),
            owning_dirs: owning_dirs(&bitmap.entries),
        };
        let mut components = bitmap.entries
            .iter()
            .map(|entry| loader.component(entry))
            .collect::<io::Result<Vec<_>>>()?;
        first_env::resolve(&mut components, &loader.objects, core_aspect_ids)?;
        Ok(Self {
            root: root.to_owned(),
            scope_path,
            lane: bitmap.lane,
            entries: bitmap.entries,
            components,
            root_package_json: json_file(&root.join("package.json"))?,
            merge_config,
        })
    }

    /// The component that owns the workspace root (`rootDir: "."`), when it owns it now.
    #[must_use]
    pub fn root_component(&self) -> Option<&WorkspaceComponent> {
        self.entries
            .iter()
            .zip(&self.components)
            .find(|(entry, _)| entry.root_dir == WORKSPACE_ROOT_DIR && entry.owns_its_dir())
            .map(|(_, component)| component)
    }

    /// Components on the current lane that are not removed (`listIds`).
    pub fn active(&self) -> impl Iterator<Item = (&BitmapEntry, &WorkspaceComponent)> {
        self.entries
            .iter()
            .zip(&self.components)
            .filter(|(entry, _)| entry.owns_its_dir())
    }
}

impl Loader<'_> {
    fn component(&mut self, entry: &BitmapEntry) -> io::Result<WorkspaceComponent> {
        let dir = if entry.root_dir == WORKSPACE_ROOT_DIR {
            self.root.to_owned()
        } else {
            self.root.join(&entry.root_dir)
        };
        let files = self.files(entry)?;
        let model = self.objects.component(&entry.id)?;
        let aspects = self.aspects(entry, &dir, model.as_ref())?;
        let env_id = aspects::env_id(&aspects);
        let config = aspects::to_config(&aspects);
        let binding_prefix =
            model.as_ref().and_then(|model| model.binding_prefix.as_deref());
        Ok(WorkspaceComponent {
            package_name: component_package_name(&entry.id, binding_prefix, &config),
            is_env: aspect_id_without_version(&env_id) == ENV_OF_ENVS
                || files
                    .iter()
                    .any(|file| file == "env.jsonc"),
            has_package_json: files
                .iter()
                .any(|file| file == "package.json"),
            id: entry.id.clone(),
            root_dir: entry.root_dir.clone(),
            dir,
            files,
            main_file: entry.main_file.clone(),
            env_id,
            config,
        })
    }

    fn files(&mut self, entry: &BitmapEntry) -> io::Result<Vec<String>> {
        if entry.root_dir.is_empty() {
            return Ok(Vec::new());
        }
        let excluded: &[String] =
            if entry.root_dir == WORKSPACE_ROOT_DIR { &self.owning_dirs } else { &[] };
        self.rules.component_files(&entry.root_dir, excluded)
    }

    fn aspects(
        &self,
        entry: &BitmapEntry,
        dir: &Path,
        model: Option<&ModelData>,
    ) -> io::Result<Vec<AspectEntry>> {
        let mut merger = Merger::new(Resolver { component: &entry.id, workspace: &self.ids });
        if let Some(config) = &entry.config {
            merger.add(aspects::from_config_object(config, self.core_ids), Origin::BitmapFile);
        }
        if let Some(merge) = self.merge_config.component(&entry.id.to_string_without_version())? {
            merger.add(
                aspects::from_config_object(&merge.config, self.core_ids),
                Origin::ConfigMerge,
            );
        }
        let component_json = component_json(dir)?;
        if let Some(file) = &component_json {
            merger.add(
                aspects::from_config_object(&file.extensions, self.core_ids),
                Origin::ComponentJsonFile,
            );
        }
        let (specific, non_specific): (Vec<_>, Vec<_>) = model
            .map(|model| aspects::from_model(&model.extensions))
            .unwrap_or_default()
            .into_iter()
            .partition(aspects::is_specific);
        merger.add(specific, Origin::ModelSpecific);
        let mut propagate = component_json.as_ref().is_none_or(|file| file.propagate);
        if propagate {
            let variant = by_root_dir_and_name(
                &self.config.variants,
                entry.root_dir.trim_end_matches('/'),
                &entry.id.name,
            )?;
            let lists = variant.extensions
                .iter()
                .map(|extensions| aspects::from_config_object(extensions, self.core_ids));
            merger.add(aspects::merge_lists(lists.collect()), Origin::WorkspaceVariants);
            propagate = variant.propagate;
        }
        if propagate {
            merger.add(non_specific, Origin::ModelNonSpecific);
        }
        Ok(merger.finish())
    }
}

#[cfg(test)]
mod tests;
