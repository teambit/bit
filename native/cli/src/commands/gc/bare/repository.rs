//! Read the bare collector's live and trashed objects before publishing any effects.
use serde_json::Value;
use sha1::{Digest, Sha1};
use std::{collections::BTreeMap, fs, io, path::Path};

pub(super) struct Object {
    pub kind: String,
    pub value: Value,
}

pub(super) fn read(directory: &Path) -> io::Result<BTreeMap<String, Object>> {
    let mut objects = BTreeMap::new();
    for bucket in entries(directory)? {
        let name = bucket.file_name();
        let Some(name) = name
            .to_str()
            .filter(|name| !name.starts_with('.'))
        else {
            continue;
        };
        if !bucket.path().is_dir() {
            continue;
        }
        for entry in entries(&bucket.path())? {
            let Some(identity) = object_name(name, &entry)? else { continue };
            if objects.len() >= 100_000 {
                return Err(unsupported("object inventory budget"));
            }
            objects.insert(identity.clone(), read_one(directory, &identity)?);
        }
    }
    Ok(objects)
}
fn object_name(bucket: &str, entry: &fs::DirEntry) -> io::Result<Option<String>> {
    let leaf = entry.file_name();
    let Some(leaf) = leaf
        .to_str()
        .filter(|leaf| !leaf.starts_with('.'))
    else {
        return Ok(None);
    };
    let identity = format!("{bucket}{leaf}");
    if !hash(&identity) {
        return Ok(None);
    }
    if bucket.len() != 2 || leaf.len() != 38 {
        return Err(unsupported("object layout"));
    }
    if !entry.path().is_file() {
        return Err(unsupported("non-file object"));
    }
    Ok(Some(identity))
}
fn read_one(directory: &Path, identity: &str) -> io::Result<Object> {
    let (kind, mut value) = bit_object_import::read_object_directory(directory, identity)?
        .ok_or_else(|| unsupported("object disappeared during inventory"))?;
    if !matches!(
        kind.as_str(),
        "Component"
            | "Version"
            | "Source"
            | "ScopeMeta"
            | "Lane"
            | "VersionHistory"
            | "LaneHistory"
            | "Symlink",
    ) {
        return Err(unsupported("object type"));
    }
    normalize_name(&kind, &mut value)?;
    if kind == "Version" && (!value["files"].is_array() || !value["log"].is_object()) {
        return Err(unsupported("version files or log metadata"));
    }
    Ok(Object { kind, value })
}
fn normalize_name(kind: &str, value: &mut Value) -> io::Result<()> {
    if !matches!(kind, "Component" | "Symlink")
        || !crate::commands::status::js::truthy(value.get("box"))
    {
        return Ok(());
    }
    value["name"] = Value::String(format!("{}/{}", text(&value["box"])?, text(&value["name"])?));
    Ok(())
}

/// `Sources._findComponent` resolves one legacy alias to its actual model.
pub(super) fn model<'objects>(
    objects: &'objects BTreeMap<String, Object>,
    id: &str,
) -> io::Result<Option<&'objects Object>> {
    let Some(object) = objects.get(&digest(id)) else { return Ok(None) };
    if object.kind == "Symlink" {
        let id = format!("{}/{}", text(&object.value["realScope"])?, text(&object.value["name"])?);
        return component(objects.get(&digest(&id)));
    }
    component(Some(object))
}
fn component(object: Option<&Object>) -> io::Result<Option<&Object>> {
    if object.is_some_and(|object| object.kind != "Component") {
        return Err(unsupported("component reference has a non-component object"));
    }
    Ok(object)
}
fn entries(directory: &Path) -> io::Result<Vec<fs::DirEntry>> {
    match fs::read_dir(directory) {
        Ok(entries) => entries.collect(),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(error) => Err(error),
    }
}
pub(super) fn hash(value: &str) -> bool {
    value.len() == 40
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
pub(super) fn digest(value: &str) -> String {
    format!("{:x}", Sha1::digest(value.as_bytes()))
}
pub(super) fn identity(value: &Value) -> io::Result<String> {
    Ok(format!("{}/{}", text(&value["scope"])?, text(&value["name"])?))
}
pub(super) fn text(value: &Value) -> io::Result<&str> {
    value
        .as_str()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| unsupported("metadata string"))
}
pub(super) fn strings(value: &Value) -> io::Result<Vec<String>> {
    if value.is_null() {
        return Ok(Vec::new());
    }
    value
        .as_array()
        .ok_or_else(|| unsupported("metadata array"))?
        .iter()
        .map(|value| text(value).map(str::to_owned))
        .collect()
}
pub(super) fn unsupported(message: &str) -> io::Error {
    io::Error::other(format!("bare scope collection preflight: {message}"))
}
