use super::{
    super::{invalid, proof, resolve_publication, resolve_snapshot, scratch},
    Apply, Finalize, Retained,
};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::io;

pub(super) enum Phase {
    Pending,
    Noop,
    Prepared(Box<Prepared>),
}

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
        || !matches!(retained.finalized, Phase::Pending)
    {
        return Err(invalid("resolve finalize state"));
    }
    retained.record.proofs.extend(input.dependency_read_set);
    validate(retained)?;
    let mut receipt = input.snap_receipt;
    receipt["log"]["message"] = json!(retained.message);
    let lane = lane_current(&retained.record.context);
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
        &receipt,
        retained.record.repository.imported_index(),
    )?;
    publication.validate()?;
    if retained.snap.is_some() {
        allocate_snap_report(&mut retained.result, &snapshot.versions)?;
    }
    retained.finalized =
        Phase::Prepared(Box::new(Prepared { _directory: directory, snapshot, publication }));
    Ok(json!({"token":retained.record.token,"result":retained.result}))
}

fn lane_current(context: &Value) -> Option<Value> {
    context
        .get("lane")
        .and_then(|value| value.get("current"))
        .filter(|value| !value.is_null())
        .map(|current| {
            let mut value = current.clone();
            value["id"] = context["lane"]["currentId"].clone();
            value
        })
}

fn allocate_snap_report(result: &mut Value, versions: &[Value]) -> io::Result<()> {
    result["snappedComponents"] = json!(
        versions
            .iter()
            .filter(|row| row["selected"] == true)
            .map(|row| format!(
                "{}@{}",
                row["identity"].as_str().unwrap(),
                row["hash"].as_str().unwrap()
            ))
            .collect::<Vec<_>>()
    );
    for row in result["autoSnappedResults"]
        .as_array_mut()
        .ok_or_else(|| invalid("snap automatic report"))?
    {
        let version = versions
            .iter()
            .find(|version| version["identity"] == row["id"])
            .ok_or_else(|| invalid("snap automatic allocation"))?;
        row["id"] = json!(format!(
            "{}@{}",
            version["identity"].as_str().unwrap(),
            version["hash"].as_str().unwrap()
        ));
    }
    Ok(())
}

pub(super) fn apply(input: &Apply, retained: &mut Retained) -> io::Result<Value> {
    if retained.record.token != input.token {
        return Err(invalid("resolve apply token"));
    }
    super::super::bitmap::validate_history_file_id(&input.file_id)?;
    proof::verify(&input.dependency_read_set)?;
    validate(retained)?;
    if matches!(retained.finalized, Phase::Noop) && retained.snap.is_some() {
        return Ok(json!({"applied":true,"result":null,"postPersistNotifications":0}));
    }
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("resolve incomplete finalization"));
    };
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
