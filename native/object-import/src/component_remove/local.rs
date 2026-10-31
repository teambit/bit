//! Retain the whole local remove operation before scope, source and control publication.
mod preparation;
#[cfg(test)]
mod tests;
use super::{Selected, VersionedPlan, backup_bitmap, batch, invalid, versioned};
use batch::cleanup::Cleanup;
use serde_json::Value;
use std::{
    fs, io,
    path::{Path, PathBuf},
};

pub struct LocalBatch {
    root: PathBuf,
    before: Vec<u8>,
    after: Vec<u8>,
    selected: Vec<Selected>,
    models: Vec<VersionedPlan>,
    cleanup: Cleanup,
    track: bool,
    proofs: crate::component_tracking::observe::Observed,
}
impl LocalBatch {
    pub fn prepare(
        root: &Path,
        identities: &[String],
        keep_files: bool,
        track: bool,
        components: &[Value],
    ) -> io::Result<Self> {
        preparation::prepare(root, identities, keep_files, track, components)
    }
    pub fn bitmap(&self) -> io::Result<Value> {
        crate::parse_jsonc(&self.before)
    }
    #[must_use]
    pub fn identities(&self) -> Vec<String> {
        self.selected
            .iter()
            .map(|row| row.identity.clone())
            .collect()
    }
    #[must_use]
    pub fn lane_identities(&self) -> Vec<String> {
        self.models
            .iter()
            .filter(|model| model.removed_from_lane())
            .map(|model| model.identity().to_owned())
            .collect()
    }
    pub fn check_aspect_usage(&self, components: &[Value]) -> io::Result<()> {
        let new = self.selected
            .iter()
            .filter(|row| row.version.is_none())
            .map(|row| row.identity.clone())
            .collect::<Vec<_>>();
        batch::usage::validate(&new, components)
    }
    pub fn with_status_history(mut self) -> io::Result<Self> {
        self.models = self.models
            .into_iter()
            .map(|model| if model.is_staged() { model.with_status_history() } else { Ok(model) })
            .collect::<io::Result<_>>()?;
        Ok(self)
    }
    pub fn validate(&self, file_id: &str) -> io::Result<()> {
        super::validate_file_id(file_id)?;
        if fs::read(self.root.join(".bitmap"))? != self.before {
            return Err(invalid("component bitmap changed before removal"));
        }
        self.proofs.validate()?;
        for row in &self.selected {
            for path in row.files
                .iter()
                .chain(std::iter::once(&row.package))
            {
                if !path.as_os_str().is_empty() {
                    super::validate_directory(path)?;
                }
            }
        }
        self.cleanup.validate()?;
        for model in &self.models {
            model.validate_before_commit(file_id)?;
        }
        Ok(())
    }
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        self.validate(file_id)?;
        if self.selected.is_empty() {
            return Ok(());
        }
        versioned::publish(&self.models, self.track)?;
        self.cleanup.scope()?;
        batch::remove_sources(&self.selected)?;
        if !self.track {
            self.cleanup.manifest()?;
            for row in &self.selected {
                if !row.package.as_os_str().is_empty() && row.package.try_exists()? {
                    fs::remove_dir_all(&row.package)?;
                }
            }
            self.cleanup.configuration(&self.root, file_id)?;
            let _ = backup_bitmap(&self.root, file_id, "remove");
            fs::write(self.root.join(".bitmap"), &self.after)?;
        }
        Ok(())
    }
}
