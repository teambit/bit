mod apply;
mod materialize;
mod plan;
mod prepare;
mod removals;
mod retarget;
mod select;
mod spool;
#[cfg(test)]
mod tests;
mod wire;

use serde_json::{Value, json};
use std::io;
#[derive(Default)]
pub(crate) struct State {
    select: select::State,
    plans: plan::State,
}
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind {
        "checkoutApply" => apply::apply(input, &state.plans),
        "checkoutMaterialize" => materialize::apply(input, &state.plans),
        "checkoutPrepare" => prepare::prepare(&input, &mut state.plans, None),
        "checkoutRemovals" => removals::apply(input, &state.plans),
        "checkoutFinish" => {
            let request: wire::Token = serde_json::from_value(input).map_err(io::Error::other)?;
            state.plans.plans
                .remove(&request.token)
                .ok_or_else(|| invalid("stale checkout plan"))?;
            Ok(json!({"finished":true}))
        }
        "checkoutSelectBegin" => state.select.begin(&input),
        "checkoutSelectReceipt" => state.select.receipt(input),
        "checkoutApplyDecision" => decision(&input),
        _ => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            "unsupported checkout transition operation",
        )),
    }
}
pub(crate) fn prepare_with_workspace(
    input: &Value,
    state: &mut State,
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<Value> {
    prepare::prepare(input, &mut state.plans, Some(snapshots))
}
pub(crate) fn prepare_with_overlay(
    input: &Value,
    state: &mut State,
    snapshots: Option<&crate::workspace::snapshots::State>,
    overlay: &crate::command_import::Overlay,
) -> io::Result<Value> {
    prepare::prepare_with_overlay(input, &mut state.plans, snapshots, Some(overlay))
}
fn decision(input: &Value) -> io::Result<Value> {
    let current = input["currentExists"]
        .as_bool()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "checkout current flag"))?;
    let force = input["forceOurs"]
        .as_bool()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "checkout force flag"))?;
    let conflicts = input["hasConflicts"]
        .as_bool()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "checkout conflict flag"))?;
    Ok(
        json!({"keepOurs":current && (force || (conflicts && input["strategy"].as_str()==Some("ours")))}),
    )
}

fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub(crate) fn retarget(input: Value, state: &mut State) -> io::Result<Value> {
    retarget::apply(input, &mut state.plans)
}

pub(crate) fn order(
    token: &str,
    order: &[usize],
    indexed: bool,
    state: &mut State,
) -> io::Result<Value> {
    let plan = state.plans.plans.get_mut(token).ok_or_else(|| invalid("stale merge order plan"))?;
    if order.len() != plan.merge_rows.len()
        || order
            .iter()
            .copied()
            .collect::<std::collections::HashSet<_>>()
            .len()
            != order.len()
    {
        return Err(invalid("merge plan permutation"));
    }
    let rows = order
        .iter()
        .map(|index| {
            plan.merge_rows
                .get(*index)
                .cloned()
                .ok_or_else(|| invalid("merge plan row range"))
        })
        .collect::<io::Result<Vec<_>>>()?;
    plan.merge_rows = rows;
    if indexed { Ok(json!({"rowIndices":order})) } else { Ok(json!({"mergeRows":plan.merge_rows})) }
}
