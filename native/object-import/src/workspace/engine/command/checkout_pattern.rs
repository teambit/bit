//! Bind CLI component predicates to the authoritative checkout owner before planning.
use super::{State, input::Operation, invalid, proof};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    token: String,
    identities: Vec<String>,
    #[serde(default)]
    read_set: Vec<proof::Proof>,
}

pub(in crate::workspace::engine) fn select(
    input: Request,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let record = state.record.as_mut().ok_or_else(|| invalid("checkout selection owner absent"))?;
    if record.token != input.token
        || record.request.operation != Operation::Checkout
        || !record.request.defer_checkout_pattern
        || record.planned.is_some()
    {
        return Err(invalid("checkout selection state"));
    }
    let known = record.targets
        .iter()
        .filter_map(|target| target["identity"].as_str())
        .collect::<HashSet<_>>();
    let selected = input.identities
        .iter()
        .map(String::as_str)
        .collect::<HashSet<_>>();
    if selected.is_empty()
        || selected.len() != input.identities.len()
        || !selected.is_subset(&known)
    {
        return Err(invalid("checkout selected identities"));
    }
    proof::verify(&record.proofs)?;
    proof::verify(&input.read_set)?;
    record.repository.validate()?;
    record.proofs.extend(input.read_set);
    record.targets.retain(|target| {
        target["identity"]
            .as_str()
            .is_some_and(|id| selected.contains(id))
    });
    record.request.defer_checkout_pattern = false;
    Ok((record.targets.len(), json!({"token":record.token,"targets":record.targets})))
}
