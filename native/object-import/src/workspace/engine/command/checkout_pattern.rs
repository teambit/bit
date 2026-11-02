//! Bind CLI component predicates ([`Request`], [`select`]) to the authoritative checkout owner ([`State`]) before planning.

use super::{State, input::Operation, invalid, proof};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{collections::HashSet, io};

/// Deserialized checkout pattern selection request with component identities and read proofs.
#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(in crate::workspace::engine) struct Request {
    token: String,
    identities: Vec<String>,
    #[serde(default)]
    read_set: Vec<proof::Proof>,
}

/// Filters the prepared checkout or merge targets on `state` to the validated `input.identities` subset.
pub(in crate::workspace::engine) fn select(
    input: Request,
    state: &mut State,
) -> io::Result<(usize, Value)> {
    let record = state.record.as_mut().ok_or_else(|| invalid("checkout selection owner absent"))?;
    if record.token != input.token.trim()
        || input.identities.len() > 4096
        || !matches!(record.request.operation, Operation::Checkout | Operation::Merge)
        || !record.request.defer_checkout_pattern
        || record.planned.is_some()
    {
        return Err(invalid("checkout selection state"));
    }
    if input.identities.is_empty() {
        return Err(invalid("checkout selected identities"));
    }
    let known = record.targets
        .iter()
        .filter_map(target_identity)
        .collect::<HashSet<_>>();
    let selected = input.identities
        .iter()
        .map(|id| {
            let trimmed = id.trim();
            trimmed.rsplit_once('@').map_or(trimmed, |(base, _)| base.trim())
        })
        .collect::<HashSet<_>>();
    if selected.contains("") || !selected.is_subset(&known) {
        return Err(invalid("checkout selected identities"));
    }
    proof::verify(&record.proofs)?;
    proof::verify(&input.read_set)?;
    record.repository.validate()?;
    record.proofs.extend(input.read_set);
    record.targets.retain(|target| target_identity(target).is_some_and(|id| selected.contains(id)));
    record.request.defer_checkout_pattern = false;
    Ok((record.targets.len(), json!({"token":record.token,"targets":record.targets})))
}

/// Extracts the bare `<scope>/<name>` identity from a checkout `target` JSON object.
#[inline]
fn target_identity(target: &Value) -> Option<&str> {
    target["identity"]
        .as_str()
        .or_else(|| target["id"].as_str())
        .map(str::trim)
        .map(|raw| raw.rsplit_once('@').map_or(raw, |(base, _)| base.trim()))
        .filter(|id| !id.is_empty())
}
