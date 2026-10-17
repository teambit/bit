//! Retain acknowledged transfer phases and publish local state around extension callbacks.
use super::{Apply, Finalize, Pending, Publication, Retained, State, hub, invalid, remote};
use crate::export_progress::{self, Event};
use serde_json::{Value, json};
use std::io;

pub(in crate::workspace::engine) fn apply(
    input: &Apply,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.outbound.as_mut().ok_or_else(|| invalid("outbound owner missing"))?;
    if retained.token != input.token || retained.transfer.ids.is_some() {
        return Err(invalid("outbound owner token"));
    }
    if retained.transfer.failed.is_some() {
        return Err(invalid("outbound failed owner token"));
    }
    let pending = !retained.pending.is_empty();
    match execute_transfer(retained) {
        Ok(ids) => retained.transfer.ids = Some(ids),
        Err(error) => retained.transfer.failed = Some(error.to_string()),
    }
    let objects = retained.pending
        .iter()
        .map(|batch| batch.objects.len())
        .sum::<usize>();
    Ok((
        objects,
        json!({"token":retained.token,"owner":"rust",
        "scopes":retained.pending.iter().map(|batch| &batch.scope).collect::<Vec<_>>(),
        "clientId":retained.client_id,"objectCount":objects,"pending":pending,
        "effectsOwned":true,"failure":retained.transfer.failed,"centralHub":retained.transfer.hub.is_some(),"hubMessages":retained.transfer.messages,
        "failurePhase":retained.transfer.failed.as_ref().map(|_| retained.transfer.progress.phase),
        "attemptedScopes":retained.transfer.progress.attempted_scopes,
        "progressObserved":retained.transfer.progress.observed}),
    ))
}

fn execute_transfer(retained: &mut Retained) -> io::Result<Vec<String>> {
    retained.transfer.progress.phase = "prepare";
    retained.local.packages.validate()?;
    retained.local.selection_history.stage()?;
    if retained.pending.is_empty() {
        return Ok(Vec::new());
    }
    match &retained.publication {
        Some(Publication::Main(plan)) => plan.stage_history()?,
        Some(Publication::Lane { prepared, .. }) => prepared.stage_history()?,
        None => {}
    }
    if retained.transfer.hub.is_some() {
        retained.transfer.progress.phase = "hub";
        return hub::push(retained);
    }
    let mut actions = remote::Actions::new(retained)?;
    push_and_validate(retained, &mut actions)?;
    let exported_ids = persist(retained, &mut actions)?;
    if let Some(context) = retained.resume.take() {
        if let Some(Publication::Main(plan)) = retained.publication.as_mut() {
            plan.resume_acknowledgement(&context.selected, &exported_ids)?;
        } else if retained.publication.is_none() && !exported_ids.is_empty() {
            return Err(invalid("outbound resume acknowledgement"));
        }
    }
    Ok(exported_ids)
}

/// Push every batch, then validate them all; a failure cleans the pushed
/// pending objects.
fn push_and_validate(retained: &mut Retained, actions: &mut remote::Actions) -> io::Result<()> {
    retained.transfer.progress.phase = "push";
    if retained.resume.is_none() {
        for (pushed, batch) in retained.pending.iter().enumerate() {
            retained.transfer.progress.attempted_scopes.push(batch.scope.clone());
            retained.transfer.progress.observed |= export_progress::emit(Event::Transfer {
                scope: batch.scope.clone(),
                objects: batch.objects.len(),
            });
            if let Err(error) = remote::push(retained, batch) {
                cleanup(retained, actions, &retained.pending[..pushed]);
                return Err(error);
            }
        }
    }
    retained.transfer.progress.phase = "validate";
    retained.transfer.progress.observed |= export_progress::emit(Event::Verify);
    // Every batch is validated; the first failure is reported.
    let errors: Vec<io::Error> = retained.pending
        .iter()
        .filter_map(|batch| actions.validate(retained, batch).err())
        .collect();
    let Some(error) = errors.into_iter().next() else {
        retained.transfer.progress.observed |= export_progress::emit(Event::Verified);
        return Ok(());
    };
    if retained.resume.is_none() {
        cleanup(retained, actions, &retained.pending);
    }
    Err(io::Error::new(error.kind(), format!("outbound validate failed: {error}")))
}

fn cleanup(retained: &Retained, actions: &mut remote::Actions, batches: &[Pending]) {
    for batch in batches {
        let _ = actions.cleanup(retained, batch);
    }
}

/// Preserve each remote acknowledgement in the published remote batch order.
fn persist(retained: &mut Retained, actions: &mut remote::Actions) -> io::Result<Vec<String>> {
    retained.transfer.progress.phase = "persist";
    let mut exported_ids = Vec::new();
    for batch in &retained.pending {
        retained.transfer.progress.observed |=
            export_progress::emit(Event::Persist { scope: batch.scope.clone() });
        exported_ids.extend(actions.persist(retained, batch)?);
    }
    Ok(exported_ids)
}

pub(in crate::workspace::engine) fn stage(
    input: &Finalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let retained = state.outbound.as_mut().ok_or_else(|| invalid("outbound owner missing"))?;
    let ids = retained.transfer.ids
        .as_ref()
        .filter(|_| retained.token == input.token)
        .ok_or_else(|| invalid("outbound stage owner token"))?;
    let updated = match retained.publication.as_mut() {
        Some(Publication::Main(plan)) => plan.stage(ids)?,
        Some(Publication::Lane { prepared, .. }) => prepared.stage(ids)?,
        None => Vec::new(),
    };
    let mut receipt = publication_receipt(retained, ids, false);
    receipt["staged"] = json!(true);
    receipt["updatedLocally"] = json!(updated);
    receipt
        .as_object_mut()
        .unwrap()
        .extend(
            retained.local.packages
                .receipt(Some(&updated))
                .as_object()
                .unwrap()
                .clone(),
        );
    Ok((ids.len(), receipt))
}

fn publication_receipt(retained: &Retained, exported_ids: &[String], applied: bool) -> Value {
    let lane = retained.publication.as_ref().and_then(Publication::lane_name);
    let (mut updates, removed) = retained.publication
        .as_ref()
        .map(Publication::receipt_ids)
        .unwrap_or_default();
    let components = super::publication_state::components(retained, exported_ids);
    updates.retain(|id| components.contains(id));
    json!({"token":retained.token,"owner":"rust","applied":applied,
        "componentsIds":components,"newIdsOnRemote":exported_ids,"nonExistOnBitMap":retained.publication.as_ref().map(Publication::non_existing_ids).unwrap_or_default(),
        "removedIds":removed,"missingScope":[],"exportedLanes":lane.into_iter().collect::<Vec<_>>(),
        "laneUpdateIds":updates,"rippleJobs":retained.transfer.jobs,"rippleJobUrls":retained.transfer.urls})
}

pub(in crate::workspace::engine) fn finalize(
    input: &Finalize,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let mut retained = state.outbound.take().ok_or_else(|| invalid("outbound owner missing"))?;
    if retained.token != input.token {
        return Err(invalid("outbound owner token"));
    }
    let exported_ids =
        retained.transfer.ids.take().ok_or_else(|| invalid("outbound owner not persisted"))?;
    let receipt = publication_receipt(&retained, &exported_ids, true);
    if let Some(plan) = retained.publication {
        match plan {
            Publication::Main(plan) => plan.commit(&exported_ids)?,
            Publication::Lane { prepared, .. } => prepared.commit(&exported_ids)?,
        }
    } else if !exported_ids.is_empty() {
        return Err(invalid("outbound unexpected remote ids"));
    }
    Ok((receipt["componentsIds"].as_array().map_or(0, Vec::len), receipt))
}
