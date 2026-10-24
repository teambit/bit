//! Stashed new components retain their authored root and have no `ModelComponent`.
use super::super::{Record, capture, input::Prepare, invalid, materialization, planning, scratch};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

pub(in crate::workspace::engine::command) fn context(
    request: &Prepare,
    context: &mut Value,
) -> io::Result<()> {
    let Some(stash) = &request.options.stash else {
        return Ok(());
    };
    let bitmap = crate::parse_jsonc(&std::fs::read(request.root.join(".bitmap"))?)?;
    let existing = identities(&bitmap)?;
    let mut additions = Vec::new();
    let mut targets = Vec::new();
    let mut seen = HashSet::new();
    for entry in &stash.bitmap_entries {
        let Some((identity, version, row)) = addition(entry, &existing)? else {
            continue;
        };
        if !seen.insert(identity.clone()) {
            return Err(invalid("stash duplicate new identity"));
        }
        let mut row = row;
        targets.push(json!({"identity":identity,"directory":entry["rootDir"],"version":"","mainFile":entry["mainFile"],"config":null,"bitmapConfig":row["config"],"stashVersion":version}));
        row["stashVersion"] = json!(version);
        additions.push(row);
    }
    context["stashAdditions"] = json!(additions);
    context["stashAddedTargets"] = json!(targets);
    Ok(())
}

fn identities(bitmap: &Value) -> io::Result<HashSet<String>> {
    let rows = bitmap.as_object().ok_or_else(|| invalid("stash bitmap"))?;
    Ok(rows
        .iter()
        .filter(|(key, _)| !key.starts_with('$') && key.as_str() != "_bit_lane")
        .filter_map(|(_, row)| {
            let scope = row["scope"]
                .as_str()
                .filter(|scope| !scope.is_empty())
                .or_else(|| row["defaultScope"].as_str())?;
            Some(format!("{scope}/{}", row["name"].as_str()?))
        })
        .collect())
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
        let name = row["name"].as_str().ok_or_else(|| invalid("stash name"))?;
        let scope = row["defaultScope"].as_str().ok_or_else(|| invalid("stash default scope"))?;
        let identity = format!("{scope}/{name}");
        let hash = row["stashVersion"].as_str().ok_or_else(|| invalid("stash snapshot"))?;
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
        .filter(|scope| !scope.is_empty())
    else {
        return Ok(None);
    };
    let name = entry["id"]["name"].as_str().ok_or_else(|| invalid("stash new component name"))?;
    let original_scope = entry["id"]["scope"].as_str().unwrap_or(scope);
    if existing.contains(&format!("{original_scope}/{name}")) {
        return Ok(None);
    }
    let identity = format!("{scope}/{name}");
    let version = entry["id"]["version"].as_str().ok_or_else(|| invalid("stash new version"))?;
    crate::merge_history::hash(version)?;
    let mut row = json!({"name":name,"scope":"","version":"","defaultScope":scope,"mainFile":entry["mainFile"],"rootDir":entry["rootDir"]});
    if let Some(config) = entry.get("config") {
        row["config"] = config.clone();
    }
    Ok(Some((identity, version.to_owned(), row)))
}
