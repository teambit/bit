//! Lane-merge squash policy ([`Policy`], [`Model`], [`policy`], [`eligible`], [`rewrite`]) and parent/squashed-list mutation planning.

use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

/// Deserialized lane-merge squash policy input (`mergeSquashPolicy`).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Policy {
    source_only: Vec<String>,
    target_only: Vec<String>,
    common: Option<String>,
    detach_head: bool,
    current_lane_default: bool,
    current_parents: Option<Vec<String>>,
    #[serde(flatten)]
    model: Model,
}
/// Component model schema and `main`-head metadata for [`Policy`].
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    is_legacy: Option<bool>,
    main_head: Option<String>,
    main_model_known: bool,
}
/// Evaluates the lane-merge squash policy (`skip`, `requireVersion`, `requireMainModel`, or `rewrite`).
pub(super) fn policy(input: &Policy) -> io::Result<Value> {
    validate(input)?;
    if !eligible(input) {
        return Ok(json!({"action":"skip"}));
    }
    let Some(parents) = &input.current_parents else {
        return Ok(json!({"action":"requireVersion"}));
    };
    let common = input.common
        .as_deref()
        .map(str::trim)
        .filter(|val| !val.is_empty());
    if input.target_only.len() == 1 && common.is_some() && parents.len() == 1 {
        return Ok(json!({"action":"skip"}));
    }
    if common.is_none() && !input.current_lane_default && !input.model.main_model_known {
        return Ok(json!({"action":"requireMainModel"}));
    }
    rewrite(input, parents, common)
}
/// Returns `true` when `input` has divergent or detached target-only commits eligible for squashing.
fn eligible(input: &Policy) -> bool {
    if input.source_only.is_empty() {
        !input.target_only.is_empty()
    } else {
        !input.target_only.is_empty() && input.detach_head
    }
}
/// Computes the `rewrite` parent choice (`common`, `main`, or `none`) and parent list for `input`.
fn rewrite(input: &Policy, previous: &[String], common: Option<&str>) -> io::Result<Value> {
    let legacy = input.model.is_legacy.ok_or_else(|| invalid("missing Version schema policy"))?;
    let main_head = input.model.main_head
        .as_deref()
        .map(str::trim)
        .filter(|val| !val.is_empty());
    let (choice, parent) = if let Some(common) = common {
        ("common", Some(common))
    } else if !input.current_lane_default && main_head.is_some() {
        ("main", main_head)
    } else {
        ("none", None)
    };
    let previous_parents: Vec<_> = previous
        .iter()
        .map(|entry| entry.trim())
        .collect();
    let parents: Vec<&str> = match parent {
        Some(_) if legacy => previous_parents.clone(),
        Some(parent) => vec![parent],
        None => Vec::new(),
    };
    Ok(
        json!({"action":"rewrite","parentChoice":choice,"parents":parents,"previousParents":previous_parents}),
    )
}
fn validate(input: &Policy) -> io::Result<()> {
    for references in [&input.source_only, &input.target_only] {
        references_valid(references)?;
    }
    if let Some(parents) = &input.current_parents {
        references_valid(parents)?;
    }
    for reference in [&input.common, &input.model.main_head]
        .into_iter()
        .flatten()
        .map(|val| val.trim())
        .filter(|val| !val.is_empty())
    {
        hash(reference)?;
    }
    Ok(())
}
pub(super) fn references_valid(references: &[String]) -> io::Result<()> {
    if references.len() > 4096 {
        return Err(invalid("squash reference count limit"));
    }
    for reference in references {
        hash(reference.trim())?;
    }
    Ok(())
}
