//! Repository reset pruning ([`Control`], [`prepare`], [`publish`], [`matches_identity`]) of selected `unmerged.json` entries while leaving workspace `Source` files untouched.
use super::invalid;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

/// Retained preimage/postimage byte pair for a scope control file (`unmerged.json`).
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct Control {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}

/// Prepares an `unmerged.json` [`Control`] update at `root` ([`Path`]) pruning entries matching `identities`.
pub(crate) fn prepare(root: &Path, identities: &[String]) -> io::Result<Vec<Control>> {
    if identities.is_empty() {
        return Ok(Vec::new());
    }
    let path = crate::scope_path(root).join("unmerged.json");
    let before = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    if before.len() > 4 * 1024 * 1024 {
        return Err(invalid("lane reset unmerged budget"));
    }
    let mut value: Value = crate::parse_jsonc(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("lane reset unmerged records"))?;
    let count = rows.len();
    rows.retain(|row| !matches_identity(row, identities));
    if count == rows.len() {
        return Ok(Vec::new());
    }
    let mut after = serde_json::to_vec_pretty(&value)?;
    after.push(b'\n');
    Ok(vec![Control { path, before, after }])
}

/// Returns `true` when `unmerged.json` `row` ([`Value`]) matches any bare component identity in `identities`.
fn matches_identity(row: &Value, identities: &[String]) -> bool {
    let (row_scope, row_name) = super::row_id_parts(&row["id"]);
    if row_name.is_empty() {
        return false;
    }
    identities
        .iter()
        .any(|id| {
            let trimmed = id.trim();
            let bare = trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim());
            bare.strip_prefix(row_scope)
                .and_then(|rest| rest.strip_prefix('/'))
                == Some(row_name)
                || (row_scope.is_empty()
                    && bare
                        .split_once('/')
                        .is_some_and(|(_, name)| name.trim() == row_name))
        })
}

/// Revalidates each [`Control`] file's preimage bytes and writes its updated postimage bytes.
pub(crate) fn publish(controls: &[Control]) -> io::Result<()> {
    for control in controls {
        if fs::read(&control.path)? != control.before {
            return Err(invalid("lane reset unmerged changed"));
        }
        fs::write(&control.path, &control.after)?;
    }
    Ok(())
}
