//! Reuse the native consumer documentation-cache proofs before running a component service.
use super::{Value, invalid, json};
use crate::commands::add::docs::{CatDocs, cat_prepare};
use std::{io, path::Path};

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

fn component_directory(component: &Value) -> Value {
    component["directory"]
        .as_str()
        .or_else(|| component["rootDir"].as_str())
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .map_or_else(
            || {
                if component["directory"].is_null() {
                    component["rootDir"].clone()
                } else {
                    component["directory"].clone()
                }
            },
            Value::from,
        )
}

fn normalize_file(file: &Value) -> Value {
    let path = file
        .as_str()
        .or_else(|| file["relativePath"].as_str())
        .or_else(|| file["path"].as_str())
        .map(str::trim)
        .filter(|path| !path.is_empty());
    match path {
        Some(path) => json!({"relativePath":path,"test":file["test"] == true}),
        None => json!({"relativePath":file,"test":false}),
    }
}
