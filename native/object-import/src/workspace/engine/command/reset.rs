//! Reset planning against a retained, potentially restored workspace context.
//! Recovery validates the live controls before restoring metadata; bitmap commit
//! subsequently requires the exact projected bytes, never the old live bitmap.
use super::{
    PreparedPlan, Record, apply_command, bitmap, input, invalid, materialization, plan_command,
    planning, proof, reset_config,
};
use crate::workspace::snapshots;
use serde_json::Value;
use std::io;

pub(super) fn plan(
    record: &mut Record,
    current: Vec<Value>,
    semver: &Value,
    bitmap_bytes: Vec<u8>,
    snapshots: &mut snapshots::State,
    pool: &rayon::ThreadPool,
) -> io::Result<PreparedPlan> {
    if record.request.operation != input::Operation::Checkout
        || record.request.options.to.as_deref() != Some("reset")
        || record.request.options.lane.is_some()
    {
        return Err(invalid("recovery requires an ordinary reset plan"));
    }
    if record.request.options.force_ours
        || record.request.options.force_theirs
        || record.request.options.strategy.is_some()
        || !record.request.options.skip_dependency_installation
    {
        return Err(invalid("recovery requires an ordinary reset plan"));
    }
    plan_command::validate_versions(record)?;
    let plan = pool.install(|| planning::checkout_reset(record, current, semver, snapshots, pool))?;
    let configuration = reset_config::prepare(record, &plan)?;
    let mut bitmap = plan_command::prepare_bitmap_bytes(record, &plan, bitmap_bytes)?;
    let identities = plan.materials
        .iter()
        .map(|material| {
            material.output["id"]
                .as_str()
                .and_then(|id| id.rsplit_once('@'))
                .map(|(identity, _)| identity.to_owned())
                .ok_or_else(|| invalid("reset written configuration identity"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    bitmap.clear_config(&record.context, &identities)?;
    let prepared =
        PreparedPlan { plan, bitmap, snap_bitmap: None, reset_config: Some(configuration) };
    validate(record, &prepared)?;
    Ok(prepared)
}

/// Check retained live inputs before recovery begins changing workspace controls.
pub(super) fn validate(record: &Record, prepared: &PreparedPlan) -> io::Result<()> {
    proof::verify(&record.proofs)?;
    validate_inputs(record, prepared)
}

/// The recovery owner verifies its exact projected control proofs first. The
/// reset then checks the restored bitmap and all retained checkout inputs.
pub(super) fn validate_after_restore(record: &Record, prepared: &PreparedPlan) -> io::Result<()> {
    prepared.bitmap.validate()?;
    validate_inputs(record, prepared)
}

fn validate_inputs(record: &Record, prepared: &PreparedPlan) -> io::Result<()> {
    if prepared.plan.merge.is_some() || prepared.snap_bitmap.is_some() {
        return Err(invalid("recovery reset cannot publish merge state"));
    }
    record.repository.validate()?;
    if let Some(configuration) = &prepared.reset_config {
        configuration.validate()?;
    }
    planning::validate_sources(&prepared.plan)?;
    for material in &prepared.plan.materials {
        materialization::validate(material, &record.request.root)?;
    }
    Ok(())
}

/// Called after the recovery owner has restored its projected controls. A failure
/// here is a checkout failure after restoration and must never trigger fallback.
pub(super) fn publish(
    record: &Record,
    prepared: &mut PreparedPlan,
    file_id: &str,
) -> io::Result<(Option<String>, usize)> {
    bitmap::validate_history_file_id(file_id)?;
    validate_after_restore(record, prepared)?;
    record.repository.commit_import()?;
    prepared.plan.history.commit(&record.request.root)?;
    apply_command::publish_sources(&mut prepared.plan)?;
    if let Some(configuration) = &prepared.reset_config {
        configuration.commit()?;
    }
    apply_command::publish_bitmap(prepared, record, file_id)
}
