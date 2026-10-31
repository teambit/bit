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
            let directory = if component["directory"].is_null() {
                &component["rootDir"]
            } else {
                &component["directory"]
            };
            let normalized = files
                .iter()
                .map(|file| {
                    let path = file
                        .as_str()
                        .or_else(|| file["relativePath"].as_str())
                        .or_else(|| file["path"].as_str());
                    match path {
                        Some(path) => json!({"relativePath":path,"test":file["test"] == true}),
                        None => json!({"relativePath":file,"test":false}),
                    }
                })
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
