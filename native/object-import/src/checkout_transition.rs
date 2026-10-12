mod apply;
mod materialize;
mod plan;
mod prepare;
mod removals;
mod select;
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
        "checkoutPrepare" => prepare::prepare(&input, &mut state.plans),
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
