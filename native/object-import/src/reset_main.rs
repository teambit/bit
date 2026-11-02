//! Main-lane `bit reset` ([`Batch`], [`Selection`], [`backup_bitmap`]): select local `Version` history, project the scope
//! object and `.bitmap` changes, then publish only after a fresh validation.

pub use batch::Batch;
pub use publication::backup_bitmap;
pub(crate) use publication::validate_file_id;
pub use selection::Selection;

mod batch;
mod bitmap;
mod dependents;
mod history;
mod publication;
mod repository;
mod selection;
#[cfg(test)]
mod tests;

use crate::workspace::engine::command::outbound;
use serde_json::Value;
use std::{
    io,
    path::{Path, PathBuf},
};

/// Preimage and postimage byte pair for `.bitmap` or `index.json` updates during a `main` reset.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct BytesChange {
    before: Vec<u8>,
    after: Vec<u8>,
}

/// Preimage and optional postimage bytes for a `Component` or `VersionHistory` object during a `main` reset.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct ObjectChange {
    hash: String,
    before: Vec<u8>,
    after: Option<Vec<u8>>,
}

/// Retained `root`, `identity`, `head_only`, and `force` parameters for [`Plan`] revalidation.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
struct Input {
    root: PathBuf,
    identity: String,
    head_only: bool,
    force: bool,
}

/// A prepared main-lane reset. No files change until `commit` checks the
/// exact Component, index and bitmap projection against the live workspace.
#[derive(Clone, PartialEq, Eq)]
pub struct Plan {
    input: Input,
    object: ObjectChange,
    bitmap: BytesChange,
    index: Option<BytesChange>,
    history: Option<ObjectChange>,
    controls: Vec<crate::reset_lane::controls::Control>,
    pub selection: Selection,
}

impl Plan {
    /// Prepares a `main`-lane reset plan for `identity` at `root` without mutating workspace files.
    pub fn prepare(root: &Path, identity: &str, head_only: bool, force: bool) -> io::Result<Self> {
        let (scope, name) = parse_identity(identity)?;
        let identity = format!("{scope}/{name}");
        let bitmap = bitmap::Bitmap::load(root, scope, name)?;
        let repository = repository::Repository::load(root, scope, name)?;
        let objects = repository.objects();
        let selection = selection::select(&repository.component, &objects, head_only)?;
        validate_detached(&repository.component, &selection)?;
        if !force {
            dependents::validate(
                &objects,
                repository.components()?,
                &identity,
                &selection,
                &repository.component,
            )?;
        }
        let history = history::pending(root, &identity, &repository.component, &selection)?;
        let bitmap = bitmap.project(selection.bitmap_version(&repository.component))?;
        let (object, index) = repository.project(&selection)?;
        let controls = crate::reset_lane::controls::prepare(root, std::slice::from_ref(&identity))?;
        Ok(Self {
            input: Input { root: root.to_owned(), identity, head_only, force },
            object,
            bitmap,
            index,
            history,
            controls,
            selection,
        })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        publication::commit(self, file_id)
    }
}

fn parse_identity(identity: &str) -> io::Result<(&str, &str)> {
    let raw = identity.trim();
    let bare = raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim());
    bare.split_once('/')
        .map(|(scope, name)| (scope.trim(), name.trim()))
        .filter(|(scope, name)| {
            !scope.is_empty()
                && !name.is_empty()
                && !scope.contains("..")
                && !name.contains("..")
                && !scope.contains(['/', '\\', '\0'])
                && !name.contains(['\\', '\0'])
        })
        .ok_or_else(|| invalid("reset identity"))
}

fn validate_detached(component: &Value, selection: &Selection) -> io::Result<()> {
    if component["detachedHeads"]["heads"]
        .as_array()
        .is_some_and(|heads| heads.iter().any(|hash| is_removed_detached(hash, selection)))
    {
        return Err(invalid("reset selected detached head"));
    }
    Ok(())
}

#[inline]
fn is_removed_detached(hash: &Value, selection: &Selection) -> bool {
    hash.as_str()
        .map(str::trim)
        .is_some_and(|hash| {
            selection.removed
                .iter()
                .any(|removed| hash.eq_ignore_ascii_case(removed.trim()))
        })
}

#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
