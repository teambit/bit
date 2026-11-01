use super::{hash, invalid};
use serde::Deserialize;
use serde_json::{Value, json};
use std::io;

#[derive(Deserialize)]
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
#[derive(Deserialize)]
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
#[derive(Deserialize)]
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
    for reference in [&input.parent, &input.lane.existing_visible_head, &input.lane.model_head]
        .into_iter()
        .flatten()
        .map(|val| val.trim())
        .filter(|val| !val.is_empty())
    {
        hash(reference)?;
    }
    if input.options.detach_head && input.options.override_head {
        return Err(invalid("conflicting lane head options"));
    }
    let has_parent = input.parent
        .as_deref()
        .is_some_and(|val| !val.trim().is_empty());
    let has_visible_head = input.lane.existing_visible_head
        .as_deref()
        .is_some_and(|val| !val.trim().is_empty());
    let has_model_head = input.lane.model_head
        .as_deref()
        .is_some_and(|val| !val.trim().is_empty());
    if !has_parent && (has_visible_head || has_model_head) {
        return Err(invalid("lane snapshot requires previous version"));
    }
    Ok(has_visible_head)
}
