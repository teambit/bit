//! [`Phase`], [`Prepared`], [`builder`], and [`packages`] publication for `snap` and `tag`.

pub(super) mod builder;
pub(super) mod packages;

use super::{
    super::{bitmap, invalid, proof, resolve_publication, resolve_snapshot, scratch},
    Apply, Finalize, Retained,
};
use crate::workspace::snapshots;
use serde_json::{Value, json};
use std::{fs, io};

/// Lifecycle phase of a [`Retained`] `snap` or `tag` resolution transaction ([`Prepared`], [`bitmap::Prepared`]).
pub(super) enum Phase {
    Pending(super::refresh::Callbacks),
    Noop,
    Soft(bitmap::Prepared),
    Prepared(Box<Prepared>),
}

/// Prepared snapshot objects, filesystem publication plan, and staging directory for `snap` or `tag`.
pub(super) struct Prepared {
    _directory: scratch::Directory,
    snapshot: resolve_snapshot::Snapshot,
    publication: resolve_publication::Prepared,
    receipt: Value,
    staged_snaps: Option<Vec<u8>>,
    objects_persisted: bool,
    notifications: usize,
}

/// Finalizes a [`Retained`] `snap` or `tag` resolution transaction and stages objects or [`finalize_soft`] `.bitmap` updates.
pub(super) fn finalize(
    input: Finalize,
    retained: &mut Retained,
    snapshots: &snapshots::State,
) -> io::Result<Value> {
    let token = input.token.trim();
    if token.is_empty()
        || retained.record.token != token
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
        json!(retained.record.request.options.message.as_deref().map_or("", str::trim));
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
    let output = json!({"token":retained.record.token,"result":retained.result,"stagedObjects":prepared.snapshot.staged_objects(),"versions":prepared.snapshot.versions,"packageManifestPlans":package_manifest_plans});
    retained.finalized = Phase::Prepared(Box::new(prepared));
    Ok(output)
}

/// Prepares soft-tag `.bitmap` updates on `retained` ([`Retained`]) into [`Phase::Soft`] without persisting new `Version` objects.
#[inline]
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

#[inline]
fn version_id_and_hash(version: &Value, error: &'static str) -> io::Result<String> {
    let id = version["identity"]
        .as_str()
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .ok_or_else(|| invalid(error))?;
    let hash = version["hash"]
        .as_str()
        .map(str::trim)
        .filter(|hash| !hash.is_empty())
        .ok_or_else(|| invalid(error))?;
    Ok(format!("{id}@{hash}"))
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
            .map(|row| version_id_and_hash(row, "snap component hash"))
            .collect::<io::Result<Vec<_>>>()?
    );
    for row in result["autoSnappedResults"]
        .as_array_mut()
        .ok_or_else(|| invalid("snap automatic report"))?
    {
        let version = versions
            .iter()
            .find(|version| version["identity"] == row["id"])
            .ok_or_else(|| invalid("snap automatic allocation"))?;
        row["id"] = json!(version_id_and_hash(version, "snap automatic allocation hash")?);
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
#[inline]
pub(super) fn validate(retained: &Retained) -> io::Result<()> {
    proof::verify(&retained.record.proofs)?;
    retained.record.repository.validate()
}

impl Phase {
    #[inline]
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
