//! Repository reset removes only selected unmerged entries; workspace Sources stay untouched.
use super::invalid;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

#[derive(Clone, PartialEq)]
pub(crate) struct Control {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}

pub(crate) fn prepare(root: &Path, identities: &[String]) -> io::Result<Vec<Control>> {
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
    Ok(vec![Control { path, before, after: serde_json::to_vec_pretty(&value)? }])
}

fn matches_identity(row: &Value, identities: &[String]) -> bool {
    let (row_scope, row_name) = super::row_id_parts(&row["id"]);
    let candidate = format!("{row_scope}/{row_name}");
    identities
        .iter()
        .any(|id| {
            let trimmed = id.trim();
            trimmed == candidate
                || (row_scope.is_empty()
                    && trimmed
                        .split_once('/')
                        .is_some_and(|(_, name)| name.trim() == row_name))
        })
}

pub(crate) fn publish(controls: &[Control]) -> io::Result<()> {
    for control in controls {
        if fs::read(&control.path)? != control.before {
            return Err(invalid("lane reset unmerged changed"));
        }
        fs::write(&control.path, &control.after)?;
    }
    Ok(())
}
