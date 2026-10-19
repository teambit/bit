//! A fetched switch adds a local alias only when that remote lane is not already tracked.
use super::{Id, PreparedImport, invalid};
use serde_json::{Value, json};
use std::{fs, io, path::PathBuf};

pub(crate) struct SwitchTracking {
    path: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
}
impl SwitchTracking {
    pub(crate) fn validate(&self) -> io::Result<()> {
        if read(&self.path)? != self.before {
            return Err(invalid("switch tracking configuration changed"));
        }
        Ok(())
    }
    pub(crate) fn commit(&self) -> io::Result<Value> {
        self.validate()?;
        super::super::publish::write_file(&self.path, &self.after)?;
        if read(&self.path)? != self.after {
            return Err(invalid("switch tracking publication changed"));
        }
        Ok(super::super::write_receipt(&self.path, Some(&self.before), &self.after))
    }
}

impl PreparedImport {
    pub(crate) fn defer_switch_tracking(&mut self) -> io::Result<Option<SwitchTracking>> {
        let Some(after) = self.writes.switch_tracking.take() else { return Ok(None) };
        let path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("switch scope directory"))?
            .join("scope.json");
        let before = self.capture
            .read(&path)?
            .ok_or_else(|| invalid("switch scope configuration missing"))?;
        Ok(Some(SwitchTracking { path, before, after }))
    }

    pub(crate) fn stage_switch_tracking_alias(
        &mut self,
        id: &Id,
        alias: Option<&str>,
    ) -> io::Result<()> {
        id.validate()?;
        if id.is_main() {
            return Ok(());
        }
        let path = self.environment.local_directory
            .parent()
            .ok_or_else(|| invalid("switch scope directory"))?
            .join("scope.json");
        let mut scope = self.capture
            .json(&path)?
            .ok_or_else(|| invalid("switch scope configuration missing"))?;
        if scope.get("lanes").is_none() {
            scope["lanes"] = json!({"current":"main","tracking":[],"new":[]});
        }
        if append(
            &mut scope,
            id,
            alias
                .filter(|alias| !alias.is_empty())
                .unwrap_or(&id.name),
        )? {
            self.writes.switch_tracking = Some(bit_workspace_config::render_scope_json(&scope)?);
        }
        Ok(())
    }
}
fn read(path: &std::path::Path) -> io::Result<Vec<u8>> {
    let metadata = fs::symlink_metadata(path)?;
    if !metadata.is_file() || metadata.file_type().is_symlink() {
        return Err(invalid("switch tracking file shape"));
    }
    crate::read_budget::Budget::new(32 * 1024 * 1024).read(fs::File::open(path)?)
}
fn append(scope: &mut Value, id: &Id, alias: &str) -> io::Result<bool> {
    let tracking = scope["lanes"]["tracking"]
        .as_array_mut()
        .ok_or_else(|| invalid("switch lane tracking configuration"))?;
    if tracking.len() >= 4096 {
        return Err(invalid("switch lane tracking budget"));
    }
    if tracking
        .iter()
        .any(|row| row["remoteLane"] == id.name && row["remoteScope"] == id.scope)
    {
        return Ok(false);
    }
    if let Some(row) = tracking
        .iter_mut()
        .find(|row| row["localLane"] == alias)
    {
        row["remoteLane"] = json!(id.name);
        row["remoteScope"] = json!(id.scope);
    } else {
        tracking.push(json!({"localLane":alias,"remoteLane":id.name,"remoteScope":id.scope}));
    }
    Ok(true)
}

#[cfg(test)]
mod tests;
