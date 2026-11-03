//! [`Prepared`] stash publication staging and [`PreparedSave`] persistence for [`Finalize`].

use super::{Finalize, Retained, invalid, scratch, version};
use crate::{
    stash_store::PreparedSave,
    workspace::{engine::command::merge::snapshot, snapshots},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

/// Staged detached [`snapshot::Snapshot`] objects and [`PreparedSave`] stash metadata file ready for atomic [`Prepared::commit`].
pub(super) struct Prepared {
    _directory: scratch::Directory,
    objects: snapshot::Snapshot,
    metadata: PreparedSave,
    pub(super) result: Value,
    committed: bool,
}
impl Prepared {
    /// Validates and atomically commits staged detached objects and stash metadata to `root`.
    #[inline]
    pub(super) fn commit(&mut self, root: &Path) -> io::Result<()> {
        if self.committed {
            return Err(invalid("stash already persisted"));
        }
        self.metadata.validate()?;
        self.objects.validate()?;
        self.objects.commit(root)?;
        self.metadata.apply()?;
        self.committed = true;
        Ok(())
    }
}

/// Prepares the `.bit/stash/<id>.json` [`PreparedSave`] plan for `rows` and optional `message` on `retained` ([`Retained`]).
#[inline]
fn metadata(
    retained: &Retained,
    message: Option<&str>,
    rows: &[Value],
) -> io::Result<PreparedSave> {
    let mut metadata = json!({});
    if let Some(message) = message
        .map(str::trim)
        .filter(|msg| !msg.is_empty())
    {
        metadata["message"] = json!(message);
    }
    PreparedSave::prepare(
        &crate::scope_path(&retained.root),
        &json!({"metadata":metadata,"stashCompsData":rows}),
    )
}
/// Builds detached `Version` objects, `stashCompsData` rows, and version summaries for `retained.components` ([`Retained`], [`Finalize`]).
fn batch(
    retained: &Retained,
    input: &Finalize,
    snapshots: &snapshots::State,
) -> io::Result<(Vec<Value>, Vec<Value>, Vec<Value>)> {
    let count = retained.components.len();
    let mut objects = Vec::with_capacity(count);
    let mut rows = Vec::with_capacity(count);
    let mut versions = Vec::with_capacity(count);
    let mut hashes = HashSet::with_capacity(count);
    let mut identities = HashSet::with_capacity(count);
    for (component, allocation) in retained.components.iter().zip(&input.versions) {
        let hash =
            crate::validate::hexadecimal(&crate::merge_history::hash(allocation.hash.trim())?);
        let identity = component.identity.trim();
        if identity.is_empty()
            || allocation.identity.trim() != identity
            || !identities.insert(identity)
            || !hashes.insert(hash.clone())
        {
            return Err(invalid("stash allocation identity"));
        }
        let version = version::prepare(
            component,
            allocation,
            input.bit_version.trim(),
            snapshots,
            &mut objects,
        )?;
        let mut id = component.id.clone();
        id.as_object_mut()
            .ok_or_else(|| invalid("stash component ID"))?
            .remove("version");
        rows.push(
            json!({"id":id,"hash":hash,"bitmapEntry":component.bitmap_entry,"isNew":component.new}),
        );
        versions.push(json!({"identity":identity,"hash":hash,"version":version}));
    }
    Ok((objects, rows, versions))
}

pub(super) fn prepare(
    retained: &mut Retained,
    input: &Finalize,
    snapshots: &snapshots::State,
) -> io::Result<Value> {
    retained.check(&input.token)?;
    if retained.graph.error.is_some()
        || !retained.graph.staged
        || retained.prepared.is_some()
        || retained.components.is_empty()
    {
        return Err(invalid("stash finalization state"));
    }
    if input.bit_version.trim().is_empty() {
        return Err(invalid("stash bit version"));
    }
    if input.versions.len() != retained.components.len() {
        return Err(invalid("stash allocation count"));
    }
    let (mut objects, rows, versions) = batch(retained, input, snapshots)?;
    let metadata = metadata(retained, input.message.as_deref(), &rows)?;
    let directory = scratch::Directory::create()?;
    let mut seen = HashSet::with_capacity(objects.len());
    objects.retain(|object| {
        object["type"] != "Source"
            || object["hash"]
                .as_str()
                .map(|hash| hash.trim().to_ascii_lowercase())
                .is_none_or(|hash| seen.insert(hash))
    });
    let objects = snapshot::prepare_objects(&directory.0, objects)?;
    let result =
        json!({"token":retained.token,"versions":versions,"stashFile":metadata.filename()});
    retained.prepared = Some(Prepared {
        _directory: directory,
        objects,
        metadata,
        result: result.clone(),
        committed: false,
    });
    Ok(result)
}
