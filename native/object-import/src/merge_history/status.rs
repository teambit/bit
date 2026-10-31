use super::{graph, hash, invalid};
use serde_json::{Value, json};
use std::io;

/// Cached command histories are read-only here. An absent head requires the
/// canonical population/write checkpoint before a cold command can proceed.
pub(crate) fn distance(
    records: &Value,
    source: Option<&str>,
    target: Option<&str>,
) -> io::Result<Value> {
    let versions: Vec<graph::Version> =
        serde_json::from_value(records.clone()).map_err(io::Error::other)?;
    graph::validate(&versions)?;
    let source = source
        .map(|head| hash(head.trim()).map(|digest| crate::validate::hexadecimal(&digest)))
        .transpose()?;
    let target = target
        .map(|head| hash(head.trim()).map(|digest| crate::validate::hexadecimal(&digest)))
        .transpose()?;
    for head in [&source, &target].into_iter().flatten() {
        if !versions
            .iter()
            .any(|row| row.hash.trim().eq_ignore_ascii_case(head))
        {
            return Err(invalid("status history requires population"));
        }
    }
    match (source.as_deref(), target.as_deref()) {
        (Some(source), Some(target)) if source != target => {
            graph::diverge(&versions, source, target, false)
        }
        (Some(source), None) => Ok(
            json!({"sourceOnly":graph::subset(&versions, source, &[]),"targetOnly":[],"noCommon":false}),
        ),
        (None, Some(target)) => Ok(
            json!({"sourceOnly":[],"targetOnly":graph::subset(&versions, target, &[]),"noCommon":false}),
        ),
        _ => Ok(json!({"sourceOnly":[],"targetOnly":[],"noCommon":false})),
    }
}
