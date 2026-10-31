//! `NodeModuleLinker` metadata adapters transform native package plans before publication.

#[cfg(test)]
mod tests;
use super::{Prepared, invalid, json, pretty};
use serde_json::{Value, json as value};
use std::{collections::HashSet, io};

impl Prepared {
    pub(in crate::workspace::engine::command) fn package_manifest_plans(
        &self,
    ) -> io::Result<Vec<Value>> {
        self.writes
            .iter()
            .filter(|(path, _)| {
                path.file_name()
                    .is_some_and(|name| name == "package.json")
            })
            .map(|(_, bytes)| {
                let manifest = json(bytes)?;
                let identity = identity(&manifest)?;
                Ok(value!({"identity":identity,"manifest":manifest}))
            })
            .collect()
    }

    #[cfg(test)]
    fn package_manifests(&mut self, manifests: &[Value]) -> io::Result<()> {
        self.package_manifests_with_aspects(manifests, &HashSet::new())
    }
    pub(in crate::workspace::engine::command) fn package_manifests_with_aspects(
        &mut self,
        manifests: &[Value],
        aspects: &HashSet<String>,
    ) -> io::Result<()> {
        let expected = self.package_manifest_plans()?;
        if expected.len() != manifests.len() {
            return Err(invalid("snapshot package manifest count"));
        }
        let mut identities = HashSet::new();
        let mut writes = Vec::new();
        for row in manifests {
            let id = row["identity"]
                .as_str()
                .map(str::trim)
                .filter(|id| !id.is_empty())
                .ok_or_else(|| invalid("snapshot package manifest identity"))?;
            if !identities.insert(id) {
                return Err(invalid("snapshot duplicate package manifest"));
            }
            let original = expected
                .iter()
                .find(|row| row["identity"] == id)
                .ok_or_else(|| invalid("snapshot unknown package manifest"))?;
            let mut manifest = normalize(row["manifest"].clone(), &original["manifest"])?;
            if aspects.contains(id) {
                aspect_exports(&mut manifest)?;
            }
            writes.push((self.manifest_index(id)?, pretty(&manifest, true)?));
        }
        for (index, bytes) in writes {
            self.writes[index].1 = bytes;
        }
        Ok(())
    }

    fn manifest_index(&self, identity: &str) -> io::Result<usize> {
        self.writes
            .iter()
            .position(|(path, bytes)| {
                path.file_name()
                    .is_some_and(|name| name == "package.json")
                    && json(bytes)
                        .ok()
                        .is_some_and(|value| {
                            self::identity(&value).ok().as_deref() == Some(identity)
                        })
            })
            .ok_or_else(|| invalid("snapshot package write absent"))
    }
}
fn identity(manifest: &Value) -> io::Result<String> {
    if let Some(raw) = manifest["componentId"].as_str() {
        let raw = raw.trim();
        let bare = raw.rsplit_once('@').map_or(raw, |(prefix, _)| prefix.trim());
        let (scope, name) = bare
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()))
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("snapshot package scope"))?;
        return Ok(format!("{scope}/{name}"));
    }
    let scope = manifest["componentId"]["scope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
        .ok_or_else(|| invalid("snapshot package scope"))?;
    let name = manifest["componentId"]["name"]
        .as_str()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| invalid("snapshot package name"))?;
    Ok(format!("{scope}/{name}"))
}

fn normalize(mut manifest: Value, original: &Value) -> io::Result<Value> {
    if !manifest.is_object() {
        return Err(invalid("snapshot package manifest shape"));
    }
    if matches!(manifest["version"].as_str(), Some("latest" | "head")) {
        manifest["version"] = value!("0.0.1-new");
    } else if let Some(hash) = manifest["version"]
        .as_str()
        .filter(|hash| {
            (3..=40).contains(&hash.len()) && hash.bytes().all(|byte| byte.is_ascii_hexdigit())
        })
    {
        let version = format!("0.0.0-{hash}");
        manifest["version"] = value!(version);
    }
    platform_types(&mut manifest, original, cfg!(windows));
    manifest["_bit_local"] = value!(true);
    manifest["source"] = original["source"].clone();
    Ok(manifest)
}

fn platform_types(manifest: &mut Value, original: &Value, windows: bool) {
    if !windows {
        return;
    }
    if let Some(types) = original.get("types") {
        manifest["types"] = types.clone();
    } else {
        // An absent JavaScript property serializes as absent, never as null.
        manifest
            .as_object_mut()
            .unwrap()
            .shift_remove("types");
    }
}

fn aspect_exports(manifest: &mut Value) -> io::Result<()> {
    if !truthy(&manifest["types"]) || !truthy(&manifest["exports"]) {
        return Ok(());
    }
    let types = js_string(&manifest["types"]);
    let root = &mut manifest["exports"];
    let exports = if truthy(&root["."]) { &mut root["."] } else { root };
    if truthy(&exports["types"]) {
        return Ok(());
    }
    let exports =
        exports.as_object_mut().ok_or_else(|| invalid("snapshot aspect exports shape"))?;
    let default = exports.get("default").cloned();
    if default.as_ref().is_some_and(truthy) {
        exports.shift_remove("default");
    }
    let types = format!("./{types}");
    exports.insert("types".into(), value!(types));
    if let Some(default) = default {
        exports.insert("default".into(), default);
    }
    Ok(())
}
fn truthy(value: &Value) -> bool {
    match value {
        Value::Null => false,
        Value::Bool(value) => *value,
        Value::Number(value) => value
            .as_f64()
            .is_some_and(|value| value != 0.0),
        Value::String(value) => !value.is_empty(),
        Value::Array(_) | Value::Object(_) => true,
    }
}

fn js_string(value: &Value) -> String {
    match value {
        Value::Null => "null".into(),
        Value::Bool(value) => value.to_string(),
        Value::Number(value) => ryu_js::Buffer::new()
            .format_finite(value.as_f64().unwrap_or(0.0))
            .to_owned(),
        Value::String(value) => value.clone(),
        Value::Array(values) => values
            .iter()
            .map(|value| if value.is_null() { String::new() } else { js_string(value) })
            .collect::<Vec<_>>()
            .join(","),
        Value::Object(_) => "[object Object]".into(),
    }
}
