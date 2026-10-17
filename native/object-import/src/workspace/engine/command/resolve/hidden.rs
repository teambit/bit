use super::{
    super::{
        capture, invalid, repository,
        resolve_snapshot::{Material, Participation, VersionState},
    },
    Retained, selection,
};
use crate::workspace::{engine::status_models::harmony, snapshots};
use serde_json::Value;
use std::{collections::HashSet, io};

pub(super) fn append(
    retained: &mut Retained,
    materials: &mut Vec<Material>,
    snapshots: &mut snapshots::State,
) -> io::Result<()> {
    let Some(lane) = retained.record.context["lane"]["current"].as_object() else { return Ok(()) };
    let entries = crate::command_import::lane::entries(&lane["value"])?;
    let selected = materials
        .iter()
        .filter(|row| row.participation.selected)
        .map(|row| (row.identity.clone(), row.version_state.current_head.clone()))
        .collect::<Vec<_>>();
    let visible: HashSet<_> = materials
        .iter()
        .map(|row| row.identity.clone())
        .collect();
    let mut candidates = Vec::new();
    for entry in entries
        .into_iter()
        .filter(|entry| entry.hidden && !visible.contains(&entry.identity))
    {
        let version = retained.record.repository.read(&entry.head, "Version")?;
        let mut version = harmony::project(&version)?;
        enrich_packages(&mut version)?;
        saved::validate(&entry, &version, &mut retained.record.repository)?;
        candidates.push((entry, version));
    }
    // GraphIds.predecessors is keyed by exact version, unlike workspace autotag.
    // Its union preserves selected seed order then lane graph insertion order.
    let mut chosen = HashSet::new();
    for (identity, head) in selected {
        for (entry, version) in &candidates {
            if !depends_on(version, &identity, &head) || !chosen.insert(entry.identity.clone()) {
                continue;
            }
            materials.push(material(retained, entry, version, snapshots)?);
        }
    }
    Ok(())
}

pub(super) fn depends_on(version: &Value, identity: &str, head: &str) -> bool {
    let matches = |id: &Value| {
        selection::identity(id).ok().as_deref() == Some(identity) && id["version"] == head
    };
    ["dependencies", "devDependencies"]
        .iter()
        .any(|field| {
            version[*field]
                .as_array()
                .into_iter()
                .flatten()
                .any(|dep| matches(&dep["id"]))
        })
        || version["extensions"]
            .as_array()
            .into_iter()
            .flatten()
            .any(|extension| matches(&extension["extensionId"]))
}

fn material(
    retained: &mut Retained,
    entry: &crate::command_import::lane::Entry,
    version: &Value,
    snapshots: &mut snapshots::State,
) -> io::Result<Material> {
    let model = repository::model(&retained.record.context, &entry.identity)?
        .ok_or_else(|| invalid("resolve hidden model"))?;
    let captured = capture::from_model(
        &crate::scope_path(&retained.record.request.root).join("native-resolve-retained"),
        &entry.identity,
        &entry.head,
        version,
        &mut retained.record.repository,
        snapshots,
    )?;
    Ok(Material {
        identity: entry.identity.clone(),
        model,
        version: version.clone(),
        files: captured.files
            .as_array()
            .ok_or_else(|| invalid("resolve hidden files"))?
            .clone(),
        version_state: VersionState { current_head: entry.head.clone(), tagged_version: None },
        pending: retained.pending
            .iter()
            .find(|pending| {
                selection::identity(&pending["id"]).ok().as_ref() == Some(&entry.identity)
            })
            .cloned(),
        hidden: true,
        participation: Participation { selected: false, automatic: true },
    })
}

fn enrich_packages(version: &mut Value) -> io::Result<()> {
    let entries = version["extensions"]
        .as_array()
        .into_iter()
        .flatten()
        .find(|row| row["name"] == "teambit.dependencies/dependency-resolver")
        .and_then(|row| row["data"]["dependencies"].as_array())
        .cloned()
        .unwrap_or_default();
    for field in ["dependencies", "devDependencies"] {
        for dependency in version[field]
            .as_array_mut()
            .into_iter()
            .flatten()
        {
            enrich_package(dependency, &entries)?;
        }
    }
    Ok(())
}

fn enrich_package(dependency: &mut Value, entries: &[Value]) -> io::Result<()> {
    if dependency["packageName"]
        .as_str()
        .is_some_and(|name| !name.is_empty())
    {
        return Ok(());
    }
    let identity = selection::identity(&dependency["id"])?;
    let version = dependency["id"]["version"]
        .as_str()
        .ok_or_else(|| invalid("resolve hidden dependency version"))?;
    let id = format!("{identity}@{version}");
    if let Some(name) = entries
        .iter()
        .find(|entry| entry["id"] == id)
        .and_then(|entry| entry.get("packageName"))
    {
        dependency["packageName"] = name.clone();
    }
    Ok(())
}

#[cfg(test)]
mod tests;

mod saved;
