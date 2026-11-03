//! Reuse the native consumer documentation-cache proofs before running a component service.
//!
//! [`prepare`] computes [`CatDocs`] entries at [`Path`] roots for component [`Value`] records via [`cat_prepare`].
use super::{Value, invalid, json};
use crate::commands::add::docs::{CatDocs, cat_prepare};
use std::{io, path::Path};

/// Prepares [`CatDocs`] documentation-cache proofs for `components` ([`Value`]) in `root` ([`Path`]) via [`component_directory`] and [`normalize_file`], declining on cache misses.
pub(super) fn prepare(root: &Path, components: &[Value]) -> io::Result<Vec<CatDocs>> {
    components
        .iter()
        .map(|component| {
            let files = component["files"]
                .as_array()
                .ok_or_else(|| invalid("component service documentation files"))?;
            let directory = component_directory(component);
            let normalized = files
                .iter()
                .map(normalize_file)
                .collect::<Vec<_>>();
            let plan = cat_prepare(root, json!({"directory":directory,"files":normalized}))
                .ok_or_else(|| invalid("component service documentation cache"))?;
            if !plan.misses().is_empty() {
                return Err(invalid("component service semantic documentation parser"));
            }
            Ok(plan)
        })
        .collect()
}

/// Extracts the normalized `"directory"` or `"rootDir"` [`Value`] from `component`.
#[inline]
fn component_directory(component: &Value) -> Value {
    let (directory, root_dir) = (component.get("directory"), component.get("rootDir"));
    [directory.and_then(Value::as_str), root_dir.and_then(Value::as_str)]
        .into_iter()
        .flatten()
        .map(str::trim)
        .find(|dir| !dir.is_empty())
        .map_or_else(
            || {
                directory
                    .filter(|val| !val.is_null())
                    .or(root_dir)
                    .cloned()
                    .unwrap_or(Value::Null)
            },
            Value::from,
        )
}

/// Normalizes a component `file` [`Value`] entry into `{ "relativePath": ..., "test": ... }`.
#[inline]
fn normalize_file(file: &Value) -> Value {
    let path = [
        file.as_str(),
        file["relativePath"].as_str(),
        file["path"].as_str(),
        file["filePath"].as_str(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .find(|path| !path.is_empty());
    match path {
        Some(path) => json!({"relativePath":path,"test":file["test"] == true}),
        None => json!({"relativePath":file,"test":false}),
    }
}
