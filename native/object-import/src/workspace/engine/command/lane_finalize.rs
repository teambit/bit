use super::{LaneFinalize, State, invalid, proof, scratch};
use serde_json::{Value, json};
use std::io;

pub(super) fn run(input: &LaneFinalize, state: &mut State) -> io::Result<(usize, Value)> {
    let mut record = state.record.take().ok_or_else(|| invalid("command lane owner absent"))?;
    let token = input.token.trim();
    if token.is_empty() || record.token != token {
        return Err(invalid("command lane token"));
    }
    let mut prepared = record.planned.take().ok_or_else(|| invalid("command lane plan absent"))?;
    let merge = prepared.plan.merge.as_mut().ok_or_else(|| invalid("command lane merge absent"))?;
    let directory = scratch::Directory::create()?;
    let histories = merge.finalize_lane(&directory.0, &input.lane_receipt)?;
    record.repository.complete_lane_histories(histories)?;
    prepared.plan.history.rebase(&merge.rebased())?;
    prepared.plan.directories.push(directory);
    if needs_lane_referenced(&prepared.plan) {
        super::lane_referenced::prepare(&mut record, &prepared.plan)?;
    }
    record.repository.validate()?;
    proof::verify(&record.proofs)?;
    let output = json!({"token":record.token,"result":prepared.plan.result,"progress":record.repository.progress()});
    record.planned = Some(prepared);
    state.record = Some(record);
    Ok((1, output))
}

fn needs_lane_referenced(plan: &super::planning::Planned) -> bool {
    plan.merge
        .as_ref()
        .is_some_and(|merge| merge.needs_snap().is_none())
}
