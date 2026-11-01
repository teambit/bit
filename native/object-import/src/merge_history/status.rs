use super::{graph, hash, invalid};
use serde_json::{Value, json};
use std::io;

/// Cached command histories are read-only here. An absent head requires the
/// canonical population/write checkpoint before a cold command can proceed.
#[inline]
pub(crate) fn distance(
    records: &Value,
    source: Option<&str>,
    target: Option<&str>,
) -> io::Result<Value> {
    let versions: Vec<graph::Version> =
        serde::Deserialize::deserialize(records).map_err(|_| invalid("status history records"))?;
    graph::validate(&versions)?;
    let source = source
        .map(str::trim)
        .filter(|head| !head.is_empty());
    let target = target
        .map(str::trim)
        .filter(|head| !head.is_empty());
    for head in [source, target].into_iter().flatten() {
        hash(head)?;
        if !versions
            .iter()
            .any(|row| row.hash.trim() == head)
        {
            return Err(invalid("status history requires population"));
        }
    }
    match (source, target) {
        (Some(source), Some(target)) => graph::diverge(&versions, source, target, false),
        (Some(source), None) => Ok(
            json!({"sourceOnly":graph::subset(&versions, source, &[]),"targetOnly":[],"noCommon":false}),
        ),
        (None, Some(target)) => Ok(
            json!({"sourceOnly":[],"targetOnly":graph::subset(&versions, target, &[]),"noCommon":false}),
        ),
        (None, None) => Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false})),
    }
}
