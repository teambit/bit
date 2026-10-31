//! Retain the five published recovery classifications and publish their bitmap once.
pub(super) mod repository;

mod classification;
mod configuration;
mod loaded;
mod publication;
mod selection;

use crate::component_tracking::observe::Observed;
use serde_json::Value;
use std::{
    collections::BTreeMap,
    io,
    path::{Path, PathBuf},
};
const REMOVE: &str = "teambit.component/remove";
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    WriteFromScope,
    DeleteConfigAndImport,
    UpdateConfig,
    Import,
    ProbeRemote,
    None,
}
pub struct Batch {
    root: PathBuf,
    bitmap: Value,
    items: Vec<Item>,
    proofs: Observed,
}
struct Item {
    id: String,
    key: Option<String>,
    action: Action,
    files: Vec<File>,
    configuration: Option<Configuration>,
}
struct Configuration {
    path: PathBuf,
    bytes: Vec<u8>,
}
struct File {
    path: PathBuf,
    bytes: Vec<u8>,
    source: PathBuf,
    proof: Vec<u8>,
}
impl Batch {
    pub fn prepare(root: &Path, pattern: &str) -> io::Result<Self> {
        let pattern = pattern.trim();
        if !root.is_absolute() || pattern.is_empty() {
            return Err(invalid("recovery workspace root and pattern are required"));
        }
        let mut proofs = Observed::default();
        proofs.ancestors(root, root)?;
        let before = required(&mut proofs, &root.join(".bitmap"))?;
        let bitmap = crate::parse_jsonc(&before)?;
        let mut batch = Self { root: root.into(), bitmap, items: vec![], proofs };
        let selected = selection::select(&mut batch, pattern)?;
        for id in selected {
            let mut item = classification::classify(&mut batch, &id)?;
            item.configuration = configuration::prepare(&mut batch, &item)?;
            batch.items.push(item);
        }
        batch.validate()?;
        Ok(batch)
    }
    #[must_use]
    pub fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    pub fn scope_import_ids(&mut self) -> io::Result<Vec<String>> {
        let mut ids = Vec::new();
        for index in 0..self.items.len() {
            let id = self.items[index].id.clone();
            let key = selection::key(&self.bitmap, &id)?;
            let exported = key.is_none_or(|key| {
                self.bitmap[key]["scope"]
                    .as_str()
                    .is_some_and(|scope| !scope.trim().is_empty())
            });
            if exported && repository::model(self, selection::bare(&id))?.is_none() {
                ids.push(id);
            }
        }
        Ok(ids)
    }
    #[must_use]
    pub fn probe_ids(&self) -> Vec<String> {
        self.ids(Action::ProbeRemote)
    }
    #[must_use]
    pub fn import_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| matches!(item.action, Action::Import | Action::DeleteConfigAndImport))
            .map(|item| item.id.clone())
            .collect()
    }
    #[must_use]
    pub fn hydration_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| {
                item.key.is_some() && matches!(item.action, Action::UpdateConfig | Action::None)
            })
            .map(|item| selection::bare(&item.id).to_owned())
            .collect()
    }
    pub fn refresh_loaded(&mut self, rows: &[Value]) -> io::Result<()> {
        loaded::refresh(self, rows)
    }
    #[must_use]
    pub fn recovered_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| !matches!(item.action, Action::None | Action::ProbeRemote))
            .map(|item| item.id.clone())
            .collect()
    }
    pub fn resolve_remote(&mut self, removed: &BTreeMap<String, bool>) -> io::Result<()> {
        for item in &mut self.items {
            if item.action != Action::ProbeRemote {
                continue;
            }
            let deleted = removed
                .get(&item.id)
                .or_else(|| removed.get(selection::bare(&item.id)))
                .ok_or_else(|| unsupported("recovery remote classification missing"))?;
            item.action = if *deleted { Action::Import } else { Action::None };
        }
        Ok(())
    }
    /// Continue only from the bitmap actually published by the retained native import.
    /// The caller validates the batch before invoking that separate publication owner.
    pub fn after_import(&mut self, published: &Value) -> io::Result<()> {
        publication::after_import(self, published)
    }
    pub fn validate(&self) -> io::Result<()> {
        self.proofs.validate()
    }
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        publication::commit(self, file_id)
    }
    fn ids(&self, action: Action) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| item.action == action)
            .map(|item| item.id.clone())
            .collect()
    }
}
fn required(proofs: &mut Observed, path: &Path) -> io::Result<Vec<u8>> {
    proofs
        .read(path)?
        .ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::NotFound,
                format!("recovery input missing: {}", path.display()),
            )
        })
}
pub(super) fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
pub(super) fn unsupported(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message.into())
}
