//! Validate the canonical lane readme snap precondition.
use super::invalid;
use serde_json::Value;
use std::io;

pub(super) fn validate(lane: &Value, name: &str) -> io::Result<()> {
    let Some(readme) = lane
        .get("readmeComponent")
        .filter(|value| !value.is_null())
    else {
        return Ok(());
    };
    let readme_id = id_pair(&readme["id"]);
    let present = lane["components"]
        .as_array()
        .is_some_and(|components| {
            components
                .iter()
                .any(|component| {
                    (component["id"] == readme["id"]
                        || readme_id.is_some() && id_pair(&component["id"]) == readme_id)
                        && readme["head"]
                            .as_str()
                            .is_some_and(|head| !head.is_empty())
                        && component["head"] == readme["head"]
                })
        });
    if present {
        return Ok(());
    }
    Err(invalid(&format!("outbound lane {name} unsnapped readme requires canonical stack")))
}

fn id_pair(value: &Value) -> Option<(&str, &str)> {
    if let Some(raw) = value.as_str().map(str::trim) {
        return raw
            .rsplit_once('@')
            .map_or(raw, |(base, _)| base.trim())
            .split_once('/')
            .map(|(scope, name)| (scope.trim(), name.trim()));
    }
    Some((value["scope"].as_str()?.trim(), value["name"].as_str()?.trim()))
}
