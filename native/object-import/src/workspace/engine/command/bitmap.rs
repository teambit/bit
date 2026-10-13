//! Final bitmap publication for already-tracked main-lane components.
use crate::workspace::engine::invalid;
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) struct Update {
    pub(super) identity: String,
    pub(super) version: String,
    pub(super) main_file: String,
    pub(super) keep_ours: bool,
}
pub(super) struct Prepared {
    root: PathBuf,
    original: Vec<u8>,
    output: Vec<u8>,
    changed: bool,
}
pub(super) fn prepare(root: &Path, context: &Value, updates: &[Update]) -> io::Result<Prepared> {
    prepare_bytes(root, fs::read(root.join(".bitmap"))?, context, updates)
}
pub(super) fn prepare_after(
    previous: &Prepared,
    context: &Value,
    updates: &[Update],
) -> io::Result<Prepared> {
    let original = if previous.changed { &previous.output } else { &previous.original };
    prepare_bytes(&previous.root, original.clone(), context, updates)
}
fn prepare_bytes(
    root: &Path,
    original: Vec<u8>,
    context: &Value,
    updates: &[Update],
) -> io::Result<Prepared> {
    validate_updates(&original, updates)?;
    let bitmap = crate::recovery::jsonc::parse(&original)?;
    let (names, mut rows) = rows(&bitmap)?;
    let changed = apply_updates(&mut rows, context, updates)?;
    let output = render_rows(rows, &names, &bitmap["$schema-version"])?;
    Ok(Prepared { root: root.to_owned(), original, output, changed })
}
fn validate_updates(original: &[u8], updates: &[Update]) -> io::Result<()> {
    let mut identities = HashSet::new();
    if updates
        .iter()
        .any(|update| !identities.insert(&update.identity))
    {
        return Err(invalid("command duplicate bitmap update"));
    }
    if original.len() > 4 * 1024 * 1024 || updates.len() > 4096 {
        return Err(invalid("command bitmap bounds"));
    }
    Ok(())
}
fn rows(bitmap: &Value) -> io::Result<(HashMap<String, usize>, Vec<Value>)> {
    let entries = bitmap.as_object().ok_or_else(|| invalid("command bitmap object"))?;
    if bitmap["$schema-version"].as_str().is_none() {
        return Err(invalid("command bitmap schema requires canonical migration"));
    }
    if entries.contains_key("_bit_lane") {
        return Err(invalid("command bitmap lane"));
    }
    let mut names = HashMap::<String, usize>::new();
    let mut rows = Vec::new();
    for (key, entry) in entries {
        if key != "$schema-version" {
            let name =
                entry["name"].as_str().ok_or_else(|| invalid("command bitmap component name"))?;
            *names.entry(name.to_owned()).or_default() += 1;
            rows.push(entry.clone());
        }
    }
    Ok((names, rows))
}
fn identity(entry: &Value) -> io::Result<String> {
    let name = entry["name"].as_str().ok_or_else(|| invalid("command bitmap name"))?;
    let scope = entry["scope"]
        .as_str()
        .filter(|scope| !scope.is_empty())
        .or_else(|| entry["defaultScope"].as_str())
        .ok_or_else(|| invalid("command bitmap scope"))?;
    Ok(format!("{scope}/{name}"))
}
fn apply_updates(rows: &mut [Value], context: &Value, updates: &[Update]) -> io::Result<bool> {
    let mut matched = 0;
    let mut changed = false;
    for entry in rows {
        let identity = identity(entry)?;
        if let Some(update) = updates
            .iter()
            .find(|update| update.identity == identity)
        {
            changed |= apply_update(entry, context, update)?;
            matched += 1;
        }
    }
    if matched != updates.len() {
        return Err(invalid("command bitmap update identity"));
    }
    Ok(changed)
}
fn apply_update(entry: &mut Value, context: &Value, update: &Update) -> io::Result<bool> {
    if update.keep_ours {
        // updateComponentId preserves the selected version instead of replacing snaps with tags.
        let changed = entry["version"].as_str() != Some(update.version.as_str());
        if changed {
            entry["version"] = Value::String(update.version.clone());
        }
        return Ok(changed);
    }
    crate::checkout::plan::relative_path(&update.main_file)?;
    entry["version"] = Value::String(tag(context, &update.identity, &update.version)?);
    entry["mainFile"] = Value::String(update.main_file.clone());
    let entry = entry.as_object_mut().ok_or_else(|| invalid("command bitmap entry"))?;
    entry.shift_remove("isAvailableOnCurrentLane");
    entry.shift_remove("onLanesOnly");
    Ok(true)
}
fn render_rows(
    rows: Vec<Value>,
    names: &HashMap<String, usize>,
    schema: &Value,
) -> io::Result<Vec<u8>> {
    let mut keyed = Vec::new();
    for entry in rows {
        let name = entry["name"].as_str().ok_or_else(|| invalid("command bitmap name"))?;
        let key = if names[name] > 1 { identity(&entry)? } else { name.to_owned() };
        keyed.push((key, plain(&entry)?));
    }
    keyed.sort_by(|(left, _), (right, _)| left.encode_utf16().cmp(right.encode_utf16()));
    let mut output = Map::new();
    for (key, entry) in keyed {
        if output.insert(key, entry).is_some() {
            return Err(invalid("command duplicate bitmap identity"));
        }
    }
    output.insert("$schema-version".into(), schema.clone());
    crate::inspection::render_bitmap(&Value::Object(output))
}
fn plain(entry: &Value) -> io::Result<Value> {
    let mut result = Map::new();
    for key in [
        "name",
        "scope",
        "version",
        "defaultScope",
        "mainFile",
        "rootDir",
        "wrapDir",
        "exported",
        "onLanesOnly",
        "isAvailableOnCurrentLane",
        "nextVersion",
        "localOnly",
        "config",
    ] {
        let Some(value) = entry
            .get(key)
            .filter(|value| !value.is_null())
        else {
            continue;
        };
        if !included(entry, key, value) {
            continue;
        }
        let value = clean_value(key, value)?;
        result.insert(key.into(), value);
    }
    Ok(Value::Object(result))
}
fn included(entry: &Value, key: &str, value: &Value) -> bool {
    if matches!(key, "onLanesOnly" | "localOnly") && value == false {
        return false;
    }
    !(key == "isAvailableOnCurrentLane" && value == true && entry["onLanesOnly"] != true)
}
fn clean_value(key: &str, value: &Value) -> io::Result<Value> {
    let mut value = value.clone();
    if key == "config" {
        let config = value.as_object_mut().ok_or_else(|| invalid("command bitmap config"))?;
        for aspect in config.values_mut() {
            if let Some(aspect) = aspect.as_object_mut() {
                aspect.shift_remove("__specific");
            }
        }
    }
    Ok(value)
}
fn tag(context: &Value, identity: &str, version: &str) -> io::Result<String> {
    if crate::merge_history::hash(version).is_err() {
        return Ok(version.to_owned());
    }
    let models = context["models"].as_array().ok_or_else(|| invalid("command bitmap models"))?;
    let model = models
        .iter()
        .find(|model| {
            format!(
                "{}/{}",
                model["scope"].as_str().unwrap_or_default(),
                model["name"].as_str().unwrap_or_default(),
            ) == identity
        })
        .ok_or_else(|| invalid("command bitmap model"))?;
    for field in ["versions", "orphanedVersions"] {
        if let Some(tags) = model[field].as_object()
            && let Some((tag, _)) = tags
                .iter()
                .rev()
                .find(|(_, hash)| hash.as_str() == Some(version))
        {
            return Ok(tag.clone());
        }
    }
    Ok(version.to_owned())
}
// Only the receipt used as a filename is constrained. Canonical backup metadata
// preserves arbitrary reason strings, including multiline merge messages.
pub(super) fn validate_history_file_id(file_id: &str) -> io::Result<()> {
    if file_id.len() > 32
        || file_id.split('-').count() != 6
        || file_id
            .split('-')
            .any(|part| part.is_empty() || !part.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return Err(invalid("command bitmap history receipt"));
    }
    Ok(())
}
impl Prepared {
    pub(super) fn validate(&self) -> io::Result<()> {
        if fs::read(self.root.join(".bitmap"))? != self.original {
            return Err(invalid("command bitmap changed"));
        }
        Ok(())
    }
    pub(super) fn commit(&self, file_id: &str, reason: &str) -> io::Result<Option<String>> {
        self.validate()?;
        if !self.changed {
            return Ok(None);
        }
        validate_history_file_id(file_id)?;
        let backup = (|| -> io::Result<()> {
            let directory = self.root.join(".bit/bitmap-history");
            fs::create_dir_all(&directory)?;
            fs::copy(self.root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
            let mut metadata = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(self.root.join(".bit/bitmap-history-metadata.txt"))?;
            writeln!(metadata, "{file_id} {reason}")?;
            metadata.sync_all()
        })();
        let mut file = fs::OpenOptions::new()
            .write(true)
            .truncate(true)
            .open(self.root.join(".bitmap"))?;
        file.write_all(&self.output)?;
        file.sync_all()?;
        Ok(backup
            .err()
            .filter(|error| error.kind() != io::ErrorKind::NotFound)
            .map(|error| error.to_string()))
    }
}

#[cfg(test)]
mod tests;
