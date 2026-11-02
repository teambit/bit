//! Retain the five published recovery [`Action`] classifications in [`Batch`] and publish their `.bitmap` once.
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
/// Canonical aspect ID (`"teambit.component/remove"`) for soft-deleted component metadata.
const REMOVE: &str = "teambit.component/remove";
/// Per-component recovery classification determining how `bit recover` restores the component.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Action {
    WriteFromScope,
    DeleteConfigAndImport,
    UpdateConfig,
    Import,
    ProbeRemote,
    None,
}
/// Retained multi-component recovery batch holding classified [`Item`]s, `.bitmap`, and file proofs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Batch {
    root: PathBuf,
    bitmap: Value,
    items: Vec<Item>,
    proofs: Observed,
}
/// Single component's recovery classification, staged source files, and optional `component.json` edit.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Item {
    id: String,
    key: Option<String>,
    action: Action,
    files: Vec<File>,
    configuration: Option<Configuration>,
}
/// Staged `component.json` path and updated byte contents for a recovered component.
#[derive(Debug, Clone, PartialEq, Eq)]
struct Configuration {
    path: PathBuf,
    bytes: Vec<u8>,
}
/// Staged source file destination path, content bytes, scope loose object path, and preimage proof.
#[derive(Debug, Clone, PartialEq, Eq)]
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
        let mut batch = Self { root: root.into(), bitmap, items: Vec::new(), proofs };
        let selected = selection::select(&mut batch, pattern)?;
        batch.items.reserve(selected.len());
        for id in selected {
            let mut item = classification::classify(&mut batch, &id)?;
            item.configuration = configuration::prepare(&mut batch, &item)?;
            batch.items.push(item);
        }
        batch.validate()?;
        Ok(batch)
    }
    #[must_use]
    #[inline]
    pub fn bitmap(&self) -> &Value {
        &self.bitmap
    }
    pub fn scope_import_ids(&mut self) -> io::Result<Vec<String>> {
        let mut ids = Vec::new();
        for index in 0..self.items.len() {
            let key = selection::key(&self.bitmap, &self.items[index].id)?;
            let exported = key.is_none_or(|key| {
                self.bitmap[&key]["scope"]
                    .as_str()
                    .map_or_else(
                        || selection::bare(&key).contains('/'),
                        |scope| !scope.trim().is_empty(),
                    )
            });
            if exported {
                let id = self.items[index].id.clone();
                if repository::model(self, selection::bare(&id))?.is_none() {
                    ids.push(id);
                }
            }
        }
        Ok(ids)
    }
    #[must_use]
    #[inline]
    pub fn probe_ids(&self) -> Vec<String> {
        self.ids(Action::ProbeRemote)
    }
    #[must_use]
    #[inline]
    pub fn import_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| matches!(item.action, Action::Import | Action::DeleteConfigAndImport))
            .map(|item| item.id.clone())
            .collect()
    }
    #[must_use]
    #[inline]
    pub fn hydration_ids(&self) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| {
                item.key.is_some() && matches!(item.action, Action::UpdateConfig | Action::None)
            })
            .map(|item| selection::bare(&item.id).to_owned())
            .collect()
    }
    #[inline]
    pub fn refresh_loaded(&mut self, rows: &[Value]) -> io::Result<()> {
        loaded::refresh(self, rows)
    }
    #[must_use]
    #[inline]
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
            let bare = selection::bare(&item.id);
            let deleted = removed
                .get(item.id.trim())
                .or_else(|| removed.get(bare))
                .or_else(|| {
                    removed
                        .iter()
                        .find_map(|(key, val)| (selection::bare(key) == bare).then_some(val))
                })
                .ok_or_else(|| unsupported("recovery remote classification missing"))?;
            item.action = if *deleted { Action::Import } else { Action::None };
        }
        Ok(())
    }
    /// Continue only from the bitmap actually published by the retained native import.
    /// The caller validates the batch before invoking that separate publication owner.
    #[inline]
    pub fn after_import(&mut self, published: &Value) -> io::Result<()> {
        publication::after_import(self, published)
    }
    #[inline]
    pub fn validate(&self) -> io::Result<()> {
        self.proofs.validate()
    }
    #[inline]
    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        publication::commit(self, file_id)
    }
    #[inline]
    fn ids(&self, action: Action) -> Vec<String> {
        self.items
            .iter()
            .filter(|item| item.action == action)
            .map(|item| item.id.clone())
            .collect()
    }
}
#[inline]
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
#[inline]
pub(super) fn invalid(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, message.into())
}
#[inline]
pub(super) fn unsupported(message: impl Into<String>) -> io::Error {
    io::Error::new(io::ErrorKind::Unsupported, message.into())
}
