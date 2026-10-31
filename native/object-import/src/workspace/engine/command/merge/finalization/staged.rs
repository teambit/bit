use super::{Input, Prepared, invalid, json, pretty, proof};
use serde_json::{Value, json as value};
use std::{io, path::Path};

pub(super) fn prepare(
    root: &Path,
    inputs: &[Input<'_>],
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    let scope = crate::scope_path(root);
    let staged = scope.join("staged-snaps");
    let old = proof::read(&staged, &mut output.proofs)?;
    let mut hashes = match &old {
        Some(bytes) => std::str::from_utf8(bytes)
            .map_err(io::Error::other)?
            .split('\n')
            .map(|line| line.trim().to_owned())
            .collect::<Vec<_>>(),
        None => Vec::new(),
    };
    hashes.extend(
        inputs
            .iter()
            .map(|input| input.hash.trim().to_owned()),
    );
    output.writes.push((staged, hashes.join("\n").into_bytes()));
    if inputs
        .iter()
        .any(|input| !input.directory.is_empty())
    {
        config(root, inputs, snapshot, output)?;
    }
    let index = scope.join("index.json");
    // A scope that never stored a component has no index yet: `ComponentsIndex`
    // starts empty and writes it with the first components.
    let current = match proof::read(&index, &mut output.proofs)? {
        Some(bytes) => json(&bytes)?,
        None => value!({"components":[],"lanes":[]}),
    };
    output.writes.push((index, pretty(&current, true)?));
    Ok(())
}
fn config(
    root: &Path,
    inputs: &[Input<'_>],
    snapshot: bool,
    output: &mut Prepared,
) -> io::Result<()> {
    let bitmap = proof::read(&root.join(".bitmap"), &mut output.proofs)?
        .ok_or_else(|| invalid("merge bitmap missing"))?;
    let bitmap = crate::recovery::jsonc::parse(&bitmap)?;
    let identity = if let Some(lane) = bitmap.get("_bit_lane") {
        let (scope, name) =
            crate::workspace::engine::command::inbound::remote::file_list::row_scoped_id_parts(
                lane,
            )
            .ok_or_else(|| invalid("merge staged lane id"))?;
        format!("{scope}/{name}")
    } else {
        "main".to_owned()
    };
    crate::checkout::plan::relative_path(&identity)?;
    let path = crate::scope_path(root)
        .join("staged-config")
        .join(format!("{identity}.json"));
    let mut rows = proof::read(&path, &mut output.proofs)?
        .map(|bytes| json(&bytes))
        .transpose()?
        .unwrap_or_else(|| value!([]));
    for input in inputs
        .iter()
        .filter(|input| !input.directory.is_empty())
    {
        update(&mut rows, &bitmap, input, snapshot)?;
    }
    output.writes.push((path, pretty(&rows, false)?));
    Ok(())
}

pub(super) fn mark_lane_new(
    root: &Path,
    identities: &[String],
    output: &mut Prepared,
) -> io::Result<()> {
    if identities.is_empty() {
        return Ok(());
    }
    let staged_root = crate::scope_path(root).join("staged-config");
    let mut writes = output.writes
        .iter_mut()
        .filter(|(path, _)| path.starts_with(&staged_root));
    let (_, bytes) = writes.next().ok_or_else(|| invalid("snap staged lane config absent"))?;
    if writes.next().is_some() {
        return Err(invalid("snap staged lane config ambiguous"));
    }
    let mut rows = json(bytes)?;
    let rows_array = rows.as_array_mut().ok_or_else(|| invalid("snap staged lane rows"))?;
    for identity in identities {
        let (scope, name) =
            identity.split_once('/').ok_or_else(|| invalid("snap staged lane identity"))?;
        let row = rows_array
            .iter_mut()
            .find(|row| {
                crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                    row, scope, name,
                )
            })
            .ok_or_else(|| invalid("snap staged lane component absent"))?;
        let component = row["componentMapObject"]
            .as_object_mut()
            .ok_or_else(|| invalid("snap staged lane component map"))?;
        component.shift_remove("isAvailableOnCurrentLane");
        component.insert("onLanesOnly".into(), value!(true));
        component.insert("isAvailableOnCurrentLane".into(), value!(true));
    }
    *bytes = pretty(&rows, false)?;
    Ok(())
}
fn update(rows: &mut Value, bitmap: &Value, input: &Input<'_>, snapshot: bool) -> io::Result<()> {
    let (scope, name) =
        input.identity.split_once('/').ok_or_else(|| invalid("merge staged identity"))?;
    let rows = rows.as_array_mut().ok_or_else(|| invalid("merge staged config shape"))?;
    if rows.len() > 4096 {
        return Err(invalid("merge staged config budget"));
    }
    let entry = bitmap
        .as_object()
        .ok_or_else(|| invalid("merge staged bitmap"))?
        .values()
        .find(|entry| entry["rootDir"] == input.directory)
        .ok_or_else(|| invalid("merge staged bitmap component"))?;
    if !snapshot && entry.get("config").is_some() {
        return Err(invalid("merge staged configured component"));
    }
    if let Some(row) = rows
        .iter_mut()
        .find(|row| {
            crate::workspace::engine::command::inbound::remote::file_list::row_lane_matches(
                row, scope, name,
            )
        })
    {
        merge_config(row, entry)?;
        return Ok(());
    }
    let component_map = component_map(entry);
    let mut row = value!({"id":{"scope":scope,"name":name,"version":input.semantic_version.unwrap_or(input.hash)}});
    if let Some(config) = entry.get("config") {
        row["config"] = config.clone();
    }
    row["componentMapObject"] = Value::Object(component_map);
    rows.push(row);
    Ok(())
}

fn merge_config(row: &mut Value, entry: &Value) -> io::Result<()> {
    if let Some(config) = entry.get("config").and_then(Value::as_object) {
        let target = row
            .as_object_mut()
            .ok_or_else(|| invalid("snap staged row"))?
            .entry("config")
            .or_insert_with(|| Value::Object(serde_json::Map::new()));
        target
            .as_object_mut()
            .ok_or_else(|| invalid("snap staged config"))?
            .extend(config.clone());
    }
    Ok(())
}

fn component_map(entry: &Value) -> serde_json::Map<String, Value> {
    let mut component_map = serde_json::Map::new();
    for field in ["defaultScope", "mainFile", "rootDir", "wrapDir", "exported", "onLanesOnly"] {
        if let Some(value) = map_field(entry, field) {
            component_map.insert(field.to_owned(), value);
        }
    }
    component_map.insert("isAvailableOnCurrentLane".into(), value!(true));
    for field in ["nextVersion", "localOnly", "config"] {
        if let Some(value) = map_field(entry, field) {
            component_map.insert(field.to_owned(), value);
        }
    }
    component_map
}

fn map_field(entry: &Value, field: &str) -> Option<Value> {
    let value = entry
        .get(field)
        .filter(|value| !value.is_null())?;
    if matches!(field, "onLanesOnly" | "localOnly") && value == false {
        return None;
    }
    let mut value = value.clone();
    if field == "config" {
        clean_config(&mut value);
    }
    Some(value)
}

fn clean_config(value: &mut Value) {
    let Some(config) = value.as_object_mut() else { return };
    for aspect in config.values_mut().filter_map(Value::as_object_mut) {
        aspect.shift_remove("__specific");
    }
}
