use super::{Finalize, Retained, invalid, scratch, version};
use crate::{
    stash_store::PreparedSave,
    workspace::{engine::command::merge::snapshot, snapshots},
};
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::Path};

pub(super) struct Prepared {
    _directory: scratch::Directory,
    objects: snapshot::Snapshot,
    metadata: PreparedSave,
    pub(super) result: Value,
    committed: bool,
}
impl Prepared {
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

fn metadata(
    retained: &Retained,
    message: Option<String>,
    rows: &[Value],
) -> io::Result<PreparedSave> {
    let mut metadata = json!({});
    if let Some(message) = message {
        metadata["message"] = json!(message);
    }
    PreparedSave::prepare(
        &crate::scope_path(&retained.root),
        &json!({"metadata":metadata,"stashCompsData":rows}),
    )
}
fn batch(
    retained: &Retained,
    input: &Finalize,
    snapshots: &snapshots::State,
) -> io::Result<(Vec<Value>, Vec<Value>, Vec<Value>)> {
    let mut objects = Vec::new();
    let mut rows = Vec::new();
    let mut versions = Vec::new();
    let mut hashes = HashSet::new();
    for (component, allocation) in retained.components.iter().zip(&input.versions) {
        let hash =
            crate::validate::hexadecimal(&crate::merge_history::hash(allocation.hash.trim())?);
        if allocation.identity.trim() != component.identity || !hashes.insert(hash.clone()) {
            return Err(invalid("stash allocation identity"));
        }
        let version =
            version::prepare(component, allocation, &input.bit_version, snapshots, &mut objects)?;
        let mut id = component.id.clone();
        id.as_object_mut()
            .ok_or_else(|| invalid("stash component ID"))?
            .remove("version");
        rows.push(
            json!({"id":id,"hash":hash,"bitmapEntry":component.bitmap_entry,"isNew":component.new}),
        );
        versions.push(json!({"identity":component.identity,"hash":hash,"version":version}));
    }
    Ok((objects, rows, versions))
}

pub(super) fn prepare(
    retained: &mut Retained,
    input: Finalize,
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
    if input.versions.len() != retained.components.len() {
        return Err(invalid("stash allocation count"));
    }
    let (mut objects, rows, versions) = batch(retained, &input, snapshots)?;
    let metadata = metadata(retained, input.message, &rows)?;
    let directory = scratch::Directory::create()?;
    let mut seen = HashSet::new();
    objects.retain(|object| object["type"] != "Source" || seen.insert(object["hash"].clone()));
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
