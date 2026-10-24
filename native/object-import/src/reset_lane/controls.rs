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
    let mut value: Value = serde_json::from_slice(&before)?;
    let rows = value.as_array_mut().ok_or_else(|| invalid("lane reset unmerged records"))?;
    let count = rows.len();
    rows.retain(|row| {
        !identities.contains(&format!(
            "{}/{}",
            row["id"]["scope"].as_str().unwrap_or_default(),
            row["id"]["name"].as_str().unwrap_or_default(),
        ))
    });
    if count == rows.len() {
        return Ok(Vec::new());
    }
    Ok(vec![Control { path, before, after: serde_json::to_vec_pretty(&value)? }])
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
