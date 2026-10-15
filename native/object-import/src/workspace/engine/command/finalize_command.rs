use super::{Finalize, State, bitmap, invalid, proof, scratch};
use serde_json::{Value, json};
use std::io;
pub(super) fn run(input: &Finalize, state: &mut State) -> io::Result<(usize, Value)> {
    let mut record = state.record.take().ok_or_else(|| invalid("command finalize owner absent"))?;
    if record.token != input.token {
        return Err(invalid("command finalize token"));
    }
    let mut prepared =
        record.planned.take().ok_or_else(|| invalid("command finalize missing plan"))?;
    if prepared.snap_bitmap.is_some() {
        return Err(invalid("command finalize already complete"));
    }
    proof::verify(&input.dependency_read_set)?;
    record.proofs.extend(input.dependency_read_set.iter().cloned());
    let directory = scratch::Directory::create()?;
    let merge = prepared.plan.merge.as_mut().ok_or_else(|| invalid("command finalize nonmerge"))?;
    prepared.plan.result["mergeSnapResults"] =
        merge.finalize(&record, &directory.0, &input.snap_receipt)?;
    if !merge.removed_ids().is_empty() {
        prepared.plan.result["removedComponents"] = json!(merge.removed_snap_ids()?);
    }
    let updates = merge.snap_updates()?;
    let count = super::policy::workspace_count(&record.context, merge.policy.as_ref())?;
    prepared.snap_bitmap =
        Some(bitmap::prepare_after(&prepared.bitmap, &record.context, &updates)?);
    prepared.plan.directories.push(directory);
    super::lane_referenced::prepare(&mut record, &prepared.plan)?;
    record.repository.validate()?;
    proof::verify(&record.proofs)?;
    let mut progress = record.repository.progress();
    progress["loads"] = if record.request.options.lane.is_some() && updates.is_empty() {
        json!([count])
    } else {
        json!([count, updates.len(), count, count])
    };
    let output = json!({"token":record.token,"result":prepared.plan.result,"progress":progress});
    record.planned = Some(prepared);
    state.record = Some(record);
    Ok((updates.len(), output))
}
