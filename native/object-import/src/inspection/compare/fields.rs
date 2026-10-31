#[cfg(test)]
#[path = "fields/tests.rs"]
mod tests;

use super::super::invalid;
use crate::js_json::Value as Js;
use serde_json::{Value, json};
use std::{collections::HashMap, io};

pub(super) fn get<'a>(value: &'a Js, key: &str) -> &'a Js {
    static MISSING: Js = Js::Undefined;
    if let Js::Object(fields) = value {
        for (name, value) in fields {
            if name
                .iter()
                .copied()
                .eq(key.encode_utf16())
            {
                return value;
            }
        }
    }
    &MISSING
}
pub(super) fn set(value: &mut Js, key: &str, new: Js) -> io::Result<()> {
    let Js::Object(fields) = value else {
        return Err(invalid("inspection expected object"));
    };
    if let Some((_, value)) = fields
        .iter_mut()
        .find(|(name, _)| {
            name.iter()
                .copied()
                .eq(key.encode_utf16())
        })
    {
        *value = new;
    } else {
        fields.push((key.encode_utf16().collect(), new));
    }
    Ok(())
}
pub(super) fn text(value: &Js) -> io::Result<Vec<u16>> {
    if let Js::String(text) = value {
        Ok(text.clone())
    } else {
        Err(invalid("inspection expected string"))
    }
}
pub(super) fn array(value: &Js) -> io::Result<&[Js]> {
    if let Js::Array(rows) = value { Ok(rows) } else { Err(invalid("inspection expected array")) }
}
pub(super) fn id(value: &Js, version: bool) -> io::Result<Vec<u16>> {
    let name = text(get(value, "name"))?;
    let mut out = Vec::new();
    if let Js::String(scope) = get(value, "scope")
        && !scope.is_empty()
    {
        out.extend(scope);
        out.push(u16::from(b'/'));
    }
    out.extend(name);
    if version
        && let Js::String(version) = get(value, "version")
        && !version.is_empty()
    {
        out.push(u16::from(b'@'));
        out.extend(version);
    }
    Ok(out)
}
pub(super) fn align(left: &Js, right: &mut Js) -> io::Result<Value> {
    let mut versions = Vec::new();
    for field in ["dependencies", "devDependencies"] {
        let model = array(get(left, field))?;
        let mut current = array(get(right, field))?.to_vec();
        for (index, row) in current.iter_mut().enumerate() {
            if let Some(model_index) = align_dependency(row, model)? {
                versions.push(json!({"field":field,"index":index,"modelIndex":model_index}));
            }
        }
        set(right, field, Js::Array(current))?;
    }
    let metadata = align_files(left, right)?;
    Ok(json!({"dependencyVersions":versions,"fileMetadata":metadata}))
}
fn file_positions(model: &[Js]) -> HashMap<Vec<u16>, usize> {
    let mut positions = HashMap::new();
    for (index, row) in model.iter().enumerate() {
        if let Ok(path) = text(get(row, "relativePath")) {
            positions.entry(path).or_insert(index);
        }
    }
    positions
}
fn align_files(left: &Js, right: &mut Js) -> io::Result<Vec<Value>> {
    let model = array(get(left, "files"))?;
    let current_slice = array(get(right, "files"))?;
    if model.len() > 4096 || current_slice.len() > 4096 {
        return Err(invalid("inspection compare row budget"));
    }
    let mut current = current_slice.to_vec();
    let mut metadata = Vec::new();
    let positions = file_positions(model);
    for (index, row) in current.iter_mut().enumerate() {
        let path = text(get(row, "relativePath"))?;
        if let Some(&model_index) = positions.get(&path) {
            let other = &model[model_index];
            for field in ["name", "test"] {
                set(row, field, get(other, field).clone())?;
            }
            metadata.push(json!({"index":index,"modelIndex":model_index}));
        }
    }
    set(right, "files", Js::Array(current))?;
    Ok(metadata)
}
pub(super) fn filter_bitmap(value: &mut Js) -> io::Result<()> {
    let files = array(get(value, "files"))?
        .iter()
        .filter(|row| {
            !matches!(
                get(row, "relativePath"),
                Js::String(path) if path.iter().copied().eq(".bitmap".encode_utf16()),
            )
        })
        .cloned()
        .collect();
    set(value, "files", Js::Array(files))
}

fn align_dependency(row: &mut Js, model: &[Js]) -> io::Result<Option<usize>> {
    if get(get(row, "id"), "version").truthy()? {
        return Ok(None);
    }
    let key = id(get(row, "id"), false)?;
    for (index, other) in model.iter().enumerate() {
        if id(get(other, "id"), false)? == key {
            set(row, "id", get(other, "id").clone())?;
            return Ok(Some(index));
        }
    }
    Ok(None)
}
