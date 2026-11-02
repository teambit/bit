//! Persist only staged snap identities via [`StageBuild`] before the builder; publish via [`BuildFinalize`].

use super::{Phase, invalid, proof};
use crate::workspace::{engine::command::State, snapshots};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{io, path::PathBuf};

/// Request payload to stage snap identities before running the builder pipeline.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct StageBuild {
    token: String,
}

/// Deserialized builder finalization payload carrying built `Version` extensions and artifact records.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct BuildFinalize {
    token: String,
    versions: Vec<Value>,
    #[serde(default)]
    artifact_root: Option<PathBuf>,
    #[serde(default)]
    artifacts: Vec<Value>,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}

pub(in crate::workspace::engine::command::resolve) fn stage(
    input: &StageBuild,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.resolve.as_mut().ok_or_else(|| invalid("snapshot builder owner"))?;
    let token = input.token.trim();
    if token.is_empty() || retained.record.token != token {
        return Err(invalid("snapshot builder token"));
    }
    super::validate(retained)?;
    stage_prepared(retained)?;
    Ok((retained.materials.len(), json!({"token":retained.record.token,"staged":true})))
}

pub(in crate::workspace::engine::command::resolve) fn finalize(
    input: BuildFinalize,
    snapshots: &mut snapshots::State,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.resolve.take().ok_or_else(|| invalid("snapshot builder owner"))?;
    let result = rebuild(input, &mut retained, snapshots);
    let count = retained.materials.len();
    snapshots.command.resolve = Some(retained);
    result.map(|output| (count, output))
}

fn rebuild(
    input: BuildFinalize,
    retained: &mut super::super::Retained,
    snapshots: &snapshots::State,
) -> io::Result<Value> {
    let token = input.token.trim();
    if token.is_empty() || retained.record.token != token {
        return Err(invalid("snapshot builder token"));
    }
    proof::verify(&input.dependency_read_set)?;
    super::validate(retained)?;
    let Phase::Prepared(previous) = &retained.finalized else {
        return Err(invalid("snapshot builder phase"));
    };
    if previous.objects_persisted {
        return Err(invalid("snapshot builder objects already persisted"));
    }
    let staged =
        previous.staged_snaps.as_deref().ok_or_else(|| invalid("snapshot build was not staged"))?;
    let receipt = build_receipt(
        &previous.receipt,
        input.versions,
        input.artifacts,
        input.artifact_root.as_ref(),
    )?;
    let staged = staged.to_vec();
    let mut prepared = super::prepare_snapshot(retained, receipt, snapshots)?;
    prepared.publication.keep_staged_snaps(&retained.record.request.root, &staged)?;
    prepared.publication.validate()?;
    let package_manifest_plans =
        prepared.publication.package_manifest_plans(&prepared.snapshot.versions)?;
    let output = json!({"token":retained.record.token,"result":retained.result,"versions":prepared.snapshot.versions,"stagedObjects":prepared.snapshot.staged_objects(),"packageManifestPlans":package_manifest_plans});
    prepared.staged_snaps = Some(staged);
    retained.finalized = Phase::Prepared(Box::new(prepared));
    retained.record.proofs.extend(input.dependency_read_set);
    Ok(output)
}

fn build_receipt(
    original: &Value,
    versions: Vec<Value>,
    artifacts: Vec<Value>,
    artifact_root: Option<&PathBuf>,
) -> io::Result<Value> {
    let mut receipt = original.clone();
    receipt["artifacts"] = Value::Array(artifacts);
    receipt["artifactRoot"] = json!(artifact_root);
    let allocations =
        receipt["versions"].as_array_mut().ok_or_else(|| invalid("snapshot allocations"))?;
    if versions.len() != allocations.len() {
        return Err(invalid("snapshot builder version count"));
    }
    for (allocation, version) in allocations.iter_mut().zip(versions) {
        let alloc_id = version_identity(allocation);
        let ver_id = version_identity(&version);
        if alloc_id.is_none() || alloc_id != ver_id {
            return Err(invalid("snapshot builder version identity"));
        }
        allocation["buildData"] = version;
    }
    Ok(receipt)
}

#[inline]
fn version_identity(entry: &Value) -> Option<&str> {
    entry["identity"]
        .as_str()
        .or_else(|| entry["id"].as_str())
        .map(str::trim)
        .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
        .filter(|base| !base.is_empty())
}

pub(super) fn stage_prepared(retained: &mut super::Retained) -> io::Result<()> {
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("snapshot builder phase"));
    };
    if prepared.staged_snaps.is_some() {
        return Err(invalid("snapshot already staged for build"));
    }
    prepared.snapshot.validate()?;
    let bytes = prepared.publication.stage_snaps(&retained.record.request.root)?;
    let path = crate::scope_path(&retained.record.request.root).join("staged-snaps");
    for proof in &mut retained.record.proofs {
        if proof.path == path {
            *proof = proof::content(&path, &bytes);
        }
    }
    retained.record.repository.accept_recovery_staged(&retained.record.request.root, Some(&bytes))?;
    prepared.staged_snaps = Some(bytes);
    Ok(())
}
