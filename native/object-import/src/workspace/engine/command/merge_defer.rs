//! Retain one merge capture while deferring its snapshot until after materialization.
use super::{State, input::Operation, invalid, proof};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    token: String,
}

pub(in crate::workspace::engine) fn run(
    input: &Request,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let token = input.token.trim();
    if token.is_empty() {
        return Err(invalid("merge snapshot deferral token"));
    }
    let record = state.record.as_mut().ok_or_else(|| invalid("merge owner absent"))?;
    if record.token != token || record.request.operation != Operation::Merge {
        return Err(invalid("merge snapshot deferral token"));
    }
    proof::verify(&record.proofs)?;
    record.repository.validate()?;
    let prepared = record.planned.as_mut().ok_or_else(|| invalid("merge not planned"))?;
    if prepared.snap_bitmap.is_some() {
        return Err(invalid("merge snapshot already finalized"));
    }
    let merge = prepared.plan.merge.as_mut().ok_or_else(|| invalid("merge state absent"))?;
    let identities = merge.defer_snapshot()?;
    Ok((identities.len(), json!({"token":token,"identities":identities})))
}
