//! A reset can discard unparseable working files only when their retained hashes
//! prove a change independently of dependency metadata. Equal files still need
//! the full semantic comparison; this is never a substitute dependency graph.
#[cfg(test)]
mod tests;
use super::super::invalid;
use serde_json::Value;
use std::{collections::BTreeMap, io};

pub(super) fn incomplete(current: &Value) -> bool {
    current
        .as_object()
        .is_some_and(|fields| fields.len() == 1 && fields.contains_key("mainFile"))
}

pub(super) fn prove_changed(current: &Value, version: &Value) -> io::Result<()> {
    if files(current, false)? == files(&version["files"], true)? {
        return Err(invalid("reset unchanged Sources require complete metadata"));
    }
    Ok(())
}

fn files(value: &Value, model: bool) -> io::Result<BTreeMap<&str, &str>> {
    let mut files = BTreeMap::new();
    for row in value.as_array().ok_or_else(|| invalid("reset Source comparison files"))? {
        let path =
            row["relativePath"].as_str().ok_or_else(|| invalid("reset Source comparison path"))?;
        // The canonical comparison ignores a stored bitmap outside workspace-root components.
        if model && path == ".bitmap" {
            continue;
        }
        let hash = row["file"].as_str().ok_or_else(|| invalid("reset Source comparison hash"))?;
        crate::merge_history::hash(hash)?;
        if files.insert(path, hash).is_some() {
            return Err(invalid("reset duplicate Source comparison path"));
        }
    }
    Ok(files)
}
