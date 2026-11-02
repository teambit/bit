//! Stashed new components ([`context`], [`Prepare`]) retain their authored root and have no `ModelComponent`.

use super::super::{Record, capture, input::Prepare, invalid, materialization, planning, scratch};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// Populates `stashAdditions` and `stashAdditionTargets` in `context` for stashed new components.
pub(in crate::workspace::engine::command) fn context(
    request: &Prepare,
    context: &mut Value,
) -> io::Result<()> {
    let Some(stash) = &request.options.stash else {
        return Ok(());
    };
    let bitmap_path = request.root.join(".bitmap");
    if !std::fs::symlink_metadata(&bitmap_path)?.is_file() {
        return Err(invalid("stash bitmap"));
    }
    let bitmap = crate::parse_jsonc(&std::fs::read(&bitmap_path)?)?;
    let existing = identities(&bitmap)?;
    let mut additions = Vec::with_capacity(stash.bitmap_entries.len());
    let mut targets = Vec::with_capacity(stash.bitmap_entries.len());
    let mut seen = HashSet::with_capacity(stash.bitmap_entries.len());
    for entry in &stash.bitmap_entries {
        let Some((identity, version, mut row)) = addition(entry, &existing)? else {
            continue;
        };
        if !seen.insert(identity.clone()) {
            return Err(invalid("stash duplicate new identity"));
        }
        targets.push(json!({"identity":identity,"directory":entry["rootDir"],"version":"","mainFile":entry["mainFile"],"config":null,"bitmapConfig":row["config"],"stashVersion":version}));
        row["stashVersion"] = json!(version);
        additions.push(row);
    }
    context["stashAdditions"] = json!(additions);
    context["stashAddedTargets"] = json!(targets);
    Ok(())
}

/// Extracts existing `<scope>/<name>` component identities from `.bitmap` `rows`.
#[inline]
fn identities(bitmap: &Value) -> io::Result<HashSet<String>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("stash bitmap"))?;
    Ok(rows
        .iter()
        .filter(|(key, row)| {
            !key.starts_with('$')
                && !matches!(key.as_str(), "_bit_lane" | "version")
                && row.is_object()
        })
        .filter_map(|(key, row)| {
            let (scope, name) = crate::reset_lane::bitmap::row_identity(key, row);
            scope
                .filter(|_| !name.is_empty())
                .map(|scope| format!("{scope}/{name}"))
        })
        .collect())
}

/// Extracts a trimmed string field `key` from `row` or returns an invalid-input error with `message`.
#[inline]
fn trimmed_field<'a>(row: &'a Value, key: &str, message: &str) -> io::Result<&'a str> {
    row[key]
        .as_str()
        .map(str::trim)
        .ok_or_else(|| invalid(message))
}

pub(in crate::workspace::engine::command) fn materialize(
    record: &mut Record,
    plan: &mut planning::Planned,
    snapshots: &snapshots::State,
) -> io::Result<()> {
    let additions = record.context["stashAdditions"]
        .as_array()
        .cloned()
        .unwrap_or_default();
    for row in additions {
        let name = trimmed_field(&row, "name", "stash name")?;
        let scope = trimmed_field(&row, "defaultScope", "stash default scope")?;
        let identity = format!("{scope}/{name}");
        let hash = trimmed_field(&row, "stashVersion", "stash snapshot")?;
        let version = record.repository.read(hash, "Version")?;
        let destination = json!({"scope":scope,"name":name,"rootDir":row["rootDir"]});
        let current = capture::addition(&identity, &destination)?;
        let directory = scratch::Directory::create()?;
        let selection = json!({"kind":"target","version":hash,"merge":false});
        let material = materialization::prepare(
            &materialization::Input {
                root: &record.request.root,
                directory: &directory.0,
                current: &current,
                version: &version,
                reference: hash,
                selection: &selection,
                base: None,
                options: &record.request.options,
            },
            &record.repository,
            &mut plan.transitions,
            snapshots,
        )?;
        plan.result["components"]
            .as_array_mut()
            .ok_or_else(|| invalid("stash results"))?
            .push(material.output.clone());
        plan.captured.push(current);
        plan.materials.push(material);
        plan.directories.push(directory);
    }
    Ok(())
}

fn addition(
    entry: &Value,
    existing: &HashSet<String>,
) -> io::Result<Option<(String, String, Value)>> {
    let Some(scope) = entry["defaultScope"]
        .as_str()
        .map(str::trim)
        .filter(|scope| !scope.is_empty())
    else {
        return Ok(None);
    };
    let (scope_opt, name) = super::super::inbound::remote::file_list::row_id_parts(entry)
        .ok_or_else(|| invalid("stash new component name"))?;
    let name = name.trim();
    if name.is_empty() {
        return Err(invalid("stash new component name"));
    }
    let original_scope = scope_opt
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .unwrap_or(scope);
    let identity = format!("{scope}/{name}");
    if existing.contains(&identity)
        || (original_scope != scope && existing.contains(&format!("{original_scope}/{name}")))
    {
        return Ok(None);
    }
    let version = entry["id"]["version"]
        .as_str()
        .or_else(|| {
            entry["id"]
                .as_str()
                .and_then(|raw| raw.rsplit_once('@').map(|(_, ver)| ver))
        })
        .or_else(|| entry["version"].as_str())
        .map(str::trim)
        .filter(|ver| !ver.is_empty())
        .ok_or_else(|| invalid("stash new version"))?;
    crate::merge_history::hash(version)?;
    let mut row = json!({"name":name,"scope":"","version":"","defaultScope":scope,"mainFile":entry["mainFile"],"rootDir":entry["rootDir"]});
    if let Some(config) = entry.get("config") {
        row["config"] = config.clone();
    }
    Ok(Some((identity, version.to_owned(), row)))
}
