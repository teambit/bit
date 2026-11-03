//! Retained source copies ([`Options`]) for `ForkingMain`; original files and model heads are never advanced.
pub use policy::dependency_policy;
pub use refactor::Refactor;
pub use remote::RemoteCapture;

mod configuration;
mod files;
mod identity;
mod policy;
mod refactor;
mod remote;
#[cfg(test)]
mod tests;

use crate::component_tracking::observe::Observed;
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

/// Validated CLI options for `bit fork` component creation.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub struct Options {
    pub source: String,
    pub target: Option<String>,
    pub scope: Option<String>,
    pub path: Option<String>,
    pub remote: bool,
    pub preserve: bool,
    pub ast: bool,
    pub no_link: bool,
}
/// File and control preimages remain owned until the caller publishes the copy.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Plan {
    root: PathBuf,
    identity: identity::Identity,
    bitmap: Value,
    before: Vec<u8>,
    observed: Observed,
    files: Vec<files::Copy>,
    materialized: bool,
    output: Observed,
}
impl Plan {
    /// Prepare a retained component fork [`Plan`] from [`Options`] and `source` without writing to disk.
    pub fn prepare(root: &Path, options: &Options, source: &Value) -> io::Result<Self> {
        if !root.is_absolute() {
            return Err(invalid("fork workspace root must be absolute"));
        }
        let mut observed = Observed::default();
        observed.ancestors(root, root)?;
        let before = required(&mut observed, &root.join(".bitmap"))?;
        let workspace = required(&mut observed, &root.join("workspace.jsonc"))?;
        let mut bitmap = crate::parse_jsonc(&before)?;
        let identity = identity::prepare(
            root,
            options,
            source,
            &bitmap,
            &crate::parse_jsonc(&workspace)?,
            &mut observed,
        )?;
        let files = files::prepare(root, options, source, &identity, &mut observed)?;
        configuration::insert(&mut bitmap, options, source, &identity)?;
        let plan = Self {
            root: root.into(),
            identity,
            bitmap,
            before,
            observed,
            files,
            materialized: false,
            output: Observed::default(),
        };
        plan.validate()?;
        Ok(plan)
    }
    /// Return the resolved scoped target identity (`"<scope>/<name>"`) of the forked component.
    #[must_use]
    #[inline]
    pub fn target_identity(&self) -> &str {
        &self.identity.target
    }
    /// Return the projected post-fork `.bitmap` JSON [`Value`].
    #[must_use]
    #[inline]
    pub const fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    /// Return the `.bitmap` aspect configuration [`Value`] inserted for the forked component.
    #[must_use]
    #[inline]
    pub fn configuration(&self) -> &Value {
        &self.bitmap[&self.identity.key]["config"]
    }
    /// Re-verify that all [`Observed`] workspace and source files match their captured preimages.
    #[inline]
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    pub fn apply_files(&mut self) -> io::Result<()> {
        self.validate()?;
        identity::destination(&self.root, &self.identity.directory, &mut Observed::default())?;
        files::apply(&self.files)?;
        self.output = Observed::default();
        files::retain_output(&self.root, &self.files, &mut self.output)?;
        self.materialized = true;
        Ok(())
    }
    /// Environment/config facts can be resolved after `Workspace.write` and before tracking.
    pub fn set_config(&mut self, config: Value) -> io::Result<()> {
        let Some(row) = self.bitmap.get_mut(&self.identity.key).and_then(Value::as_object_mut)
        else {
            return Err(unsupported("fork config must be an object"));
        };
        if !config.is_object() {
            return Err(unsupported("fork config must be an object"));
        }
        row.insert("config".into(), config);
        Ok(())
    }
    pub fn commit_bitmap(&self, file_id: &str) -> io::Result<()> {
        let file_id = file_id.trim();
        if file_id.is_empty() {
            return Err(invalid("fork bitmap file id is empty"));
        }
        crate::component_remove::validate_file_id(file_id)?;
        if !self.materialized {
            return Err(invalid("fork sources have not been materialized"));
        }
        self.observed.validate()?;
        self.output.validate()?;
        crate::component_deprecation::write_bitmap(
            &self.root,
            &self.before,
            &self.bitmap,
            file_id,
            &format!("adding {}", self.identity.target),
        )
    }
    #[must_use]
    pub fn target_materialized(&self) -> Value {
        let files: Vec<_> = self.files
            .iter()
            .map(|file| json!({"from":file.source,"to":file.destination}))
            .collect();
        json!({
            "identity": self.identity.target,
            "directory": self.identity.directory,
            "mainFile": self.identity.main,
            "files": files,
        })
    }
    #[must_use]
    pub fn ast_inputs(&self) -> Vec<(PathBuf, Vec<u8>)> {
        self.files
            .iter()
            .filter(|file| !crate::checkout::eol::binary(&file.bytes))
            .map(|file| (file.destination.clone(), file.bytes.clone()))
            .collect()
    }
    pub fn transformed(&mut self, path: &Path, bytes: Vec<u8>) -> io::Result<()> {
        if self.materialized {
            return Err(invalid("fork sources have already been materialized"));
        }
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(unsupported("fork transformed source limit"));
        }
        let file = self.files
            .iter_mut()
            .find(|file| file.destination == path)
            .ok_or_else(|| unsupported("fork transformed source path"))?;
        file.bytes = bytes;
        files::budget(&self.files)?;
        Ok(())
    }
}
#[inline]
fn required(observed: &mut Observed, path: &Path) -> io::Result<Vec<u8>> {
    observed
        .read(path)?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "fork source/control file"))
}
#[inline]
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
#[inline]
fn unsupported(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message.into())
}
