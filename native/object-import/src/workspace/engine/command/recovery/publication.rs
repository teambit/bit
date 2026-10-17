use super::{Operation, Restore, State, invalid, proof, reset, write_pending};
use serde_json::{Value, json};
use std::io;

pub(super) fn restore(input: &Restore, state: &mut State) -> io::Result<(usize, Value)> {
    super::super::bitmap::validate_history_file_id(&input.file_id)?;
    let mut retained = state.recovery.take().ok_or_else(|| invalid("recovery owner absent"))?;
    if retained.operation != Operation::LaneAbort
        || retained.restored
        || retained.record.token != input.token
    {
        return Err(invalid("recovery restoration state"));
    }
    if let Some(prepared) = retained.record.planned.as_ref() {
        reset::validate(&retained.record, prepared)?;
    } else if retained.record.context["callbackLifecycle"] == true {
        proof::verify(&retained.record.proofs)?;
        retained.record.repository.validate()?;
    } else {
        return Err(invalid("recovery plan absent"));
    }
    proof::verify(&input.dependency_read_set)?;
    retained.restore.validate_dependencies(&input.dependency_read_set)?;
    retained.restore.validate()?;
    let controls = retained.restore.controls();
    controls.validate(&input.dependency_read_set)?;
    controls.validate(&retained.record.proofs)?;
    retained.restore.publish()?;
    retained.record.repository.accept_recovery_staged(
        &retained.record.request.root,
        retained.restore.staged_snaps.as_deref(),
    )?;
    write_pending(&retained.record.request.root, &json!([]))?;
    crate::workspace::actions::remove(&retained.record.request.root.join("merge-conflict"))?;
    let projected = controls.project(&input.dependency_read_set, false)?;
    retained.record.proofs = controls.project(&retained.record.proofs, true)?;
    retained.record.proofs.extend(projected.iter().cloned());
    retained.record.proofs = proof::unique(retained.record.proofs);
    retained.restored = true;
    retained.restored_file_id = Some(input.file_id.clone());
    let output =
        json!({"restored":true,"dependencyReadSet":projected,"restoredControls":controls.paths()});
    let count = retained.record.targets.len();
    state.recovery = Some(retained);
    Ok((count, output))
}

pub(super) fn validate_apply(
    input: &super::Apply,
    retained: &super::Retained,
    prepared: &super::super::PreparedPlan,
) -> io::Result<Option<Value>> {
    if retained.operation != Operation::LaneAbort {
        if input.checkout_error.is_some() {
            return Err(invalid("component recovery error receipt"));
        }
        reset::validate(&retained.record, prepared)?;
        retained.restore.validate()?;
        return Ok(None);
    }
    if !retained.restored || retained.restored_file_id.as_deref() != Some(&input.file_id) {
        return Err(invalid("lane recovery requires restoration"));
    }
    let Some(error) = &input.checkout_error else {
        proof::verify(&retained.record.proofs)?;
        return Ok(None);
    };
    if error.message.len() > 16384 {
        return Err(invalid("recovery checkout error limit"));
    }
    Ok(Some(
        json!({"restoredItems":retained.restore.items,"checkoutError":{"message":error.message}}),
    ))
}

pub(super) fn failed_checkout(
    input: &super::Apply,
    retained: &super::Retained,
) -> io::Result<Option<Value>> {
    let Some(error) = &input.checkout_error else { return Ok(None) };
    if retained.operation != Operation::LaneAbort
        || !retained.restored
        || retained.restored_file_id.as_deref() != Some(&input.file_id)
        || error.message.len() > 16384
    {
        return Err(invalid("recovery checkout error receipt"));
    }
    Ok(Some(
        json!({"restoredItems":retained.restore.items,"checkoutError":{"message":error.message}}),
    ))
}
