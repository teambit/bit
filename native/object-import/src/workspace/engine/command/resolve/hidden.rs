use super::{
    super::{
        capture, invalid, repository,
        resolve_snapshot::{Material, Participation, VersionState},
    },
    Plan, Retained, cascade, selection,
};
use crate::workspace::{engine::status_models::harmony, snapshots};
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// `getLaneAutoTagIdsFromScope`: direct consumer dependencies use workspace cascade rules.
pub(super) fn append(
    retained: &mut Retained,
    materials: &mut Vec<Material>,
    snapshots: &mut snapshots::State,
    input: &Plan,
) -> io::Result<Vec<Value>> {
    let Some(lane) = retained.record.context["lane"]["current"].as_object() else {
        return Ok(Vec::new());
    };
    let entries = crate::command_import::lane::entries(&lane["value"])?;
    let selected = materials
        .iter()
        .filter(|row| {
            row.participation.selected && !super::super::resolve_snapshot::is_removed(&row.version)
        })
        .map(|row| row.identity.clone())
        .collect::<Vec<_>>();
    if selected.is_empty() {
        return Ok(Vec::new());
    }
    let visible = materials
        .iter()
        .map(|row| row.identity.clone())
        .collect::<HashSet<_>>();
    let candidates = candidates(retained, entries, &visible)?;
    let reports = reports(&candidates, &input.current, &selected, &input.semver)?;
    for report in &reports {
        let (entry, version) = candidates
            .iter()
            .find(|(entry, _)| report["id"] == entry.identity)
            .ok_or_else(|| invalid("hidden cascade candidate"))?;
        materials.push(material(retained, entry, version, snapshots)?);
    }
    Ok(reports)
}

fn candidates(
    retained: &mut Retained,
    entries: Vec<crate::command_import::lane::Entry>,
    visible: &HashSet<String>,
) -> io::Result<Vec<(crate::command_import::lane::Entry, Value)>> {
    let mut candidates = Vec::new();
    for entry in entries
        .into_iter()
        .filter(|entry| entry.hidden && !visible.contains(&entry.identity))
    {
        let version = retained.record.repository.read(&entry.head, "Version")?;
        let mut version = harmony::project(&version)?;
        if super::super::resolve_snapshot::is_removed(&version) {
            continue;
        }
        enrich_packages(&mut version)?;
        candidates.push((entry, version));
    }
    Ok(candidates)
}

fn reports(
    candidates: &[(crate::command_import::lane::Entry, Value)],
    current: &[Value],
    selected: &[String],
    semver: &Value,
) -> io::Result<Vec<Value>> {
    let mut rows = candidates.iter().map(|(entry, version)| {
        json!({"identity":entry.identity,"version":entry.head,"current":version})
    }).collect::<Vec<_>>();
    for identity in selected {
        let row = current
            .iter()
            .find(|row| row["identity"] == *identity)
            .ok_or_else(|| invalid("hidden cascade trigger"))?;
        // Changed IDs are graph nodes, but their own dependencies are not scope candidates.
        rows.push(json!({"identity":identity,"version":row["version"],"current":{}}));
    }
    cascade::reports(&rows, &[], selected, semver)
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
        .find(|row| {
            crate::workspace::engine::client_status::config::is_extension_aspect(
                row,
                "teambit.dependencies/dependency-resolver",
            )
        })
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
