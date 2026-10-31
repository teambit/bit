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
    validate(input)?;
    let hidden = input.lane.explicit_hidden.unwrap_or_else(|| {
        input.lane.existing_hidden && input.lane.existing_visible_head.is_none()
    });
    let mut output = json!({
        "bucket":if hidden {"hidden"} else {"visible"},
        "overrideUpdateDependents":hidden && !input.lane.existing_hidden,
        "updateReadme":input.lane.readme_same_name
    });
    if !input.is_legacy
        && let Some(parent) = input.parent
            .as_deref()
            .map(str::trim)
            .filter(|parent| !parent.eq_ignore_ascii_case(input.version.trim()))
    {
        output["parent"] = json!(parent);
    }
    Ok(output)
}
fn validate(input: &Plan) -> io::Result<()> {
    hash(input.version.trim())?;
    hash(input.version_hash.trim())?;
    for reference in [&input.parent, &input.lane.existing_visible_head, &input.lane.model_head]
        .into_iter()
        .flatten()
    {
        hash(reference.trim())?;
    }
    if input.options.detach_head && input.options.override_head {
        return Err(invalid("conflicting lane head options"));
    }
    if input.parent.is_none()
        && (input.lane.existing_visible_head.is_some() || input.lane.model_head.is_some())
    {
        return Err(invalid("lane snapshot requires previous version"));
    }
    Ok(())
}
