use super::{Record, history, invalid};
use serde_json::Value;
use std::io;
pub(super) fn replay(
    record: &mut Record,
    identity: &str,
    model: Option<&Value>,
    remote: Option<&str>,
    selected: &Value,
    histories: &mut history::State,
) -> io::Result<()> {
    let Some(model) = model else {
        return Ok(());
    };
    let head = super::super::lane_history::heads::source(
        &record.request.options,
        &record.context,
        identity,
        model,
    );
    let to = record.request.options.to.as_deref().map_or("", str::trim);
    let observations = selected["observations"]
        .as_array()
        .ok_or_else(|| invalid("command selection observations"))?;
    for stage in observations {
        if let Some(heads) = stage_heads(stage.as_str().map(str::trim), to, model, head, remote) {
            histories.distance(
                &record.request.root,
                identity,
                model,
                heads,
                &mut record.repository,
            )?;
        }
    }
    Ok(())
}

fn stage_heads<'a>(
    stage: Option<&str>,
    to: &str,
    model: &Value,
    head: Option<&'a str>,
    remote: Option<&'a str>,
) -> Option<[Option<&'a str>; 2]> {
    match stage {
        Some("resolveTarget") if to.starts_with("head~") => Some([head, None]),
        Some("resolveTarget") if resolves_heads(to, model, head, remote) => Some([head, remote]),
        Some("hasVersion") if crate::merge_history::hash(to).is_ok() => Some([head, None]),
        Some("mergePending") => Some([head, remote]),
        _ => None,
    }
}

fn resolves_heads(to: &str, model: &Value, head: Option<&str>, remote: Option<&str>) -> bool {
    let head = head
        .map(str::trim)
        .filter(|val| !val.is_empty());
    let remote = remote
        .map(str::trim)
        .filter(|val| !val.is_empty());
    let latest_without_tags = to == "latest"
        && model["versions"].as_object().is_none_or(serde_json::Map::is_empty)
        && model["orphanedVersions"].as_object().is_none_or(serde_json::Map::is_empty);
    (to == "head" || latest_without_tags) && head.is_some() && remote.is_some() && head != remote
}
