//! Retain canonical package metadata transforms without publishing objects or workspace files.
use super::{Phase, invalid, proof};
use crate::workspace::engine::command::State;
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct PackageFinalize {
    token: String,
    manifests: Vec<Value>,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
pub(in crate::workspace::engine::command::resolve) fn finalize(
    input: PackageFinalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.resolve.as_mut().ok_or_else(|| invalid("snapshot package owner"))?;
    if retained.record.token != input.token
        || (retained.snap.is_none() && retained.record.context["callbackLifecycle"] != true)
    {
        return Err(invalid("snapshot package token"));
    }
    proof::verify(&input.dependency_read_set)?;
    super::validate(retained)?;
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("snapshot package phase"));
    };
    if !prepared.objects_persisted {
        return Err(invalid("snapshot package objects not persisted"));
    }
    prepared.publication.package_manifests(&input.manifests, &prepared.snapshot.versions)?;
    prepared.publication.validate()?;
    retained.record.proofs.extend(input.dependency_read_set);
    Ok((retained.materials.len(), json!({"token":retained.record.token,"result":retained.result})))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct StagePackages {
    token: String,
}

pub(in crate::workspace::engine::command::resolve) fn stage(
    input: &StagePackages,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.resolve.as_mut().ok_or_else(|| invalid("snapshot package owner"))?;
    if retained.record.token != input.token
        || (retained.snap.is_none() && retained.record.context["callbackLifecycle"] != true)
    {
        return Err(invalid("snapshot package token"));
    }
    super::validate(retained)?;
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("snapshot package phase"));
    };
    if prepared.objects_persisted {
        return Err(invalid("snapshot package objects already persisted"));
    }
    prepared.snapshot.validate()?;
    prepared.publication.validate()?;
    if prepared.staged_snaps.is_none() {
        super::builder::stage_prepared(retained)?;
    }
    let controls = persist(retained)?;
    Ok((
        retained.materials.len(),
        json!({"token":retained.record.token,"staged":true,"controlReadSet":controls}),
    ))
}

fn persist(retained: &mut super::Retained) -> io::Result<Vec<proof::Proof>> {
    let mut files = retained.record.repository.commit_import_retained()?;
    let Phase::Prepared(prepared) = &mut retained.finalized else {
        return Err(invalid("snapshot package phase"));
    };
    let root = &retained.record.request.root;
    prepared.snapshot.accept_published(&files)?;
    prepared.publication.accept_published(&files)?;
    prepared.snapshot.commit(root)?;
    files.extend(prepared.snapshot.published_files(root)?);
    files.extend([prepared.publication.stage_index(root)?]);
    proof::accept_published(&mut retained.record.proofs, &files);
    retained.record.repository.accept_published(&files)?;
    prepared.snapshot.accept_published(&files)?;
    let controls = prepared.publication.stage_controls()?;
    retained.record.proofs.retain(|before| {
        !controls
            .iter()
            .any(|after| before.path == after.path)
    });
    retained.record.proofs.extend(controls.iter().cloned());
    prepared.objects_persisted = true;
    prepared.notifications = super::super::super::apply_command::notify(root);
    Ok(controls)
}
