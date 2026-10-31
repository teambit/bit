use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
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
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Model {
    is_legacy: Option<bool>,
    main_head: Option<String>,
    main_model_known: bool,
}
pub(super) fn policy(input: &Policy) -> io::Result<Value> {
    validate(input)?;
    if !eligible(input) {
        return Ok(json!({"action":"skip"}));
    }
    let Some(parents) = &input.current_parents else {
        return Ok(json!({"action":"requireVersion"}));
    };
    if input.target_only.len() == 1 && input.common.is_some() && parents.len() == 1 {
        return Ok(json!({"action":"skip"}));
    }
    if input.common.is_none() && !input.current_lane_default && !input.model.main_model_known {
        return Ok(json!({"action":"requireMainModel"}));
    }
    rewrite(input, parents)
}
fn eligible(input: &Policy) -> bool {
    if input.source_only.is_empty() {
        !input.target_only.is_empty()
    } else {
        !input.target_only.is_empty() && input.detach_head
    }
}
fn rewrite(input: &Policy, previous: &[String]) -> io::Result<Value> {
    let legacy = input.model.is_legacy.ok_or_else(|| invalid("missing Version schema policy"))?;
    let (choice, parent) = if let Some(common) = &input.common {
        ("common", Some(common))
    } else if !input.current_lane_default && input.model.main_head.is_some() {
        ("main", input.model.main_head.as_ref())
    } else {
        ("none", None)
    };
    let parents = match parent {
        Some(_) if legacy => previous.to_vec(),
        Some(parent) => vec![parent.trim().to_owned()],
        None => Vec::new(),
    };
    Ok(
        json!({"action":"rewrite","parentChoice":choice,"parents":parents,"previousParents":previous}),
    )
}
fn validate(input: &Policy) -> io::Result<()> {
    for references in [&input.source_only, &input.target_only] {
        references_valid(references)?;
    }
    if let Some(parents) = &input.current_parents {
        references_valid(parents)?;
    }
    for reference in [&input.common, &input.model.main_head].into_iter().flatten() {
        hash(reference.trim())?;
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
