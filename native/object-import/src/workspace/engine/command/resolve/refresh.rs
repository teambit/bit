//! Refresh callback-owned sources after selection without rerunning the dependent cascade.

#[cfg(test)]
mod tests;

use super::{Retained, State, invalid, planning, projection, proof, publication, source_proofs};
use crate::workspace::snapshots;
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io, path::PathBuf};

#[derive(Default)]
pub(super) struct Callbacks {
    pub paths: HashSet<PathBuf>,
    pub validated_sources: Option<Vec<proof::Proof>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Validate {
    token: String,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Refresh {
    token: String,
    current: Vec<Value>,
    components: Vec<projection::Component>,
    #[serde(default)]
    dependency_read_set: Vec<proof::Proof>,
    #[serde(default)]
    source_changes: Vec<SourceChange>,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SourceChange {
    before: proof::Proof,
    after: proof::Proof,
}

pub(super) fn validate(input: &Validate, state: &mut State) -> io::Result<(usize, Value)> {
    let retained = state.resolve.as_mut().ok_or_else(|| invalid("snapshot owner absent"))?;
    pending(retained, &input.token)?;
    proof::verify(&input.dependency_read_set)?;
    proof::verify(&retained.record.proofs)?;
    retained.record.repository.validate()?;
    let paths = &retained.finalized.callbacks_mut()?.paths;
    let sources = retained.record.proofs
        .iter()
        .filter(|proof| proof.is_content() && paths.contains(&proof.path))
        .cloned()
        .collect::<Vec<_>>();
    retained.finalized.callbacks_mut()?.validated_sources = Some(sources.clone());
    Ok((sources.len(), json!({"token":retained.record.token,"sourceReadSet":sources})))
}

fn pending(retained: &Retained, token: &str) -> io::Result<()> {
    if retained.record.token != token
        || retained.materials.is_empty()
        || !matches!(retained.finalized, publication::Phase::Pending(_))
    {
        return Err(invalid("snapshot refresh state"));
    }
    Ok(())
}

pub(super) fn apply(
    input: Refresh,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<(usize, Value)> {
    let mut retained =
        snapshots.command.resolve.take().ok_or_else(|| invalid("snapshot owner absent"))?;
    let result = refresh(input, &mut retained, snapshots, pool);
    let count = retained.materials.len();
    snapshots.command.resolve = Some(retained);
    result.map(|output| (count, output))
}

fn refresh(
    input: Refresh,
    retained: &mut Retained,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<Value> {
    pending(retained, &input.token)?;
    replace_sources(retained, &input.source_changes)?;
    planning::validate_current(retained, &input.current, input.components.len())?;
    let captured = super::planning::capture_for_snapshot(retained, input.current, snapshots, pool)?;
    retained.record.proofs.extend(source_proofs::capture(&captured, snapshots)?);
    retained.record.proofs.extend(input.dependency_read_set);
    let mut components = input.components;
    planning::bind_new(retained, &retained.selected, &captured, &mut components)?;
    let previous = std::mem::take(&mut retained.materials);
    for material in previous {
        if material.hidden {
            retained.materials.push(material);
            continue;
        }
        let mut updated = planning::material(
            retained,
            &material.identity,
            material.participation,
            &captured,
            &components,
        )?;
        updated.version_state = material.version_state;
        updated.pending = material.pending;
        retained.materials.push(updated);
    }
    let mut materials = std::mem::take(&mut retained.materials);
    super::root::provenance(retained, &mut materials)?;
    let checked = planning::preflight(retained, &mut materials, snapshots);
    retained.materials = materials;
    checked?;
    proof::verify(&retained.record.proofs)?;
    retained.record.repository.validate()?;
    Ok(
        json!({"token":retained.record.token,"selectedIds":retained.selected,"needsSnap":retained.materials.iter().map(|material|&material.identity).collect::<Vec<_>>(),"result":retained.result}),
    )
}

fn replace_sources(retained: &mut Retained, changes: &[SourceChange]) -> io::Result<()> {
    let before = retained.finalized
        .callbacks_mut()?
        .validated_sources
        .take()
        .ok_or_else(|| invalid("snapshot callbacks were not validated"))?;
    replace_owned_proofs(&mut retained.record.proofs, &before, changes)
}

fn replace_owned_proofs(
    proofs: &mut [proof::Proof],
    before: &[proof::Proof],
    changes: &[SourceChange],
) -> io::Result<()> {
    let mut paths = std::collections::HashSet::new();
    for change in changes {
        if !change.after.is_content()
            || change.before.path != change.after.path
            || !before.contains(&change.before)
            || !paths.insert(&change.before.path)
        {
            return Err(invalid("snapshot callback source ownership"));
        }
        proof::verify(std::slice::from_ref(&change.after))?;
        for proof in &mut *proofs {
            if *proof == change.before {
                *proof = change.after.clone();
            }
        }
    }
    proof::verify(proofs)
}
