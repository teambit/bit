use super::{
    super::{invalid, proof, resolve_publication, resolve_snapshot, scratch},
    Apply, Finalize, Retained,
};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

pub(super) struct Prepared {
    _directory: scratch::Directory,
    snapshot: resolve_snapshot::Snapshot,
    publication: resolve_publication::Prepared,
}

pub(super) fn finalize(
    input: Finalize,
    retained: &mut Retained,
    snapshots: &snapshots::State,
) -> io::Result<Value> {
    if retained.record.token != input.token
        || retained.materials.is_empty()
        || retained.finalized.is_some()
    {
        return Err(invalid("resolve finalize state"));
    }
    retained.record.proofs.extend(input.dependency_read_set);
    validate(retained)?;
    let mut receipt = input.snap_receipt;
    receipt["log"]["message"] = json!(retained.message);
    let lane = retained.record.context
        .get("lane")
        .and_then(|value| value.get("current"))
        .filter(|value| !value.is_null())
        .map(|current| {
            let mut value = current.clone();
            value["id"] = retained.record.context["lane"]["currentId"].clone();
            value
        });
    let directory = scratch::Directory::create()?;
    let snapshot = resolve_snapshot::prepare(
        &retained.record.request.root,
        &directory.0,
        &retained.materials,
        lane.as_ref(),
        &receipt,
        snapshots,
    )?;
    let publication = resolve_publication::prepare(
        &retained.record.request.root,
        &retained.record.context,
        &retained.materials,
        &snapshot.versions,
        &retained.pending,
        lane.as_ref(),
        &receipt,
    )?;
    publication.validate()?;
    retained.finalized = Some(Prepared { _directory: directory, snapshot, publication });
    Ok(json!({"token":retained.record.token,"result":retained.result}))
}

pub(super) fn apply(input: &Apply, retained: &mut Retained) -> io::Result<Value> {
    if retained.record.token != input.token {
        return Err(invalid("resolve apply token"));
    }
    super::super::bitmap::validate_history_file_id(&input.file_id)?;
    proof::verify(&input.dependency_read_set)?;
    validate(retained)?;
    let prepared =
        retained.finalized.as_mut().ok_or_else(|| invalid("resolve incomplete finalization"))?;
    prepared.snapshot.validate()?;
    prepared.publication.validate()?;
    retained.record.repository.commit_import()?;
    prepared.snapshot.commit(&retained.record.request.root)?;
    let notifications = super::super::apply_command::notify(&retained.record.request.root);
    prepared.publication.commit(&input.file_id)?;
    Ok(json!({"applied":true,"result":retained.result,"postPersistNotifications":notifications}))
}
fn validate(retained: &Retained) -> io::Result<()> {
    proof::verify(&retained.record.proofs)?;
    retained.record.repository.validate()
}
