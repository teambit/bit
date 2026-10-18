//! Retained component identity, source refactoring and bitmap publication for `rename`.
pub mod batch;
pub use options::Options;

mod cleanup;
mod configuration;
mod files;
mod identity;
mod options;
mod publication;
mod refactor;
#[cfg(test)]
mod tests;

use crate::component_tracking::observe::Observed;
use serde_json::{Value, json};
use std::{
    io,
    path::{Path, PathBuf},
};

/// Source and target IDs, directories and exported-state policy.
pub struct Identity {
    pub source: String,
    pub target: String,
    pub source_name: String,
    pub source_version: Option<String>,
    pub target_name: String,
    pub source_directory: String,
    pub target_directory: String,
    pub exported: bool,
}
impl Identity {
    /// The resolved source identity used in published bitmap-history reasons.
    #[must_use]
    pub fn source_id(&self) -> String {
        self.source_version
            .as_deref()
            .map_or_else(|| self.source.clone(), |version| format!("{}@{version}", self.source))
    }
}
/// A mutation stays in memory until the caller owns the operation lifecycle.
pub struct Plan {
    root: PathBuf,
    pub identity: Identity,
    options: Options,
    controls: Controls,
    files: Vec<files::Change>,
    observed: Observed,
    cleanup: Option<cleanup::Tree>,
}
struct Controls {
    bitmap: Value,
    initial: Value,
    expected: Vec<u8>,
    workspace_before: Vec<u8>,
    workspace: Value,
    workspace_published: bool,
}
impl Plan {
    /// Read filesystem sources in Rust and retain every source/control preimage.
    pub fn prepare(root: &Path, options: &Options, facts: &Value) -> io::Result<Self> {
        let mut observed = Observed::default();
        observed.ancestors(root, root)?;
        let bitmap_before = required(&mut observed, &root.join(".bitmap"))?;
        let workspace_before = required(&mut observed, &root.join("workspace.jsonc"))?;
        let bitmap = crate::parse_jsonc(&bitmap_before)?;
        let workspace = crate::parse_jsonc(&workspace_before)?;
        let identity =
            identity::prepare(root, &bitmap, &workspace, options, facts["preflight"] == true)?;
        let mut plan = Self {
            root: root.to_owned(),
            identity,
            options: options.clone(),
            files: Vec::new(),
            observed,
            cleanup: None,
            controls: Controls {
                expected: bitmap_before,
                initial: bitmap.clone(),
                bitmap,
                workspace_before,
                workspace,
                workspace_published: false,
            },
        };
        files::prepare(&mut plan, facts)?;
        cleanup::prepare(&mut plan)?;
        configuration::prepare(&mut plan, facts)?;
        plan.validate()?;
        Ok(plan)
    }
    /// Native projected tracking state after the rename has finished.
    #[must_use]
    pub fn bitmap(&self) -> &Value {
        &self.controls.bitmap
    }
    /// Check all preimages before the first path or config is modified.
    pub fn validate(&self) -> io::Result<()> {
        self.observed.validate()?;
        cleanup::validate(self)
    }
    /// Publish the first identity-only bitmap stage for an unversioned source.
    pub fn begin(&mut self, file_id: &str) -> io::Result<()> {
        self.validate()?;
        if !self.identity.exported {
            publication::initial(self, file_id, "rename")?;
        }
        Ok(())
    }
    /// Materialize source changes after validating their original bytes.
    pub fn apply_files(&self) -> io::Result<()> {
        files::validate(self)?;
        files::apply(self)
    }
    /// Target-add bitmap used by exported component on-add tooling before source removal.
    #[must_use]
    pub fn added_bitmap(&self) -> &Value {
        &self.controls.initial
    }
    /// Exact published intermediate bitmap used by the post-removal target/list reload.
    pub fn published_bitmap(&self) -> io::Result<Value> {
        crate::parse_jsonc(&self.controls.expected)
    }
    /// Persist a copied exported component after its first successful linking phase.
    pub fn publish_added(&mut self, file_id: &str) -> io::Result<()> {
        let reason = format!("adding {}", self.identity.target);
        publication::initial(self, file_id, &reason)
    }
    /// Final original deletion/deprecation precedes subsequent rename/link stages.
    pub fn finish_original(&mut self, file_id: &str, source_package: &str) -> io::Result<()> {
        publication::finish_original(self, file_id, source_package)
    }
    /// Publish workspace aspect references before the renamed target is reloaded.
    pub fn publish_configuration(&mut self, file_id: &str) -> io::Result<()> {
        configuration::publish(self, file_id)
    }
    /// Write final rename configuration and any changed component root/main metadata.
    pub fn commit(&mut self, file_id: &str) -> io::Result<()> {
        configuration::publish(self, file_id)?;
        publication::final_bitmap(self, file_id)
    }
    /// Recompute import replacements from the classes loaded by workspace.list.
    pub fn refactor_loaded(&mut self, rows: &[Value], packages: (&str, &str)) -> io::Result<()> {
        files::refactor_loaded(self, rows, packages)
    }
    /// Paths written by native materialization; source bodies stay on the filesystem.
    #[must_use]
    pub fn materialized(&self) -> Value {
        serde_json::json!({
            "identity":self.identity.target,
            "directory":self.identity.target_directory,
            "mainFile":self.controls.bitmap.get(&self.identity.target)
                .or_else(||self.controls.bitmap.get(&self.identity.target_name))
                .map_or(Value::Null, |row|row["mainFile"].clone()),
            "files":self.files.iter().map(|file| serde_json::json!({
                "from":file.source,"to":file.destination
            })).collect::<Vec<_>>()
        })
    }
    /// Apply the reloaded target's actual in-memory `SourceFile` changes before native refactoring.
    pub fn target_load(&mut self, component: &Value, packages: (&str, &str)) -> io::Result<()> {
        files::target_load(self, component, packages)
    }
    /// Private AST adapter inputs; file bodies stay outside the JSON protocol.
    #[must_use]
    pub fn ast_inputs(&self) -> Vec<(PathBuf, Vec<u8>)> {
        self.files
            .iter()
            .filter(|file| {
                file.destination.starts_with(self.root.join(&self.identity.target_directory))
                    && !crate::checkout::eol::binary(&file.bytes)
            })
            .map(|file| (file.destination.clone(), file.bytes.clone()))
            .collect()
    }
    /// Accept bounded transformed spool bytes before any workspace mutation.
    pub fn transformed(&mut self, path: &Path, bytes: Vec<u8>) -> io::Result<()> {
        if bytes.len() > 32 * 1024 * 1024 {
            return Err(unsupported("rename transformed source limit"));
        }
        let file = self.files
            .iter_mut()
            .find(|file| file.destination == path)
            .ok_or_else(|| unsupported("rename transformed path"))?;
        file.bytes = bytes;
        Ok(())
    }
    /// Captured target metadata for the published on-add/compiler adapters.
    #[must_use]
    pub fn receipt(&self) -> Value {
        json!({"sourceId":self.identity.source,"targetId":self.identity.target,
            "sourceDirectory":self.identity.source_directory,"targetDirectory":self.identity.target_directory,
            "exported":self.identity.exported,"preserve":self.options.preserve,"ast":self.options.ast})
    }
}
fn required(observed: &mut Observed, path: &Path) -> io::Result<Vec<u8>> {
    observed
        .read(path)?
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "rename control file"))
}
fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
fn unsupported(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message.into())
}
