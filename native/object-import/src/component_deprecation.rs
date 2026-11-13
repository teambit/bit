//! Native deprecation metadata edits ([`Plan`]); source files and model objects remain unchanged.
pub(crate) mod selection;
mod state;
#[cfg(test)]
mod tests;

use serde_json::{Value, json};
use std::{
    fs, io,
    path::{Path, PathBuf},
};
/// Canonical aspect ID (`"teambit.component/deprecation"`) for component deprecation metadata.
const ASPECT: &str = "teambit.component/deprecation";

/// Retained `.bitmap` and observation plan for component deprecation or undeprecation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    root: PathBuf,
    before: Vec<u8>,
    bitmap: Value,
    changed: Vec<String>,
    unchanged: Vec<String>,
    reason: String,
    loads: Vec<String>,
    proofs: crate::component_tracking::observe::Observed,
}
impl Plan {
    /// Prepare a deprecation or undeprecation [`Plan`] at [`Path`] `root` for components matching `pattern`.
    pub fn prepare(
        root: &Path,
        pattern: &str,
        replacement: Option<&str>,
        range: Option<&str>,
        undo: bool,
    ) -> io::Result<Self> {
        let mut proofs = crate::component_tracking::observe::Observed::default();
        proofs.ancestors(root, root)?;
        let pattern = pattern.trim();
        let before = proofs
            .read(&root.join(".bitmap"))?
            .ok_or_else(|| invalid("component bitmap missing"))?;
        let bitmap = crate::parse_jsonc(&before)?;
        let selected = selection::select(&bitmap, pattern)?;
        let replacement = replacement
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let range = range
            .map(str::trim)
            .filter(|value| !value.is_empty());
        if replacement.is_some() && selected.len() > 1 {
            return Err(invalid(format!(
                "--new-id sets a single replacement component, but the pattern \"{pattern}\" matched {} components.\nrun the command per-component to use --new-id, or remove it to deprecate them all",
                selected.len(),
            )));
        }
        let replacement = replacement.map(|id| selection::resolve(&bitmap, id)).transpose()?;
        validate_range(range)?;
        let mut plan = Self {
            root: root.into(),
            before,
            bitmap,
            changed: vec![],
            unchanged: vec![],
            loads: vec![],
            reason: format!("{} {pattern}", if undo { "undeprecate" } else { "deprecate" }),
            proofs,
        };
        let selected =
            if pattern == "$deprecated" { plan.deprecated_ids(selected)? } else { selected };
        plan.project(selected, replacement.as_deref(), range, undo)?;
        Ok(plan)
    }
    /// Return the slice of component IDs whose `ASPECT` deprecation metadata changed in this [`Plan`].
    #[must_use]
    #[inline]
    pub fn changed(&self) -> &[String] {
        &self.changed
    }
    /// Return the slice of matched component IDs whose deprecation metadata was already in the target [`Plan`] state.
    #[must_use]
    #[inline]
    pub fn unchanged(&self) -> &[String] {
        &self.unchanged
    }
    /// Return the projected `.bitmap` JSON [`Value`] after applying deprecation edits.
    #[must_use]
    #[inline]
    pub const fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    #[inline]
    pub fn original_bitmap(&self) -> io::Result<Value> {
        crate::parse_jsonc(&self.before)
    }
    #[must_use]
    #[inline]
    pub fn hydration_ids(&self) -> &[String] {
        &self.loads
    }
    #[inline]
    pub fn validate(&self) -> io::Result<()> {
        if fs::read(self.root.join(".bitmap"))? != self.before {
            return Err(invalid("component bitmap changed before deprecation"));
        }
        self.proofs.validate()?;
        Ok(())
    }
    #[inline]
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        if self.changed.is_empty() || self.bitmap == crate::parse_jsonc(&self.before)? {
            return Ok(());
        }
        write_bitmap(&self.root, &self.before, &self.bitmap, file_id, &self.reason)
    }
    fn deprecated_ids(&mut self, ids: Vec<String>) -> io::Result<Vec<String>> {
        let mut selected = vec![];
        for id in ids {
            if state::metadata(self, &id)?["deprecate"] == true {
                selected.push(id);
            }
        }
        Ok(selected)
    }
    fn project(
        &mut self,
        ids: Vec<String>,
        replacement: Option<&str>,
        range: Option<&str>,
        undo: bool,
    ) -> io::Result<()> {
        for id in ids {
            if undo && state::requires_hydration(&self.bitmap, &id)? {
                self.loads.push(
                    id.split('@')
                        .next()
                        .unwrap_or(&id)
                        .to_owned(),
                );
            }
            let metadata = state::metadata(self, &id)?;
            if unchanged(&metadata, replacement, range, undo) {
                self.unchanged.push(id);
            } else {
                set_config(&mut self.bitmap, &id, replacement, range, undo)?;
                self.changed.push(id);
            }
        }
        Ok(())
    }
}
fn unchanged(metadata: &Value, replacement: Option<&str>, range: Option<&str>, undo: bool) -> bool {
    let deprecated = metadata["deprecate"].as_bool() == Some(true);
    if undo {
        !deprecated
            && metadata["range"]
                .as_str()
                .is_none_or(|value| value.trim().is_empty())
    } else {
        deprecated
            && replacement.is_none_or(|val| val.trim().is_empty())
            && range.is_none_or(|val| val.trim().is_empty())
    }
}
pub fn set_config(
    bitmap: &mut Value,
    identity: &str,
    replacement: Option<&str>,
    range: Option<&str>,
    undo: bool,
) -> io::Result<()> {
    let key = selection::key(bitmap, identity)?.to_owned();
    let replacement = replacement
        .map(str::trim)
        .filter(|val| !val.is_empty())
        .map(|id| selection::id_object(bitmap, id))
        .transpose()?;
    let range = range
        .map(str::trim)
        .filter(|val| !val.is_empty());
    let row = &mut bitmap[&key];
    if !row["config"].is_object() {
        row["config"] = json!({});
    }
    if let Some(cfg) = row["config"].as_object_mut() {
        cfg.retain(|cfg_key, _| {
            !cfg_key
                .strip_prefix(ASPECT)
                .is_some_and(|rest| rest.starts_with('@'))
        });
    }
    let mut config = json!({"deprecate":!undo && range.is_none()});
    if undo {
        config["newId"] = json!("");
    } else if let Some(id) = replacement {
        config["newId"] = id;
    }
    if let Some(range) = range {
        config["range"] = json!(range);
    }
    row["config"][ASPECT] = config;
    Ok(())
}
pub fn write_bitmap(
    root: &Path,
    before: &[u8],
    bitmap: &Value,
    file_id: &str,
    reason: &str,
) -> io::Result<()> {
    crate::component_remove::validate_file_id(file_id)?;
    if fs::read(root.join(".bitmap"))? != before {
        return Err(invalid("component bitmap changed before publication"));
    }
    let after = crate::inspection::render_workspace_bitmap(bitmap)?;
    crate::component_remove::backup_bitmap(root, file_id, reason)?;
    fs::write(root.join(".bitmap"), after)
}
fn validate_range(range: Option<&str>) -> io::Result<()> {
    if let Some(range) = range {
        if range.len() > 4096 {
            return Err(invalid("deprecation range exceeds maximum length"));
        }
        node_semver::Range::parse(range).map_err(|_| invalid(format!(r#"the range "{range}" is invalid. see https://www.npmjs.com/package/semver#ranges for the range syntax"#)))?;
    }
    Ok(())
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
