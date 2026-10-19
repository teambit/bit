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
    let to = record.request.options.to.as_deref().unwrap_or_default();
    let observations = selected["observations"]
        .as_array()
        .ok_or_else(|| invalid("command selection observations"))?;
    for stage in observations {
        let heads = match stage.as_str() {
            Some("resolveTarget") if to.starts_with("head~") => Some([head, None]),
            Some("resolveTarget") if resolves_heads(to, model, head, remote) => {
                Some([head, remote])
            }
            Some("hasVersion") if crate::merge_history::hash(to).is_ok() => Some([head, None]),
            Some("mergePending") => Some([head, remote]),
            _ => None,
        };
        if let Some(heads) = heads {
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

fn resolves_heads(to: &str, model: &Value, head: Option<&str>, remote: Option<&str>) -> bool {
    let latest_without_tags =
        to == "latest" && model["versions"].as_object().is_none_or(serde_json::Map::is_empty);
    (to == "head" || latest_without_tags) && head.is_some() && remote.is_some() && head != remote
}
