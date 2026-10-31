//! Validated bitmap publication and history for workspace commands.
pub(super) use export::prepare_export_scopes;
mod export;
mod lane;
#[cfg(test)]
mod lane_tests;
mod soft;
mod stash;
#[cfg(test)]
mod switch_tests;
#[cfg(test)]
mod tests;
use crate::workspace::engine::invalid;
use serde_json::{Map, Value};
use soft::{identity, rows};
use std::{
    collections::{HashMap, HashSet},
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

pub(super) fn active_tracked_checkout(context: &Value, identity: &str) -> bool {
    lane::tracked_checkout(context, identity)
}

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
impl Prepared {
    pub(super) fn switch_continuation(
        &mut self,
        context: &Value,
        publish_checkout: bool,
    ) -> io::Result<Self> {
        let original = if publish_checkout && self.changed { &self.output } else { &self.original };
        let mut final_bitmap = Self {
            root: self.root.clone(),
            original: original.clone(),
            output: self.output.clone(),
            changed: false,
        };
        final_bitmap.switch_lane(context)?;
        if !publish_checkout {
            self.changed = false;
        }
        Ok(final_bitmap)
    }
    pub(super) fn restore_stash(&mut self, context: &Value) -> io::Result<()> {
        stash::append(self, context)
    }

    /// `switch` changes the active lane even when every component was skipped.
    /// Re-render the post-checkout bytes for Consumer.onDestroy after installation.
    pub(super) fn switch_lane(&mut self, context: &Value) -> io::Result<()> {
        let id = &context["lane"]["switchId"];
        let (scope, name) = if let Some(raw) = id.as_str().map(str::trim) {
            raw.split_once('/').unwrap_or(("", raw))
        } else {
            (
                id["scope"]
                    .as_str()
                    .map(str::trim)
                    .ok_or_else(|| invalid("switch lane scope"))?,
                id["name"]
                    .as_str()
                    .map(str::trim)
                    .ok_or_else(|| invalid("switch lane name"))?,
            )
        };
        let (scope, name) = (scope.trim(), name.trim());
        if name.is_empty() || (name != "main" && scope.is_empty()) {
            return Err(invalid("switch lane identity"));
        }
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        lane::switch_visibility(&mut entries, context, name)?;
        let header = (name != "main").then(|| {
            serde_json::json!({"id":{"name":name,"scope":scope},
            "exported":context["lane"]["switchExported"] == true})
        });
        self.output = render_rows(entries, &bitmap["$schema-version"], header)?;
        self.changed = true;
        Ok(())
    }
    /// A first snapshot on a lane makes a newly tracked component lane-only.
    /// Keep the staged bitmap bytes as the input to this transformation.
    pub(super) fn mark_lane_new(
        &mut self,
        context: &Value,
        identities: &[String],
    ) -> io::Result<()> {
        if identities.is_empty() {
            return Ok(());
        }
        if !lane::on_lane(context) {
            return Err(invalid("command lane-only update outside lane"));
        }
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        let mut seen = HashSet::new();
        for id in identities {
            if !seen.insert(id) {
                return Err(invalid("command duplicate lane-only identity"));
            }
            let entry = entries
                .iter_mut()
                .find(|entry| identity(entry).ok().as_ref() == Some(id))
                .ok_or_else(|| invalid("command lane-only identity absent"))?;
            let fields =
                entry.as_object_mut().ok_or_else(|| invalid("command lane-only bitmap entry"))?;
            fields.insert("onLanesOnly".into(), Value::Bool(true));
            fields.insert("isAvailableOnCurrentLane".into(), Value::Bool(true));
        }
        self.output =
            render_rows(entries, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
        self.changed = true;
        Ok(())
    }

    /// Reset removes overrides only for components actually passed to the writer.
    /// Keep the original bytes intact for freshness checks and bitmap history.
    pub(super) fn clear_config(
        &mut self,
        context: &Value,
        identities: &[String],
    ) -> io::Result<()> {
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        let mut entries = rows(&bitmap)?;
        let mut selected = HashSet::new();
        for id in identities {
            if !selected.insert(id) {
                return Err(invalid("reset duplicate configuration identity"));
            }
            let entry = entries
                .iter_mut()
                .find(|entry| identity(entry).ok().as_ref() == Some(id))
                .ok_or_else(|| invalid("reset configuration identity absent"))?;
            self.changed |= entry
                .as_object_mut()
                .ok_or_else(|| invalid("reset bitmap configuration"))?
                .shift_remove("config")
                .is_some();
        }
        self.output =
            render_rows(entries, &bitmap["$schema-version"], lane::header(context, &bitmap)?)?;
        Ok(())
    }

    pub(super) fn make_available_on_main(&mut self, context: &Value) -> io::Result<()> {
        if lane::on_lane(context) {
            return Ok(());
        }
        let bitmap = crate::recovery::jsonc::parse(&self.output)?;
        if bitmap.get("_bit_lane").is_some() {
            return Ok(());
        }
        let mut entries = rows(&bitmap)?;
        if lane::make_available_on_main(&mut entries, context)? {
            self.output = render_rows(entries, &bitmap["$schema-version"], None)?;
            self.changed = true;
        }
        Ok(())
    }
}
pub(super) fn prepare_after(
    previous: &Prepared,
    context: &Value,
    updates: &[Update],
) -> io::Result<Prepared> {
    let original = if previous.changed { &previous.output } else { &previous.original };
    prepare_bytes(&previous.root, original.clone(), context, updates, &[])
}
pub(super) fn prepare_bytes(
    root: &Path,
    original: Vec<u8>,
    context: &Value,
    updates: &[Update],
    removed: &[String],
) -> io::Result<Prepared> {
    validate_updates(&original, updates)?;
    let bitmap = crate::recovery::jsonc::parse(&original)?;
    let header = lane::header(context, &bitmap)?;
    let mut rows = rows(&bitmap)?;
    let membership_changed = lane::membership(&mut rows, context, updates, removed)?;
    let changed = apply_updates(&mut rows, context, updates)? || membership_changed;
    let output = render_rows(rows, &bitmap["$schema-version"], header)?;
    Ok(Prepared { root: root.to_owned(), original, output, changed })
}
/// Startup reconciliation changes IDs only, preserving the tracked files/config.
pub(super) fn auto_sync(
    root: &Path,
    updates: &[(String, String)],
) -> io::Result<(Prepared, usize)> {
    let original = fs::read(root.join(".bitmap"))?;
    let bitmap = crate::recovery::jsonc::parse(&original)?;
    let mut entries = rows(&bitmap)?;
    let mut count = 0;
    for entry in &mut entries {
        let current = identity(entry)?;
        if let Some((_, version)) = updates
            .iter()
            .find(|(id, _)| id == &current)
        {
            let (scope, _) = current.split_once('/').ok_or_else(|| invalid("auto-sync scope"))?;
            if entry["version"].as_str() == Some(version) && entry["scope"] == scope {
                continue;
            }
            count += 1;
            entry
                .as_object_mut()
                .ok_or_else(|| invalid("auto-sync bitmap entry"))?
                .shift_remove("defaultScope");
            entry["scope"] = Value::String(scope.to_owned());
            entry["version"] = Value::String(version.clone());
        }
    }
    let output = render_rows(entries, &bitmap["$schema-version"], None)?;
    Ok((Prepared { root: root.to_owned(), original, output, changed: count > 0 }, count))
}

/// Promote every selected export row in one bitmap write and one history entry.
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
    lane::promote_inactive_scope(entry, context, update)?;
    crate::checkout::plan::relative_path(&update.main_file)?;
    entry["version"] = Value::String(tag(context, &update.identity, &update.version)?);
    entry["mainFile"] = Value::String(update.main_file.clone());
    let entry = entry.as_object_mut().ok_or_else(|| invalid("command bitmap entry"))?;
    if lane::on_lane(context) {
        if !lane::tracked_checkout(context, &update.identity) {
            entry.insert("isAvailableOnCurrentLane".into(), Value::Bool(true));
        }
    } else {
        entry.shift_remove("isAvailableOnCurrentLane");
        entry.shift_remove("onLanesOnly");
    }
    Ok(true)
}
fn render_rows(rows: Vec<Value>, schema: &Value, lane: Option<Value>) -> io::Result<Vec<u8>> {
    let mut names = HashMap::<String, usize>::new();
    for entry in &rows {
        let name = entry["name"].as_str().ok_or_else(|| invalid("command bitmap name"))?;
        *names.entry(name.to_owned()).or_default() += 1;
    }
    let mut keyed = Vec::new();
    for entry in rows {
        let name = entry["name"].as_str().ok_or_else(|| invalid("command bitmap name"))?;
        let key = if names[name] > 1 { identity(&entry)? } else { name.to_owned() };
        keyed.push((key, crate::inspection::component_row(&entry)?));
    }
    keyed.sort_by(|(left, _), (right, _)| left.encode_utf16().cmp(right.encode_utf16()));
    let mut output = Map::new();
    for (key, entry) in keyed {
        if output.insert(key, entry).is_some() {
            return Err(invalid("command duplicate bitmap identity"));
        }
    }
    output.insert("$schema-version".into(), schema.clone());
    if let Some(lane) = lane {
        output.insert("_bit_lane".into(), lane);
    }
    crate::inspection::render_bitmap(&Value::Object(output))
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
    pub(super) fn publication_receipt(&self) -> io::Result<Value> {
        let after = if self.changed { &self.output } else { &self.original };
        let path = self.root.join(".bitmap");
        if fs::read(&path)? != *after {
            return Err(invalid("switch bitmap publication changed"));
        }
        Ok(crate::command_import::write_receipt(&path, Some(&self.original), after))
    }
    pub(super) fn commit(&self, file_id: &str, reason: &str) -> io::Result<Option<String>> {
        self.validate()?;
        if !self.changed {
            return Ok(None);
        }
        validate_history_file_id(file_id)?;
        let backup = (|| -> io::Result<()> {
            let directory = crate::scope_path(&self.root).join("bitmap-history");
            fs::create_dir_all(&directory)?;
            fs::copy(self.root.join(".bitmap"), directory.join(format!(".bitmap-{file_id}")))?;
            let mut metadata = fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(crate::scope_path(&self.root).join("bitmap-history-metadata.txt"))?;
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
