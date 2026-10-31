mod fields;
mod sort;
#[cfg(test)]
mod tests;

use super::invalid;
use crate::js_json::{Value as Js, stringify};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    left: Js,
    right: Js,
    workspace_root: bool,
    mode: String,
}
pub(super) fn plan(input: Value) -> io::Result<Value> {
    let request: Request = serde_json::from_value(input).map_err(io::Error::other)?;
    let left = request.left;
    let right = request.right;
    if request.mode == "sourceCode" {
        return source_code(left, right);
    }
    if request.mode != "modified" {
        return Err(invalid("unknown inspection compare mode"));
    }
    modified(left, right, request.workspace_root)
}

pub(crate) fn modified(mut left: Js, mut right: Js, workspace_root: bool) -> io::Result<Value> {
    let alignment = fields::align(&left, &mut right)?;
    let mut left_mutations = sort::all(&mut left)?;
    let mut right_mutations = sort::all(&mut right)?;
    if !workspace_root {
        fields::filter_bitmap(&mut left)?;
    }
    let left_semantic = crate::snapshot_projection::semantic(&left)?;
    let right_semantic = crate::snapshot_projection::semantic(&right)?;
    left_mutations["configAssignments"] =
        assignments(left_semantic.config_assignments, &left_mutations)?;
    right_mutations["configAssignments"] =
        assignments(right_semantic.config_assignments, &right_mutations)?;
    right_mutations["dependencyVersions"] = alignment["dependencyVersions"].clone();
    right_mutations["fileMetadata"] = alignment["fileMetadata"].clone();
    Ok(
        json!({"modified":left_semantic.hash!=right_semantic.hash,"leftHash":left_semantic.hash,"rightHash":right_semantic.hash,"mutations":{"left":left_mutations,"right":right_mutations}}),
    )
}
fn source_code(mut left: Js, mut right: Js) -> io::Result<Value> {
    let left_order =
        sort::rows(&mut left, "files", |row| fields::text(fields::get(row, "relativePath")))?;
    let right_order =
        sort::rows(&mut right, "files", |row| fields::text(fields::get(row, "relativePath")))?;
    let modified = stringify(fields::get(&left, "files"), false)?
        != stringify(fields::get(&right, "files"), false)?;
    Ok(
        json!({"modified":modified,"mutations":{"left":{"fileOrder":left_order},"right":{"fileOrder":right_order}}}),
    )
}

fn assignments(rows: Vec<(usize, Js)>, mutations: &Value) -> io::Result<Value> {
    let output = rows
        .into_iter()
        .map(|(index, config)| {
            let original = mutations["extensionOrder"][index]
                .as_u64()
                .ok_or_else(|| invalid("inspection extension permutation"))?;
            Ok((original, config))
        })
        .collect::<io::Result<Vec<_>>>()?;
    serde_json::to_value(output).map_err(io::Error::other)
}
