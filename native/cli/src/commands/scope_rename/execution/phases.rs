use super::{Batch, Chalk, Entries, ProjectedLinker, Value, json, workspace_command};
use std::{io, path::Path};
pub(super) fn initial(
    root: &Path,
    entries: &mut Entries,
    linker: &mut ProjectedLinker,
    chalk: Chalk,
    output: &bit_install::output::Output,
    options: &bit_object_import::component_scope_rename::Options,
) -> io::Result<()> {
    let mut reloaded = false;
    for index in 0..entries.batch.len() {
        if reloaded {
            let source = entries.batch.plan(index)?.identity.source.clone();
            let rows = linker.capture(root, entries.batch.bitmap(), std::slice::from_ref(&source))?;
            print!("{}", linker.take_stdout());
            refresh(root, entries, index, &rows, linker)?;
        }
        entries.batch.stage(index)?;
        if entries.batch.plan(index)?.identity.exported {
            entries.batch.plan(index)?.apply_files()?;
            let target = requested(entries, index, options.owner)?;
            let added = entries.batch.added_identity(index)?;
            output.status("loading 1 component(s)");
            linker.link(root, entries.batch.bitmap(), std::slice::from_ref(&added), false, chalk)?;
            print!("{}", linker.take_stdout());
            entries.batch.write(&workspace_command::file_id(), &format!("adding {target}"))?;
            let components = load_added(root, entries.batch.bitmap(), &added, &target, linker)?;
            linker.call(
                root,
                "renameTooling",
                &json!({"action":"onAdd","ids":[target],"components":components,"progress":!options.owner,"defaultScoped":!options.owner}),
            )?;
            print!("{}", linker.take_stdout());
            if !options.deprecate {
                output.status("loading 1 component(s)");
            }
            reloaded = true;
        }
        let package = entries.facts[index]["sourcePackage"]
            .as_str()
            .ok_or_else(|| io::Error::other("scope rename source package"))?;
        entries.batch.retire(index, &workspace_command::file_id(), package)?;
    }
    Ok(())
}
fn load_added(
    root: &Path,
    bitmap: &Value,
    added: &String,
    requested: &str,
    linker: &mut ProjectedLinker,
) -> io::Result<Option<Vec<Value>>> {
    if added != requested {
        return Ok(None);
    }
    let rows = linker.capture(root, bitmap, std::slice::from_ref(added))?;
    print!("{}", linker.take_stdout());
    Ok(Some(rows))
}
pub(super) fn pairs(entries: &Entries) -> io::Result<Vec<(String, String)>> {
    entries.facts
        .iter()
        .map(|facts| {
            let source = facts["sourcePackage"]
                .as_str()
                .map(str::trim)
                .filter(|pkg| !pkg.is_empty())
                .ok_or_else(|| io::Error::other("scope rename source package"))?;
            let target = facts["targetPackage"]
                .as_str()
                .map(str::trim)
                .filter(|pkg| !pkg.is_empty())
                .ok_or_else(|| io::Error::other("scope rename target package"))?;
            Ok((source.into(), target.into()))
        })
        .collect()
}
pub(super) fn targets(
    root: &Path,
    entries: &mut Entries,
    linker: &mut ProjectedLinker,
) -> io::Result<Vec<String>> {
    let pairs = pairs(entries)?;
    let mut changed = Vec::new();
    for index in 0..entries.batch.len() {
        let target = entries.batch.plan(index)?.identity.target.clone();
        let rows =
            linker.capture_cached(root, entries.batch.bitmap(), std::slice::from_ref(&target))?;
        print!("{}", linker.take_stdout());
        if !entries.batch.plan(index)?.identity.exported
            && let Some(row) = rows
                .iter()
                .find(|row| row["identity"] == target)
            && entries.batch.target_load(index, row, &pairs)?
        {
            changed.push(target);
        }
    }
    Ok(changed)
}
pub(super) fn refactor(
    root: &Path,
    entries: &mut Entries,
    linker: &mut ProjectedLinker,
    output: &bit_install::output::Output,
    targets: &[String],
) -> io::Result<Vec<String>> {
    let bitmap = published_bitmap(root)?;
    let all = bitmap_ids(&bitmap)?;
    let order: Vec<String> =
        serde_json::from_value(linker.call(root, "identityListOrder", &json!({"ids":all}))?)?;
    output.status(&format!("loading {} component(s)", all.len()));
    let rows = linker.capture_cached(root, entries.batch.bitmap(), &all)?;
    print!("{}", linker.take_stdout());
    let mut changed = entries.batch.refactor_loaded(&rows, &pairs(entries)?)?;
    changed.extend_from_slice(targets);
    let changed = order_changed(&bitmap, &order, &changed)?;
    entries.batch.apply_refactored()?;
    entries.batch.write_refactored_targets(targets)?;
    linker.call(root, "identityMaterialized", &entries.batch.refactored_materialized())?;
    print!("{}", linker.take_stdout());
    Ok(changed)
}
pub(super) fn materialize(
    root: &Path,
    entries: &mut Entries,
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    for index in 0..entries.batch.len() {
        if entries.batch.plan(index)?.identity.exported {
            continue;
        }
        entries.batch.materialize(index, &workspace_command::file_id())?;
        linker.call(root, "identityMaterialized", &entries.batch.plan(index)?.materialized())?;
        print!("{}", linker.take_stdout());
    }
    Ok(())
}
pub(super) fn ids(batch: &Batch) -> io::Result<Vec<String>> {
    (0..batch.len())
        .map(|index| Ok(batch.plan(index)?.identity.target.clone()))
        .collect()
}
fn bitmap_ids(bitmap: &Value) -> io::Result<Vec<String>> {
    Ok(bitmap
        .as_object()
        .ok_or_else(|| io::Error::other("scope rename bitmap"))?
        .iter()
        .filter_map(|(key, row)| row_id(key, row))
        .collect())
}
fn row_id(key: &str, row: &Value) -> Option<String> {
    if key.starts_with('$') || key == "_bit_lane" || key == "version" || !row.is_object() {
        return None;
    }
    let removed =
        crate::commands::update_cmd::aspect_entry(&row["config"], "teambit.component/remove")
            .is_some_and(|(_, val)| val["removed"] == true);
    if removed || row["isAvailableOnCurrentLane"] == false {
        return None;
    }
    row["rootDir"].as_str()?;
    let (scope, name) = crate::commands::update_cmd::bitmap_row_scope_and_name(key, row);
    if scope.is_empty() || name.is_empty() {
        return None;
    }
    Some(format!("{scope}/{name}"))
}
fn order_changed(bitmap: &Value, order: &[String], changed: &[String]) -> io::Result<Vec<String>> {
    let rows = bitmap.as_object().ok_or_else(|| io::Error::other("scope rename bitmap"))?;
    Ok(order
        .iter()
        .filter_map(|id| {
            if !changed.contains(id) {
                return None;
            }
            let (key, row) = rows
                .iter()
                .find(|(key, row)| row_id(key, row).as_ref() == Some(id))?;
            Some(row_version_or_id(id, key, row))
        })
        .collect())
}
fn row_version_or_id(id: &str, key: &str, row: &Value) -> String {
    row["version"]
        .as_str()
        .filter(|version| !version.is_empty())
        .or_else(|| {
            key.rsplit_once('@')
                .map(|(_, ver)| ver)
                .filter(|ver| !ver.is_empty())
        })
        .map_or_else(|| id.to_owned(), |version| format!("{id}@{version}"))
}

fn requested(entries: &Entries, index: usize, owner: bool) -> io::Result<String> {
    let identity = &entries.batch.plan(index)?.identity;
    Ok(if owner {
        identity.source_version
            .as_deref()
            .map_or_else(
                || identity.target.clone(),
                |version| format!("{}@{version}", identity.target),
            )
    } else {
        identity.target.clone()
    })
}

fn refresh(
    root: &Path,
    entries: &mut Entries,
    index: usize,
    rows: &[Value],
    linker: &mut ProjectedLinker,
) -> io::Result<()> {
    let id = &entries.batch.plan(index)?.identity.source;
    let row = rows
        .iter()
        .find(|row| row["identity"] == *id)
        .ok_or_else(|| io::Error::other("scope rename reloaded source"))?;
    entries.facts[index]["sourceExtensions"] = row["current"]["extensions"].clone();
    entries.facts[index]["sourceVersion"] = row["version"].clone();
    if entries.batch.plan(index)?.identity.exported {
        entries.facts[index]["sourceConfigs"] =
            linker.call(root, "renameSourceConfig", &json!({"component":row}))?;
        print!("{}", linker.take_stdout());
    }
    let component = entries.facts[index]["components"]
        .as_array_mut()
        .and_then(|components| {
            components
                .iter_mut()
                .find(|component| component["identity"] == *id)
        })
        .ok_or_else(|| io::Error::other("scope rename source inventory"))?;
    component["sourceOverlayRoot"] = row["sourceOverlayRoot"].clone();
    component["sourceOverlays"] = row["sourceOverlays"].clone();
    entries.batch.refresh(index, &entries.facts[index])
}

fn published_bitmap(root: &Path) -> io::Result<Value> {
    bit_object_import::parse_jsonc(&std::fs::read(root.join(".bitmap"))?)
}
