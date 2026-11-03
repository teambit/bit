//! Stateful checkout transition state machine ([`State`]) for preparing, applying ([`apply`]), and materializing checkout plans.

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
/// Per-helper checkout transition state owning active selection records and prepared plans.
#[derive(Debug, Default, Clone, PartialEq, Eq)]
pub(crate) struct State {
    /// Active multi-step component version selection state machine.
    select: select::State,
    /// Prepared checkout plans retained by plan token.
    plans: plan::State,
}
/// Dispatch a checkout transition operation (`kind`) with [`Value`] `input` against [`State`].
pub(crate) fn apply(kind: &str, input: Value, state: &mut State) -> io::Result<Value> {
    match kind.trim() {
        "checkoutApply" => apply::apply(input, &state.plans),
        "checkoutMaterialize" => materialize::apply(input, &state.plans),
        "checkoutPrepare" => prepare::prepare(&input, &mut state.plans, None),
        "checkoutRemovals" => removals::apply(input, &state.plans),
        "checkoutFinish" => {
            let request: wire::Token = serde_json::from_value(input).map_err(io::Error::other)?;
            let token = request.token.trim();
            if token.is_empty() {
                return Err(invalid("stale checkout plan"));
            }
            state.plans.plans.remove(token).ok_or_else(|| invalid("stale checkout plan"))?;
            Ok(json!({"finished":true}))
        }
        "checkoutSelectBegin" => state.select.begin(&input),
        "checkoutSelectReceipt" => state.select.receipt(input),
        "checkoutApplyDecision" => decision(&input),
        _ => Err(invalid("unsupported checkout transition operation")),
    }
}
/// Prepare a checkout plan in [`State`] `state` using retained workspace `snapshots` via [`prepare::prepare`].
#[inline]
pub(crate) fn prepare_with_workspace(
    input: &Value,
    state: &mut State,
    snapshots: &crate::workspace::snapshots::State,
) -> io::Result<Value> {
    prepare::prepare(input, &mut state.plans, Some(snapshots))
}
/// Prepare a checkout plan in [`State`] `state` using optional workspace `snapshots` and an import `overlay` via [`prepare::prepare_with_overlay`].
#[inline]
pub(crate) fn prepare_with_overlay(
    input: &Value,
    state: &mut State,
    snapshots: Option<&crate::workspace::snapshots::State>,
    overlay: &crate::command_import::Overlay,
) -> io::Result<Value> {
    prepare::prepare_with_overlay(input, &mut state.plans, snapshots, Some(overlay))
}
/// Evaluate whether `checkoutApplyDecision` should retain current workspace files (`keepOurs`).
#[inline]
fn decision(input: &Value) -> io::Result<Value> {
    let current =
        input["currentExists"].as_bool().ok_or_else(|| invalid("checkout current flag"))?;
    let force = input["forceOurs"].as_bool().ok_or_else(|| invalid("checkout force flag"))?;
    let conflicts =
        input["hasConflicts"].as_bool().ok_or_else(|| invalid("checkout conflict flag"))?;
    if let Some(strategy) = input.get("strategy")
        && !strategy.is_null()
        && !strategy.is_string()
    {
        return Err(invalid("checkout strategy flag"));
    }
    let ours = input["strategy"]
        .as_str()
        .is_some_and(|strategy| strategy.trim().eq_ignore_ascii_case("ours"));
    Ok(json!({"keepOurs":current && (force || (conflicts && ours))}))
}

#[inline]
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}

pub(crate) fn order(
    token: &str,
    order: &[usize],
    indexed: bool,
    state: &mut State,
) -> io::Result<Value> {
    let token = token.trim();
    if token.is_empty() {
        return Err(invalid("stale merge order plan"));
    }
    let plan = state.plans.plans.get_mut(token).ok_or_else(|| invalid("stale merge order plan"))?;
    let mut seen = std::collections::HashSet::with_capacity(order.len());
    if order.len() != plan.merge_rows.len()
        || !order
            .iter()
            .copied()
            .all(|index| seen.insert(index))
    {
        return Err(invalid("merge plan permutation"));
    }
    if order
        .iter()
        .any(|&index| index >= plan.merge_rows.len())
    {
        return Err(invalid("merge plan row range"));
    }
    plan.merge_rows = order
        .iter()
        .map(|&index| std::mem::take(&mut plan.merge_rows[index]))
        .collect();
    if indexed { Ok(json!({"rowIndices":order})) } else { Ok(json!({"mergeRows":plan.merge_rows})) }
}

#[inline]
pub(crate) fn retarget_with_overlay(
    input: Value,
    state: &mut State,
    overlay: Option<&crate::command_import::Overlay>,
) -> io::Result<Value> {
    retarget::apply_with_overlay(input, &mut state.plans, overlay)
}
