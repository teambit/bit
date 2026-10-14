//! One side of the metadata comparison: `rustDiffMetadata` of the Node.js glue.

use crate::commands::{
    ids::Id,
    status::js::{array, decline, object, text, truthy},
};
use serde_json::{Map, Value, json};
use std::{cmp::Ordering, io};

const RESOLVER: &str = "teambit.dependencies/dependency-resolver";
pub(super) const PACKAGE_FIELDS: [&str; 3] =
    ["packageDependencies", "devPackageDependencies", "peerPackageDependencies"];

/// One side of the comparison (`DiffMetadata`).
pub struct Side {
    pub(super) printable: Map<String, Value>,
    pub(super) version: String,
    pub(super) packages: [Map<String, Value>; 3],
    pub(super) ids: [Vec<Id>; 4],
    /// `peerDependenciesIds()`.
    pub(super) peers: Vec<Id>,
    /// `extensionConfigs()`: sorted by name, keys sorted.
    pub(super) configs: Map<String, Value>,
}

/// What both sides share.
pub struct Component<'c> {
    pub target: &'c Value,
    pub model: Option<&'c Value>,
    pub package_name: &'c str,
}

impl Component<'_> {
    /// `rustDiffMetadata(target, model, value, peerDependencies, packageName, current)`.
    pub fn side(
        &self,
        value: &Value,
        peer_dependencies: &[Value],
        current: bool,
    ) -> io::Result<Side> {
        let extensions = array(value.get("extensions"), "extensions")?;
        if !current && extensions.iter().any(custom_package_name) {
            return Err(decline("stored custom package name requires canonical diff"));
        }
        let ids = [
            ids_of(value.get("dependencies"))?,
            ids_of(value.get("devDependencies"))?,
            ids_of(Some(&Value::Array(peer_dependencies.to_vec())))?,
            Vec::new(),
        ];
        let peers = Id::unique(
            ids[2]
                .iter()
                .cloned()
                .chain(data_peers(extensions)?),
        );
        let packages = PACKAGE_FIELDS.map(|field| {
            value
                .get(field)
                .and_then(Value::as_object)
                .cloned()
                .unwrap_or_default()
        });
        Ok(Side {
            printable: self.printable(value, extensions, current)?,
            version: text(self.target.get("version"))?.to_string(),
            packages,
            ids,
            peers,
            configs: configs(extensions, true)?,
        })
    }

    fn printable(
        &self,
        value: &Value,
        extensions: &[Value],
        current: bool,
    ) -> io::Result<Map<String, Value>> {
        let mut printable = Map::new();
        printable.insert("packageName".into(), json!(self.package_name));
        printable.insert("language".into(), self.language(current));
        printable.insert("bindingPrefix".into(), self.binding_prefix()?);
        let main = value
            .get("mainFile")
            .filter(|main| truthy(Some(main)))
            .cloned();
        printable.insert("mainFile".into(), main.unwrap_or(Value::Null));
        let files = array(value.get("files"), "files")?;
        printable.insert("files".into(), file_list(files, false)?);
        let has_specs = files
            .iter()
            .any(|file| file.get("test") == Some(&Value::Bool(true)));
        let specs = if has_specs { file_list(files, true)? } else { Value::Null };
        printable.insert("specs".into(), specs);
        let configured: Vec<Value> = configs(extensions, false)?
            .keys()
            .map(|key| json!(key))
            .collect();
        let listed = !extensions.is_empty() || current;
        printable.insert("extensions".into(), if listed { json!(configured) } else { Value::Null });
        let deprecated =
            if self.stored("deprecated").is_some() { json!("True") } else { Value::Null };
        printable.insert("deprecated".into(), deprecated);
        Ok(printable)
    }

    /// A truthy field of the stored model.
    fn stored(&self, key: &str) -> Option<&Value> {
        self.model
            .and_then(|model| model.get(key))
            .filter(|value| truthy(Some(value)))
    }

    fn language(&self, current: bool) -> Value {
        match self.stored("lang") {
            Some(language) if !current => language.clone(),
            _ => json!("javascript"),
        }
    }

    /// `model.bindingPrefix || @<owner>`.
    fn binding_prefix(&self) -> io::Result<Value> {
        if let Some(prefix) = self.stored("bindingPrefix") {
            return Ok(prefix.clone());
        }
        let identity = text(self.target.get("identity"))?;
        let scope = identity
            .split('/')
            .next()
            .unwrap_or_default();
        Ok(json!(format!(
            "@{}",
            scope
                .split('.')
                .next()
                .unwrap_or_default()
        )))
    }
}

/// The `files` (or, with `tests`, `specs`) field: relative paths with `/`,
/// `null` without files.
fn file_list(files: &[Value], tests: bool) -> io::Result<Value> {
    if files.is_empty() {
        return Ok(Value::Null);
    }
    let paths = files
        .iter()
        .filter(|file| truthy(file.get("test")) == tests)
        .map(|file| Ok(json!(text(file.get("relativePath"))?.replace('\\', "/"))))
        .collect::<io::Result<Vec<_>>>()?;
    Ok(Value::Array(paths))
}

fn custom_package_name(extension: &Value) -> bool {
    extension.get("name").and_then(Value::as_str) == Some("teambit.pkg/pkg")
        && truthy(
            extension
                .get("config")
                .and_then(|c| c.get("packageJson"))
                .and_then(|p| p.get("name")),
        )
}

/// `ComponentIdList` of stored rows (`{ id: {...} }`) or id strings.
fn ids_of(rows: Option<&Value>) -> io::Result<Vec<Id>> {
    array(rows, "dependency ids")?
        .iter()
        .map(|row| match row {
            Value::String(id) => Id::parse(id),
            _ => Id::from_object(row.get("id").ok_or_else(|| decline("dependency id"))?),
        })
        .collect()
}

/// Component peers the resolver data records.
fn data_peers(extensions: &[Value]) -> io::Result<Vec<Id>> {
    let resolver = extensions
        .iter()
        .find(|extension| extension.get("name").and_then(Value::as_str) == Some(RESOLVER));
    let rows = resolver
        .and_then(|e| e.get("data"))
        .and_then(|data| data.get("dependencies"));
    array(rows, "resolver dependencies")?
        .iter()
        .filter(|dep| dep.get("__type").and_then(Value::as_str) == Some("component"))
        .filter(|dep| dep.get("lifecycle").and_then(Value::as_str) == Some("peer"))
        .map(|dep| {
            let id = Id::parse(text(dep.get("id"))?)?;
            Ok(
                match dep
                    .get("version")
                    .filter(|version| truthy(Some(version)))
                {
                    Some(version) => id.with_version(Some(text(Some(version))?.to_string())),
                    None => id,
                },
            )
        })
        .collect()
}

/// `configs(extensions, sorted)`: each extension's configuration without
/// `__specific`, where any remains.
fn configs(extensions: &[Value], sorted: bool) -> io::Result<Map<String, Value>> {
    let mut rows: Vec<&Value> = extensions.iter().collect();
    if sorted {
        rows.sort_by(|a, b| utf16_cmp(name(a), name(b)));
    }
    let mut result = Map::new();
    for extension in rows {
        let mut config = match extension
            .get("config")
            .filter(|config| !config.is_null())
        {
            Some(config) => object(config)?.clone(),
            None => Map::new(),
        };
        config.remove("__specific");
        if config.is_empty() {
            continue;
        }
        if sorted {
            let mut keys: Vec<String> = config.keys().cloned().collect();
            keys.sort_by(|a, b| utf16_cmp(a, b));
            config = keys
                .into_iter()
                .map(|key| {
                    let value = config[&key].clone();
                    (key, value)
                })
                .collect();
        }
        let key = name(extension).to_string();
        object(&json!({ &key: 0 }))?;
        result.insert(key, Value::Object(config));
    }
    Ok(result)
}

fn name(extension: &Value) -> &str {
    extension
        .get("name")
        .and_then(Value::as_str)
        .unwrap_or_default()
}

/// JavaScript's default string order: UTF-16 code units.
fn utf16_cmp(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}
