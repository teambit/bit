//! Retained path relocation with links preceding bitmap publication.
mod order;
mod paths;
mod project;
#[cfg(test)]
mod tests;
use crate::component_tracking::observe::Observed;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct Plan {
    root: PathBuf,
    before: Vec<u8>,
    bitmap: Value,
    changes: Vec<Value>,
    source: PathBuf,
    destination: PathBuf,
    physical: bool,
    observed: Observed,
}
impl Plan {
    pub fn prepare(root: &Path, cwd: &Path, from: &str, to: &str) -> io::Result<Self> {
        let (source, destination, physical) = paths::locations(root, cwd, from, to)?;
        let mut observed = Observed::default();
        let before = observed
            .read(&root.join(".bitmap"))?
            .ok_or_else(|| invalid("component bitmap missing"))?;
        let mut bitmap = crate::parse_jsonc(&before)?;
        let changes = project::apply(root, &mut bitmap, &source, &destination, &mut observed)?;
        let existing = if physical { &source } else { &destination };
        paths::observe_tree(root, existing, &mut observed)?;
        paths::observe_parents(root, &source, &destination, &mut observed)?;
        Ok(Self {
            root: root.into(),
            before,
            bitmap,
            changes,
            source,
            destination,
            physical,
            observed,
        })
    }
    #[must_use]
    pub fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    #[must_use]
    pub fn changes(&self) -> &[Value] {
        &self.changes
    }
    #[must_use]
    pub fn identities(&self) -> Vec<String> {
        self.changes
            .iter()
            .filter_map(|row| row["identity"].as_str().map(str::to_owned))
            .collect()
    }
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()
    }
    pub fn move_sources(&self) -> io::Result<()> {
        self.validate()?;
        if !self.physical {
            return Ok(());
        }
        if let Some(parent) = self.destination.parent() {
            fs::create_dir_all(parent)?;
        }
        fs::rename(&self.source, &self.destination)
    }
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        // Source inventory moved deliberately; validate bitmap independently after linking.
        crate::component_deprecation::write_bitmap(
            &self.root,
            &self.before,
            &self.bitmap,
            file_id,
            "move",
        )
    }
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
fn unsupported(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message)
}
