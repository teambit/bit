//! `ConfigStoreMain` store registration and deferred native writes.
mod writing;

use super::options::Options;
use bit_workspace_config::{jsonc::Document, merge_layers, scope_path, workspace_root};
use serde_json::{Map, Value};
use std::{
    env, fs, io,
    path::{Path, PathBuf},
};

const ASPECT: &str = "teambit.harmony/config-store";

pub(super) struct Store {
    pub(super) origin: &'static str,
    path: PathBuf,
    source: Value,
    pub(super) values: Map<String, Value>,
    change: Option<(String, Option<Value>)>,
    root: Option<PathBuf>,
    missing: bool,
}

pub(super) struct Stores {
    pub(super) entries: Vec<Store>,
}

impl Stores {
    pub(super) fn load() -> io::Result<Self> {
        let cwd = env::current_dir()?;
        let mut entries = vec![Store::load(
            "global",
            bit_workspace_config::global_config_dir().join("config.json"),
            None,
        )?];
        let workspace = workspace_root(&cwd);
        let scope = workspace
            .as_deref()
            .map(scope_path)
            .or_else(|| {
                cwd.ancestors()
                    .find(|path| path.join("scope.json").is_file())
                    .map(Path::to_owned)
            });
        if let Some(scope) = scope.filter(|path| path.join("scope.json").is_file()) {
            entries.push(Store::load("scope", scope.join("scope.json"), None)?);
        }
        if let Some(root) = workspace {
            entries.push(Store::load("workspace", root.join("workspace.jsonc"), Some(root))?);
        }
        Ok(Self { entries })
    }

    pub(super) fn history_scope(&self) -> Option<&Path> {
        self.entries
            .iter()
            .find(|store| store.origin == "workspace")?;
        self.entries
            .iter()
            .find(|store| store.origin == "scope")?
            .path
            .parent()
    }

    pub(super) fn combined(&self) -> Map<String, Value> {
        let value = |origin| {
            self.entries
                .iter()
                .find(|store| store.origin == origin)
                .map_or(Value::Null, |store| Value::Object(store.values.clone()))
        };
        merge_layers(&value("global"), &value("scope"), &value("workspace"))
    }

    pub(super) fn prepare(&mut self, options: &Options) -> io::Result<()> {
        let value = match options.command.as_str() {
            "set" => Some(Some(Value::String(options.values[1].clone()))),
            "del" => Some(None),
            _ => None,
        };
        let Some(value) = value else { return Ok(()) };
        let key = &options.values[0];
        let origin = options.origin
            .clone()
            .or_else(|| {
                if value.is_some() {
                    Some("global".to_owned())
                } else {
                    self.entries
                        .iter()
                        .find(|store| store.values.contains_key(key))
                        .map(|store| store.origin.to_owned())
                }
            });
        let Some(origin) = origin else { return Ok(()) };
        let store = self.entries
            .iter_mut()
            .find(|store| store.origin == origin)
            .ok_or_else(|| {
                io::Error::other(format!(r#"unable to set config, "{origin}" origin is missing"#))
            })?;
        store.prepare_change(key, value)?;
        Ok(())
    }

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
        if projected.is_some_and(|value| value.get("__proto__").is_some()) {
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
    if origin == "workspace" {
        bit_workspace_config::parse_jsonc(&bytes)
    } else {
        serde_json::from_slice(&bytes).map_err(io::Error::other)
    }
}

fn aspect(value: &Value) -> &str {
    bit_workspace_config::workspace_store_key(value)
}
