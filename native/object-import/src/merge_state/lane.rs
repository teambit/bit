//! [`Lane`] head, visibility, and parent mutation planning ([`Plan`]) during snap/tag/merge operations.

use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(super) struct Plan {
    version: String,
    version_hash: String,
    is_legacy: bool,
    parent: Option<String>,
    #[serde(flatten)]
    lane: Lane,
    #[serde(flatten)]
    options: Options,
}
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Lane {
    existing_visible_head: Option<String>,
    model_head: Option<String>,
    existing_hidden: bool,
    explicit_hidden: Option<bool>,
    readme_same_name: bool,
    #[serde(rename = "removed")]
    _removed: bool,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Options {
    detach_head: bool,
    override_head: bool,
}

pub(super) fn plan(input: &Plan) -> io::Result<Value> {
    let has_visible_head = validate(input)?;
    let hidden =
        input.lane.explicit_hidden.unwrap_or(input.lane.existing_hidden && !has_visible_head);
    let mut output = json!({
        "bucket":if hidden {"hidden"} else {"visible"},
        "overrideUpdateDependents":hidden && !input.lane.existing_hidden,
        "updateReadme":input.lane.readme_same_name
    });
    if !input.is_legacy
        && let Some(parent) = input.parent
            .as_deref()
            .map(str::trim)
            .filter(|parent| {
                !parent.is_empty() && !parent.eq_ignore_ascii_case(input.version.trim())
            })
    {
        output["parent"] = json!(parent);
    }
    Ok(output)
}
fn validate(input: &Plan) -> io::Result<bool> {
    hash(input.version.trim())?;
    hash(input.version_hash.trim())?;
    let has_parent = optional_hash(input.parent.as_deref())?;
    let has_visible_head = optional_hash(input.lane.existing_visible_head.as_deref())?;
    let has_model_head = optional_hash(input.lane.model_head.as_deref())?;
    if input.options.detach_head && input.options.override_head {
        return Err(invalid("conflicting lane head options"));
    }
    if !has_parent && (has_visible_head || has_model_head) {
        return Err(invalid("lane snapshot requires previous version"));
    }
    Ok(has_visible_head)
}

fn optional_hash(value: Option<&str>) -> io::Result<bool> {
    let Some(trimmed) = value
        .map(str::trim)
        .filter(|val| !val.is_empty())
    else {
        return Ok(false);
    };
    hash(trimmed)?;
    Ok(true)
}
