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
    config(root, inputs, output)?;
    let index = scope.join("index.json");
    let bytes = proof::read(&index, &mut output.proofs)?
        .ok_or_else(|| invalid("merge scope index missing"))?;
    output.writes.push((index, pretty(&json(&bytes)?, true)?));
    Ok(())
}
fn config(root: &Path, inputs: &[Input<'_>], output: &mut Prepared) -> io::Result<()> {
    let path = root.join(".bit/staged-config/main.json");
    let mut rows = proof::read(&path, &mut output.proofs)?
        .map(|bytes| json(&bytes))
        .transpose()?
        .unwrap_or_else(|| value!([]));
    let bitmap = proof::read(&root.join(".bitmap"), &mut output.proofs)?
        .ok_or_else(|| invalid("merge bitmap missing"))?;
    let bitmap = crate::recovery::jsonc::parse(&bitmap)?;
    for input in inputs {
        update(&mut rows, &bitmap, input)?;
    }
    output.writes.push((path, pretty(&rows, false)?));
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
    for field in ["defaultScope", "mainFile", "rootDir", "wrapDir", "exported"] {
        if let Some(value) = entry
            .get(field)
            .filter(|value| !value.is_null())
        {
            component_map.insert(field.to_owned(), value.clone());
        }
    }
    component_map.insert("isAvailableOnCurrentLane".into(), value!(true));
    rows.push(value!({"id":{"scope":scope,"name":name,"version":input.hash},"componentMapObject":component_map}));
    Ok(())
}
