pub(super) mod builder;
pub(super) mod packages;

use super::{
    super::{bitmap, invalid, proof, resolve_publication, resolve_snapshot, scratch},
    Apply, Finalize, Retained,
};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{fs, io};

pub(super) enum Phase {
    Pending(super::refresh::Callbacks),
    Noop,
    Soft(bitmap::Prepared),
    Prepared(Box<Prepared>),
}

pub(super) struct Prepared {
    _directory: scratch::Directory,
    snapshot: resolve_snapshot::Snapshot,
    publication: resolve_publication::Prepared,
    receipt: Value,
    staged_snaps: Option<Vec<u8>>,
    objects_persisted: bool,
    notifications: usize,
}

pub(super) fn finalize(
    input: Finalize,
    retained: &mut Retained,
    snapshots: &snapshots::State,
) -> io::Result<Value> {
    if retained.record.token != input.token
        || retained.materials.is_empty()
        || !matches!(retained.finalized, Phase::Pending(_))
    {
        return Err(invalid("resolve finalize state"));
    }
    retained.record.proofs.extend(input.dependency_read_set);
    validate(retained)?;
    let mut receipt = input.snap_receipt;
    validate_graph_receipt(retained, &receipt)?;
    receipt["log"]["message"] =
        json!(retained.record.request.options.message.as_deref().unwrap_or_default());
    super::logs::apply(retained, &mut receipt)?;
    if retained.tag.as_ref().is_some_and(|options| options.soft) {
        return finalize_soft(retained, &receipt);
    }
    let prepared = prepare_snapshot(retained, receipt, snapshots)?;
    if retained.snap.is_some() && retained.tag.is_none() {
        allocate_snap_report(&mut retained.result, &prepared.snapshot.versions)?;
    }
    let package_manifest_plans =
        prepared.publication.package_manifest_plans(&prepared.snapshot.versions)?;
    let staged_objects = prepared.snapshot.staged_objects().to_vec();
    let versions = prepared.snapshot.versions.clone();
    retained.finalized = Phase::Prepared(Box::new(prepared));
    Ok(
        json!({"token":retained.record.token,"result":retained.result,"stagedObjects":staged_objects,"versions":versions,"packageManifestPlans":package_manifest_plans}),
    )
}

fn finalize_soft(retained: &mut Retained, receipt: &Value) -> io::Result<Value> {
    let versions = retained.materials
        .iter()
        .map(|material| {
            material.version_state.tagged_version
                .as_ref()
                .map(|version| (material.identity.clone(), version.clone()))
                .ok_or_else(|| invalid("soft tag planned version"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    let root = &retained.record.request.root;
    let mut bitmap = bitmap::prepare_bytes(
        root,
        fs::read(root.join(".bitmap"))?,
        &retained.record.context,
        &[],
        &[],
    )?;
    bitmap.soft_tag(
        &retained.record.context,
        &versions,
        &receipt["log"],
        &receipt["componentLogs"],
        retained.tag.as_ref().and_then(|options| options.pre_release_id.as_deref()),
    )?;
    bitmap.validate()?;
    retained.finalized = Phase::Soft(bitmap);
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
    if let Some(root) = result["autoAddedWorkspaceRoot"].as_str() {
        let version = versions
            .iter()
            .find(|version| version["identity"] == root)
            .ok_or_else(|| invalid("snap root allocation"))?;
        result["autoAddedWorkspaceRoot"] = json!(format!(
            "{root}@{}",
            version["hash"].as_str().ok_or_else(|| invalid("snap root allocation hash"))?
        ));
    }
    result["snappedComponents"] = json!(
        versions
            .iter()
            .filter(|row| row["selected"] == true)
            .map(|row| format!(
                "{}@{}",
                row["identity"].as_str().unwrap_or_default(),
                row["hash"].as_str().unwrap_or_default()
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
            version["identity"].as_str().unwrap_or_default(),
            version["hash"].as_str().unwrap_or_default()
        ));
    }
    Ok(())
}

pub(super) fn apply(input: &Apply, retained: &mut Retained) -> io::Result<Value> {
    if retained.record.token != input.token.trim() {
        return Err(invalid("resolve apply token"));
    }
    super::super::bitmap::validate_history_file_id(input.file_id.trim())?;
    proof::verify(&input.dependency_read_set)?;
    validate(retained)?;
    if matches!(retained.finalized, Phase::Noop) && retained.snap.is_some() {
        return Ok(json!({"applied":true,"result":null,"postPersistNotifications":0}));
    }
    if let Phase::Soft(bitmap) = &retained.finalized {
        bitmap.commit(
            input.file_id.trim(),
            &format!(
                "tag (message: {})",
                retained.record.request.options.message
                    .as_deref()
                    .filter(|message| !message.is_empty())
                    .unwrap_or("N/A"),
            ),
        )?;
        return Ok(json!({"applied":true,"result":retained.result,"postPersistNotifications":0}));
    }
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("resolve incomplete finalization"));
    };
    prepared.snapshot.validate()?;
    prepared.publication.validate()?;
    if !prepared.objects_persisted {
        retained.record.repository.commit_import()?;
        prepared.snapshot.commit(&retained.record.request.root)?;
        prepared.notifications = super::super::apply_command::notify(&retained.record.request.root);
    }
    let notifications = prepared.notifications;
    prepared.publication.commit(input.file_id.trim())?;
    Ok(json!({"applied":true,"result":retained.result,"postPersistNotifications":notifications}))
}
pub(super) fn validate(retained: &Retained) -> io::Result<()> {
    proof::verify(&retained.record.proofs)?;
    retained.record.repository.validate()
}

impl Phase {
    pub(super) fn callbacks_mut(&mut self) -> io::Result<&mut super::refresh::Callbacks> {
        match self {
            Self::Pending(callbacks) => Ok(callbacks),
            _ => Err(invalid("snapshot callback phase")),
        }
    }
}

fn validate_graph_receipt(retained: &Retained, receipt: &Value) -> io::Result<()> {
    if retained.snap.as_ref().is_some_and(|options| options.policy.no_lock_deps)
        && receipt["versions"]
            .as_array()
            .is_some_and(|versions| {
                versions
                    .iter()
                    .any(|version| !version["dependenciesGraph"].is_null())
            })
    {
        return Err(invalid("snapshot no-lock-deps receipt includes a dependency graph"));
    }
    Ok(())
}

fn prepare_snapshot(
    retained: &Retained,
    receipt: Value,
    snapshots: &snapshots::State,
) -> io::Result<Prepared> {
    let lane = lane_current(&retained.record.context);
    let directory = scratch::Directory::create()?;
    let snapshot = resolve_snapshot::prepare(
        &retained.record.request.root,
        &directory.0,
        &retained.materials,
        lane.as_ref(),
        &receipt,
        snapshots,
        retained.snap.is_some() || retained.record.context["callbackLifecycle"] == true,
    )?;
    let publication = resolve_publication::prepare(
        &retained.record.request.root,
        &retained.record.context,
        &retained.materials,
        &snapshot.versions,
        &retained.pending,
        &receipt,
        resolve_publication::Options {
            imported_index: retained.record.repository.imported_index(),
            snapshot: retained.snap.is_some()
                || retained.record.context["callbackLifecycle"] == true,
        },
    )?;
    publication.validate()?;
    Ok(Prepared {
        _directory: directory,
        snapshot,
        publication,
        receipt,
        staged_snaps: None,
        objects_persisted: false,
        notifications: 0,
    })
}
