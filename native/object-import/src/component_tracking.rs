//! Retained component tracking plans publish the bitmap only after linking succeeds.
pub(crate) mod identity;
pub(crate) mod observe;

pub use options::Options;

mod files;
mod main_file;
mod options;
mod paths;
mod projection;
mod rows;
#[cfg(test)]
mod tests;

use observe::Observed;
use serde_json::{Value, json};
use std::{fs, io, path::Path};

/// The in-memory bitmap and component inventory consumed by the native linker.
pub struct Plan {
    root: std::path::PathBuf,
    cwd: std::path::PathBuf,
    before: Option<Vec<u8>>,
    bitmap: Value,
    components: Vec<Value>,
    warnings: Value,
    observed: Observed,
    dirty: bool,
}
impl Plan {
    /// Resolve selectors and retain all filesystem preimages without writing.
    pub fn prepare(root: &Path, cwd: &Path, options: &Options, facts: &Value) -> io::Result<Self> {
        let mut observed = Observed::default();
        observed.ancestors(root, root)?;
        let before = observed.read(&root.join(".bitmap"))?;
        let bitmap = before
            .as_deref()
            .map(crate::parse_jsonc)
            .transpose()?
            .unwrap_or_else(|| json!({"$schema-version":"17.0.0"}));
        observed.read(&root.join("workspace.jsonc"))?;
        let directories = paths::select(root, cwd, &options.paths, &mut observed)?;
        options.validate(&directories, &bitmap)?;
        for directory in &directories {
            observed.ancestors(root, &root.join(directory))?;
        }
        let mut plan = Self {
            root: root.to_owned(),
            cwd: cwd.to_owned(),
            before,
            bitmap,
            components: Vec::new(),
            warnings: json!({"alreadyUsed":{},"emptyDirectory":[],"existInScope":[]}),
            observed,
            dirty: false,
        };
        projection::prepare(&mut plan, &directories, options, facts)?;
        plan.validate()?;
        Ok(plan)
    }
    /// Projected bitmap; this must remain in memory until linking has succeeded.
    #[must_use]
    pub fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    /// Added component rows, including component-relative ordered source paths.
    #[must_use]
    pub fn components(&self) -> &[Value] {
        &self.components
    }
    /// Published already-used, empty-directory and out-of-sync warnings.
    #[must_use]
    pub fn warnings(&self) -> &Value {
        &self.warnings
    }
    /// Reject changes to retained files and directory entries before publication.
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    /// Persist exactly one bitmap history entry after the caller completes linking.
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        let trimmed_id = file_id.trim();
        if trimmed_id.is_empty()
            || matches!(trimmed_id, "." | "..")
            || trimmed_id.contains(['/', '\\', '\n', '\r', '\0'])
        {
            return Err(unsupported("tracking bitmap history identifier"));
        }
        if !self.dirty {
            return Ok(());
        }
        let after = crate::inspection::render_workspace_bitmap(&self.bitmap)?;
        if self.before.is_some() {
            // Consumer.backupBitMap logs backup failures and still publishes the bitmap.
            let _ = crate::component_remove::backup_bitmap(&self.root, trimmed_id, "add");
        }
        fs::write(self.root.join(".bitmap"), after)
    }
}
fn error(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
fn unsupported(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message.into())
}

fn active(row: &Value) -> bool {
    let removed = row["config"]
        .as_object()
        .and_then(|cfg| {
            cfg.get("teambit.component/remove")
                .or_else(|| {
                    cfg.iter()
                        .find_map(|(key, val)| {
                            key.starts_with("teambit.component/remove@").then_some(val)
                        })
                })
        })
        .is_some_and(|cfg| bit_workspace_config::truthy(&cfg["removed"]));
    row["isAvailableOnCurrentLane"] != false && !removed
}

/// Reuse tracked-file policy when an identity mutation reads an existing component.
pub(crate) fn source_inventory(
    root: &Path,
    directory: &str,
    bitmap: &Value,
    observed: &mut Observed,
) -> io::Result<Vec<String>> {
    let home = std::path::PathBuf::from(
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" }).unwrap_or_default(),
    );
    observed.read(&root.join("workspace.jsonc"))?;
    observed.read(&home.join(".bitrc.jsonc"))?;
    let workspace = crate::effective_workspace_configuration(root, &home)?;
    let mut plan = Plan {
        root: root.into(),
        cwd: root.into(),
        before: None,
        bitmap: bitmap.clone(),
        components: vec![],
        warnings: json!({}),
        observed: std::mem::take(observed),
        dirty: false,
    };
    let result = files::read(&mut plan, directory, &[], &json!({"workspace":workspace}));
    *observed = plan.observed;
    result
}
