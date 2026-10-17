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
    let present = lane["components"]
        .as_array()
        .is_some_and(|components| {
            components
                .iter()
                .any(|component| {
                    component["id"] == readme["id"]
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
