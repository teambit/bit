use super::{Input, Prepared, invalid, json, pretty, proof};
use serde_json::{Value, json as value};
use std::{io, path::Path};

pub(super) fn prepare(root: &Path, inputs: &[Input<'_>], output: &mut Prepared) -> io::Result<()> {
    let scope = root.join(".bit");
    let staged = scope.join("staged-snaps");
    let old = proof::read(&staged, &mut output.proofs)?;
    let mut hashes = match &old {
        Some(bytes) => std::str::from_utf8(bytes)
            .map_err(io::Error::other)?
            .split('\n')
            .map(str::to_owned)
            .collect::<Vec<_>>(),
        None => Vec::new(),
    };
    hashes.extend(inputs.iter().map(|input| input.hash.to_owned()));
    output.writes.push((staged, hashes.join("\n").into_bytes()));
    if inputs
        .iter()
        .any(|input| !input.directory.is_empty())
    {
        config(root, inputs, output)?;
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
fn config(root: &Path, inputs: &[Input<'_>], output: &mut Prepared) -> io::Result<()> {
    let bitmap = proof::read(&root.join(".bitmap"), &mut output.proofs)?
        .ok_or_else(|| invalid("merge bitmap missing"))?;
    let bitmap = crate::recovery::jsonc::parse(&bitmap)?;
    let identity = if let Some(lane) = bitmap.get("_bit_lane") {
        let scope =
            lane["id"]["scope"].as_str().ok_or_else(|| invalid("merge staged lane scope"))?;
        let name = lane["id"]["name"].as_str().ok_or_else(|| invalid("merge staged lane name"))?;
        format!("{scope}/{name}")
    } else {
        "main".to_owned()
    };
    crate::checkout::plan::relative_path(&identity)?;
    let path = root
        .join(".bit/staged-config")
        .join(format!("{identity}.json"));
    let mut rows = proof::read(&path, &mut output.proofs)?
        .map(|bytes| json(&bytes))
        .transpose()?
        .unwrap_or_else(|| value!([]));
    for input in inputs
        .iter()
        .filter(|input| !input.directory.is_empty())
    {
        update(&mut rows, &bitmap, input)?;
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
    let staged_root = root.join(".bit/staged-config");
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
            .find(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
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
fn update(rows: &mut Value, bitmap: &Value, input: &Input<'_>) -> io::Result<()> {
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
    if entry.get("config").is_some() {
        return Err(invalid("merge staged configured component"));
    }
    if rows
        .iter()
        .any(|row| row["id"]["scope"] == scope && row["id"]["name"] == name)
    {
        return Ok(());
    }
    let mut component_map = serde_json::Map::new();
    for field in ["defaultScope", "mainFile", "rootDir", "wrapDir", "exported", "onLanesOnly"] {
        if let Some(value) = entry
            .get(field)
            .filter(|value| !value.is_null())
        {
            component_map.insert(field.to_owned(), value.clone());
        }
    }
    component_map.insert("isAvailableOnCurrentLane".into(), value!(true));
    rows.push(value!({"id":{"scope":scope,"name":name,"version":input.semantic_version.unwrap_or(input.hash)},"componentMapObject":component_map}));
    Ok(())
}
