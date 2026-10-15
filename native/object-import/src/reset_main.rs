//! Main-lane `bit reset`: select local Version history, project the scope
//! object and bitmap changes, then publish only after a fresh validation.

pub use batch::Batch;
pub(crate) use publication::{backup_bitmap, validate_file_id};
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

#[derive(PartialEq)]
struct BytesChange {
    before: Vec<u8>,
    after: Vec<u8>,
}

#[derive(PartialEq)]
struct ObjectChange {
    hash: String,
    before: Vec<u8>,
    after: Option<Vec<u8>>,
}

struct Input {
    root: PathBuf,
    identity: String,
    head_only: bool,
    force: bool,
}

/// A prepared main-lane reset. No files change until `commit` checks the
/// exact Component, index and bitmap projection against the live workspace.
pub struct Plan {
    input: Input,
    object: ObjectChange,
    bitmap: BytesChange,
    index: Option<BytesChange>,
    history: Option<ObjectChange>,
    pub selection: Selection,
}

impl Plan {
    pub fn prepare(root: &Path, identity: &str, head_only: bool, force: bool) -> io::Result<Self> {
        let (scope, name) = identity
            .split_once('/')
            .filter(|(scope, name)| !scope.is_empty() && !name.is_empty())
            .ok_or_else(|| invalid("reset identity"))?;
        let bitmap = bitmap::Bitmap::load(root, scope, name)?;
        let repository = repository::Repository::load(root, scope, name)?;
        let selection = selection::select(&repository.component, &repository.objects(), head_only)?;
        validate_detached(&repository.component, &selection)?;
        if !force {
            dependents::validate(
                &repository.objects(),
                repository.components()?,
                identity,
                &selection,
                &repository.component,
            )?;
        }
        let version = selection.bitmap_version(&repository.component);
        let history = history::pending(root, identity, &repository.component)?;
        let bitmap = bitmap.project(version)?;
        let (object, index) = repository.project(&selection)?;
        let input =
            Input { root: root.to_owned(), identity: identity.to_owned(), head_only, force };
        Ok(Self { input, object, bitmap, index, history, selection })
    }

    pub fn commit(&self, file_id: &str) -> io::Result<()> {
        publication::commit(self, file_id)
    }
}

fn validate_detached(component: &Value, selection: &Selection) -> io::Result<()> {
    if component["detachedHeads"]["heads"]
        .as_array()
        .is_some_and(|heads| {
            heads
                .iter()
                .any(|hash| {
                    selection.removed
                        .iter()
                        .any(|removed| hash == removed)
                })
        })
    {
        return Err(invalid("reset selected detached head"));
    }
    Ok(())
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
