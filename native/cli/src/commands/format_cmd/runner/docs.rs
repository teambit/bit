//! Reuse the native consumer documentation-cache proofs before formatting source files.
use super::{Value, invalid, json};
use crate::commands::add::docs::{CatDocs, cat_prepare};
use std::{io, path::Path};

pub(super) fn prepare(root: &Path, components: &[Value]) -> io::Result<Vec<CatDocs>> {
    components.iter().map(|component| {
        let files = component["files"].as_array().ok_or_else(|| invalid("formatter documentation files"))?;
        let plan = cat_prepare(root, json!({"directory":component["directory"],"files":files.iter().map(|file| json!({"relativePath":file,"test":false})).collect::<Vec<_>>()}))
            .ok_or_else(|| invalid("formatter documentation cache"))?;
        if !plan.misses().is_empty() {
            return Err(invalid("formatter semantic documentation parser"));
        }
        Ok(plan)
    }).collect()
}
