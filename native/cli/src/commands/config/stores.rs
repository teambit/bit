//! `ConfigStoreMain` [`Stores`] registration ([`Options`]) and deferred native [`writing`].
//!
//! Loads and mutates [`Store`] entries across `global`, `scope`, and `workspace` origins.
mod writing;

use super::options::Options;
use bit_workspace_config::{jsonc::Document, merge_layers, scope_path, workspace_root};
use serde_json::{Map, Value};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

/// Aspect identifier key under which `workspace.jsonc` configuration entries are stored.
const ASPECT: &str = "teambit.harmony/config-store";

/// Single configuration store layer (`global`, `scope`, or `workspace`) with staged mutation state.
pub(super) struct Store {
    pub(super) origin: &'static str,
    path: PathBuf,
    source: Value,
    pub(super) values: Map<String, Value>,
    change: Option<(String, Option<Value>)>,
    root: Option<PathBuf>,
    missing: bool,
}

/// Ordered collection of `global`, `scope`, and `workspace` [`Store`] layers.
pub(super) struct Stores {
    pub(super) entries: Vec<Store>,
}

impl Stores {
    /// Loads all active [`Store`] layers from disk for the current working directory.
    pub(super) fn load() -> io::Result<Self> {
        let cwd = env::current_dir()?;
        let mut entries = Vec::with_capacity(3);
        entries.push(Store::load(
            "global",
            bit_workspace_config::global_config_dir().join("config.json"),
            None,
        )?);
        let workspace = workspace_root(&cwd);
        let scope = workspace
            .as_deref()
            .map(scope_path)
            .or_else(|| {
                cwd.ancestors()
                    .find_map(|path| {
                        [path.to_path_buf(), path.join(".bit"), path.join(".git/bit")]
                            .into_iter()
                            .find(|candidate| candidate.join("scope.json").is_file())
                    })
            });
        if let Some(scope) = scope.filter(|path| path.join("scope.json").is_file()) {
            entries.push(Store::load("scope", scope.join("scope.json"), None)?);
        }
        if let Some(root) = workspace {
            entries.push(Store::load("workspace", root.join("workspace.jsonc"), Some(root))?);
        }
        Ok(Self { entries })
    }

    /// Returns the bare scope directory when `scope` is present without an enclosing `workspace` store.
    #[inline]
    pub(super) fn history_scope(&self) -> Option<&Path> {
        self.entries
            .iter()
            .any(|store| store.origin == "workspace")
            .then_some(())?;
        self.entries
            .iter()
            .find(|store| store.origin == "scope")?
            .path
            .parent()
    }

    /// Merges the `global`, `scope`, and `workspace` [`Store`] layers into a single combined [`Map`] via [`merge_layers`].
    #[inline]
    pub(super) fn combined(&self) -> Map<String, Value> {
        let value = |origin| {
            self.entries
                .iter()
                .find(|store| store.origin == origin)
                .map_or(Value::Null, |store| Value::Object(store.values.clone()))
        };
        merge_layers(&value("global"), &value("scope"), &value("workspace"))
    }

    /// Stages a `set` or `del` mutation on the target [`Store`] layer selected by `options` ([`Options`]).
    pub(super) fn prepare(&mut self, options: &Options) -> io::Result<()> {
        let value = match options.command.as_str() {
            "set" => {
                let raw = options.values
                    .get(1)
                    .ok_or_else(|| io::Error::other("missing configuration value"))?;
                Some(Some(Value::String(raw.clone())))
            }
            "del" => Some(None),
            _ => None,
        };
        let Some(value) = value else { return Ok(()) };
        let key = options.values
            .first()
            .map(|raw| raw.trim())
            .filter(|raw| !raw.is_empty())
            .ok_or_else(|| io::Error::other("missing configuration key"))?;
        let Some(origin) = self.resolve_origin(options, key, value.is_some()) else {
            return Ok(());
        };
        let store = self.entries
            .iter_mut()
            .find(|store| store.origin.eq_ignore_ascii_case(&origin))
            .ok_or_else(|| {
                let verb = if value.is_some() { "set" } else { "delete" };
                io::Error::other(format!(
                    r#"unable to {verb} config, "{origin}" origin is missing"#,
                ))
            })?;
        store.prepare_change(key, value)
    }

    fn resolve_origin(&self, options: &Options, key: &str, is_set: bool) -> Option<String> {
        options.origin
            .as_deref()
            .map(str::trim)
            .filter(|origin| !origin.is_empty())
            .map(str::to_owned)
            .or_else(|| {
                if is_set {
                    Some("global".to_owned())
                } else {
                    self.entries
                        .iter()
                        .find(|store| store.values.contains_key(key))
                        .map(|store| store.origin.to_owned())
                }
            })
    }

    #[inline]
    pub(super) fn write(&self) -> io::Result<()> {
        for store in &self.entries {
            if store.change.is_some() || store.missing {
                writing::write(store)?;
            }
        }
        Ok(())
    }
}

impl Store {
    fn prepare_change(&mut self, key: &str, value: Option<Value>) -> io::Result<()> {
        if self.origin == "workspace" && aspect(&self.source) != ASPECT {
            return Err(io::Error::other(
                "versioned config-store edits require the canonical command",
            ));
        }
        if value.is_none()
            && self.origin == "scope"
            && !bit_workspace_config::truthy(&self.source["config"])
        {
            return Ok(());
        }
        if let Some(value) = &value {
            self.values.insert(key.to_owned(), value.clone());
        } else {
            self.values.shift_remove(key);
        }
        self.change = Some((key.to_owned(), value));
        Ok(())
    }

    fn load(origin: &'static str, path: PathBuf, root: Option<PathBuf>) -> io::Result<Self> {
        let missing = !path.exists();
        let source = read_source(origin, &path)?;
        if !source.is_object() {
            return Err(io::Error::other("configuration store requires an object"));
        }
        let projected = match origin {
            "workspace" => source.get(aspect(&source)),
            "scope" => source.get("config"),
            _ => Some(&source),
        };
        if projected.is_some_and(|value| !value.is_object() && bit_workspace_config::truthy(value))
        {
            return Err(io::Error::other("configuration store has an unsupported shape"));
        }
        if projected.is_some_and(|value| {
            value.get("__proto__").is_some()
                || value.get("constructor").is_some()
                || value.get("prototype").is_some()
        }) {
            return Err(io::Error::other(
                "configuration prototype entries require the canonical command",
            ));
        }
        let values = projected
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default();
        Ok(Self { origin, path, source, values, change: None, root, missing })
    }
}

#[inline]
fn read_source(origin: &str, path: &Path) -> io::Result<Value> {
    if origin == "global" {
        let directory =
            path.parent().ok_or_else(|| io::Error::other("global configuration directory"))?;
        return bit_workspace_config::read_global_config(directory);
    }
    if !path.exists() {
        return Ok(Value::Object(Map::new()));
    }
    let bytes = fs::read(path)?;
    bit_workspace_config::parse_jsonc(&bytes)
}

#[inline]
fn aspect(value: &Value) -> &str {
    bit_workspace_config::workspace_store_key(value)
}
